"""Neighbourhood passport routes: stamps, the passport view, merge, rescues, perks and the board.

Signed-in customers keep their passport on the server. Signed-out visitors get a signed visit
receipt per verified scan; the phone keeps those receipts ("on this phone"), the preview route
draws the same passport from them, and they merge once on sign-in.
"""

from __future__ import annotations

import hashlib
import time
from datetime import date
from typing import Any, Literal

import anyio
import structlog
from fastapi import APIRouter, HTTPException, Request
from itsdangerous import BadSignature, URLSafeTimedSerializer
from pydantic import BaseModel, ConfigDict, Field

from .auth import Principal
from .community_routes import community, customer, display_name, identity
from .customer_routes import shared
from .discover import distance
from .limits import client_ip, enforce_limits
from .merchant_routes import owner, store
from .passport import (
    CO2_KG_PER_MEAL,
    LEVELS,
    MAX_RECEIPT_AGE,
    LevelKey,
    Outcome,
    PassportState,
    PassportStore,
    Quest,
    QuestStop,
    Requirement,
    StampRecord,
    Streak,
    Visit,
    apply_helpful,
    apply_rescue,
    apply_tip,
    apply_visit,
    claim_card,
    demo_residents,
    display,
    flagged,
    geohash,
    is_food,
    local_now,
    member_id,
    next_level,
    qr_key,
    quest_definitions,
    quest_progress,
    requirements,
    shop_area,
    shop_country,
    shop_progress,
    streak,
    valid_qr_key,
    week_of,
)
from .rescue_feed import find_rescue

log = structlog.get_logger()
router = APIRouter(prefix="/api/v1")
MAX_RECEIPTS = 60
NEARBY_M = 1500


def passports(request: Request) -> PassportStore:
    service = getattr(request.app.state, "passport", None)
    if service is None:
        service = PassportStore(community(request).docs)
        request.app.state.passport = service
    return service


def secret(request: Request) -> bytes:
    key = identity(request).signer.secret_key
    return key if isinstance(key, bytes) else str(key).encode()


def receipt_signer(request: Request) -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(secret(request), salt="passport-receipt")


async def is_owner(request: Request, uid: str, bid: str) -> bool:
    """An owner's own account earns no points at their shop."""
    try:
        await anyio.to_thread.run_sync(store(request).inquiries, uid, bid)
    except HTTPException:
        return False
    except Exception:
        return False
    return True


# --- Contracts ---


class StampInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    shop_id: str = Field(min_length=1, max_length=80)
    key: str = Field(default="", max_length=40)
    lat: float | None = Field(default=None, ge=-90, le=90, allow_inf_nan=False)
    lng: float | None = Field(default=None, ge=-180, le=180, allow_inf_nan=False)
    accuracy: float | None = Field(default=None, ge=0, le=100_000, allow_inf_nan=False)


class PublicStampInput(StampInput):
    # This phone's earlier receipts: a signed-out scan is judged against them (already today,
    # first visit, daily cap, level), though nothing is stored.
    receipts: list[str] = Field(default_factory=list, max_length=MAX_RECEIPTS)


class RescueStampInput(StampInput):
    rescue_id: str = Field(min_length=1, max_length=160)


class MergeInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    receipts: list[str] = Field(default_factory=list, max_length=MAX_RECEIPTS)
    # Shop-card stamps kept on this phone without a receipt (location was off): card only.
    cards: dict[str, int] = Field(default_factory=dict, max_length=100)


class LevelView(BaseModel):
    key: LevelKey
    next: LevelKey | None
    # The single next thing to do ("2 more shops to Regular"), then the full list.
    next_requirement: Requirement | None
    requirements: list[Requirement]


class ShopStamp(BaseModel):
    id: str
    name: str
    area: str
    area_name: str
    category: str
    demo: bool
    visits: int
    days: int
    card: int
    claimed: int
    rescues: int
    last_day: str


class AreaView(BaseModel):
    id: str
    name: str
    shops: int
    stamps: int
    demo: bool


class Impact(BaseModel):
    meals: int
    co2_kg: float
    saved: dict[str, int]


class PerkView(BaseModel):
    shop_id: str
    shop_name: str
    id: str
    trigger: Literal["regular", "full_card", "quest_finale", "rescue_hero"]
    text: str
    demo: bool


class PassportView(BaseModel):
    signed_in: bool
    device_only: bool = False
    points: int
    demo_points: int
    total: int
    level: LevelView
    streak: Streak
    stamps: list[StampRecord]
    shops: list[ShopStamp]
    areas: list[AreaView]
    quests: list[Quest]
    impact: Impact
    perks: list[PerkView]
    leaderboard: bool
    flagged: bool = False


class StampResult(BaseModel):
    outcome: Outcome
    passport: PassportView | None = None
    # Signed-out visitors keep this on the phone; it merges on sign-in.
    receipt: str | None = None


class QrKey(BaseModel):
    key: str
    demo: bool = False


class BoardRow(BaseModel):
    rank: int
    name: str
    level: LevelKey
    points: int
    stamps: int
    demo: bool = False
    you: bool = False


class Board(BaseModel):
    area: str
    week: str
    joined: bool
    rows: list[BoardRow]
    you: BoardRow | None = None


class Perk(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    id: str = Field(min_length=1, max_length=40, pattern=r"^[a-z0-9-]+$")
    trigger: Literal["regular", "full_card", "quest_finale", "rescue_hero"]
    text: str = Field(min_length=3, max_length=80)
    active: bool = True


class PerkList(BaseModel):
    model_config = ConfigDict(extra="forbid")
    perks: list[Perk] = Field(default_factory=list, max_length=8)


# --- View ---


def demo_perks(shop: dict[str, Any]) -> list[dict[str, Any]]:
    """Demo shops offer a fixed demo perk so the unlock can be shown; labelled demo."""
    return [
        {"id": "demo-regular", "trigger": "regular", "text": "Free upgrade on your next order"},
        {
            "id": "demo-card",
            "trigger": "full_card",
            "text": str(shop.get("reward_text") or "A small treat on the house")[:80],
        },
        {"id": "demo-rescue", "trigger": "rescue_hero", "text": "First pick of tomorrow's bake"},
    ]


async def perk_views(request: Request, state: PassportState) -> list[PerkView]:
    service = passports(request)
    views: list[PerkView] = []
    recent = sorted(state.shops.items(), key=lambda kv: kv[1].days[-1:] or [""], reverse=True)
    regular = LEVELS.index(state.level) >= 1
    for bid, progress in recent[:30]:
        shop = await anyio.to_thread.run_sync(store(request).public_shop, bid)
        if shop is None:
            continue
        perks = await anyio.to_thread.run_sync(service.perks, bid)
        if not perks and shop.get("demo"):
            perks = demo_perks(shop)
        needed = int(shop.get("stamps_needed") or 8)
        for perk in perks:
            if perk.get("active") is False:
                continue
            trigger = perk["trigger"]
            unlocked = (
                (trigger == "regular" and regular and len(progress.days) >= 2)
                or (trigger == "full_card" and progress.card >= needed)
                or (trigger == "quest_finale" and bid in state.finale_shops)
                or (trigger == "rescue_hero" and progress.rescues >= 3)
            )
            if unlocked:
                views.append(
                    PerkView(
                        shop_id=bid,
                        shop_name=progress.name,
                        id=perk["id"],
                        trigger=trigger,
                        text=perk["text"],
                        demo=bool(shop.get("demo")),
                    )
                )
    return views


async def nearby_shops(request: Request, lat: float | None, lng: float | None) -> list[dict]:
    if lat is None or lng is None:
        return []
    shops = await anyio.to_thread.run_sync(store(request).shared_shops)
    near = [
        (distance(lat, lng, s["lat"], s["lng"]), s)
        for s in shops
        if s.get("lat") is not None and s.get("lng") is not None and not s.get("supplier")
    ]
    return [s for d, s in sorted(near, key=lambda pair: pair[0]) if d <= NEARBY_M]


def quest_views(state: PassportState, today: date, nearby: list[dict[str, Any]]) -> list[Quest]:
    countries = {c for s in nearby if (c := shop_country(s))} | {
        s.country for s in state.shops.values() if s.country
    }
    views = []
    for quest in quest_definitions(today, countries):
        have, done_shops = quest_progress(state, quest)
        kind = quest["kind"]
        if kind == "crawl":
            pool = [s for s in nearby if is_food(str(s.get("category") or ""))]
        elif kind == "makers":
            pool = [s for s in nearby if not is_food(str(s.get("category") or ""))]
        elif kind == "festival":
            themes = quest.get("themes", ())
            local = [s for s in nearby if shop_country(s) == quest["country"]]
            pool = sorted(
                local,
                key=lambda s: not any(t in str(s.get("category", "")).casefold() for t in themes),
            )
        else:
            pool = []
        stops = [
            QuestStop(
                shop_id=s["id"],
                name=s["name"],
                done=s["id"] in done_shops,
                demo=bool(s.get("demo")),
            )
            for s in pool[: max(quest["need"] + 1, 4)]
        ]
        views.append(
            Quest(
                id=quest["id"],
                kind=kind,
                festival=quest.get("festival"),
                art=quest.get("art"),
                have=min(have, quest["need"]),
                need=quest["need"],
                points=quest["points"],
                ends=quest["end"].isoformat(),
                done=quest["id"] in state.quests_done,
                approximate=kind == "festival",
                stops=stops,
            )
        )
    return views


async def build_view(
    request: Request,
    state: PassportState,
    *,
    signed_in: bool,
    lat: float | None = None,
    lng: float | None = None,
    timezone: str = "UTC",
    device_only: bool = False,
) -> PassportView:
    now = time.time()
    today = local_now(timezone, now).date()
    level = state.level
    upcoming = next_level(level)
    reqs = requirements(state, upcoming) if upcoming else []
    nearby = await nearby_shops(request, lat, lng)
    shops = [
        ShopStamp(
            id=bid,
            name=p.name,
            area=p.area,
            area_name=p.area_name,
            category=p.category,
            demo=p.demo,
            visits=p.visits,
            days=len(p.days),
            card=p.card,
            claimed=p.claimed,
            rescues=p.rescues,
            last_day=(p.days or [""])[-1],
        )
        for bid, p in sorted(state.shops.items(), key=lambda kv: kv[1].days[-1:], reverse=True)
    ]
    areas: dict[str, AreaView] = {}
    for shop in shops:
        if not shop.area:
            continue
        area = areas.setdefault(
            shop.area,
            AreaView(id=shop.area, name=shop.area_name, shops=0, stamps=0, demo=True),
        )
        area.shops += 1
        area.stamps += shop.days
        area.demo = area.demo and shop.demo
        area.name = area.name or shop.area_name
    meals = sum(p.rescues for p in state.shops.values())
    return PassportView(
        signed_in=signed_in,
        device_only=device_only,
        points=state.points,
        demo_points=state.demo_points,
        total=state.points + state.demo_points,
        level=LevelView(
            key=level,
            next=upcoming,
            next_requirement=next((r for r in reqs if not r.met), None),
            requirements=reqs,
        ),
        streak=streak(state, week_of(today)),
        stamps=state.stamps[:60],
        shops=shops,
        areas=list(areas.values()),
        quests=quest_views(state, today, nearby),
        impact=Impact(
            meals=meals, co2_kg=round(meals * CO2_KG_PER_MEAL, 1), saved=state.rescue_saved
        ),
        perks=await perk_views(request, state),
        leaderboard=state.leaderboard,
        flagged=flagged(state, now),
    )


# --- Board helpers ---


async def post_board(request: Request, principal: Principal, state: PassportState) -> None:
    if not state.leaderboard or flagged(state, time.time()):
        return
    service = passports(request)
    week = week_of(local_now("UTC", time.time()).date())
    stamps_by_area: dict[str, int] = {}
    for record in state.stamps:
        if record.week == week and record.area:
            stamps_by_area[record.area] = stamps_by_area.get(record.area, 0) + 1
    for area, weeks in state.week_points.items():
        points = weeks.get(week, 0)
        if not points:
            continue
        row = {
            "name": display(display_name(principal)),
            "points": points,
            "level": state.level,
            "stamps": stamps_by_area.get(area, 0),
            "demo": False,
            "at": time.time(),
        }
        await anyio.to_thread.run_sync(service.post_board, principal.uid, area, week, row)


# --- QR keys ---


@router.get("/businesses/{business_id}/qr-key", response_model=QrKey)
async def owner_qr_key(business_id: str, request: Request) -> QrKey:
    uid = await owner(request)
    await anyio.to_thread.run_sync(store(request).inquiries, uid, business_id)
    return QrKey(key=qr_key(secret(request), business_id))


@router.get("/public/shops/{business_id}/demo-qr", response_model=QrKey)
async def demo_qr_key(business_id: str, request: Request) -> QrKey:
    """Demo shops show their QR on screen for the demo, so their key is public."""
    shop = await shared(request, business_id)
    if not shop.get("demo"):
        raise HTTPException(404, "Only demo shops show a demo QR.")
    return QrKey(key=qr_key(secret(request), business_id), demo=True)


# --- Stamps ---


async def verified_visit(
    request: Request, body: StampInput, uid: str | None
) -> tuple[dict[str, Any], Visit]:
    shop = await shared(request, body.shop_id)
    if not valid_qr_key(secret(request), body.shop_id, body.key):
        raise HTTPException(403, "BAD_QR_KEY")
    own = bool(uid) and await is_owner(request, uid or "", body.shop_id)
    return shop, Visit(
        shop_id=body.shop_id,
        shop=shop,
        at=time.time(),
        lat=body.lat,
        lng=body.lng,
        accuracy=body.accuracy,
        own_shop=own,
    )


@router.post("/customer/passport/stamps", response_model=StampResult)
async def stamp(body: StampInput, request: Request) -> StampResult:
    principal = await customer(request)
    await enforce_limits(request, [("passport", principal.uid)], anonymous=True)
    shop, visit = await verified_visit(request, body, principal.uid)
    service = passports(request)
    state, outcome = await anyio.to_thread.run_sync(
        service.edit, principal.uid, lambda s: apply_visit(s, visit)
    )
    await post_board(request, principal, state)
    log.info("passport_stamp", verdict=outcome.verdict, demo=outcome.demo)
    return StampResult(
        outcome=outcome,
        passport=await build_view(
            request,
            state,
            signed_in=True,
            lat=body.lat,
            lng=body.lng,
            timezone=str(shop.get("timezone") or "UTC"),
        ),
    )


@router.post("/public/passport/check", response_model=StampResult)
async def check(body: PublicStampInput, request: Request) -> StampResult:
    """Signed-out scan: the same checks, a signed receipt for the phone, nothing stored. The
    phone's earlier receipts are replayed first, so a second scan today is not a first visit."""
    await enforce_limits(request, [("passport", client_ip(request))], anonymous=True)
    shop, visit = await verified_visit(request, body, None)
    state = PassportState()
    for _, earlier in await receipt_visits(request, body.receipts):
        apply_visit(state, earlier)
    outcome = apply_visit(state, visit)
    receipt = None
    if outcome.verdict == "stamped":
        receipt = receipt_signer(request).dumps(
            {"b": body.shop_id, "t": visit.at, "la": body.lat, "ln": body.lng, "a": body.accuracy}
        )
    return StampResult(outcome=outcome, receipt=receipt)


async def receipt_visits(request: Request, receipts: list[str]) -> list[tuple[str, Visit]]:
    signer = receipt_signer(request)
    found: list[tuple[str, Visit]] = []
    shops: dict[str, dict[str, Any] | None] = {}
    for receipt in list(dict.fromkeys(receipts))[:MAX_RECEIPTS]:
        try:
            data = signer.loads(receipt, max_age=MAX_RECEIPT_AGE)
        except BadSignature:
            continue
        if not isinstance(data, dict) or not isinstance(data.get("b"), str):
            continue
        bid = data["b"]
        if bid not in shops:
            shops[bid] = await anyio.to_thread.run_sync(store(request).public_shop, bid)
        shop = shops[bid]
        if shop is None:
            continue
        found.append(
            (
                hashlib.sha256(receipt.encode()).hexdigest(),
                Visit(
                    shop_id=bid,
                    shop=shop,
                    at=float(data.get("t", 0)),
                    lat=data.get("la"),
                    lng=data.get("ln"),
                    accuracy=data.get("a"),
                ),
            )
        )
    found.sort(key=lambda pair: pair[1].at)
    return found


def apply_cards(state: PassportState, cards: dict[str, int], shops: dict[str, Any]) -> None:
    for bid, count in cards.items():
        shop = shops.get(bid)
        if shop is None or not isinstance(count, int) or count <= 0:
            continue
        progress = shop_progress(state, bid, shop)
        progress.card = max(progress.card, min(count, int(shop.get("stamps_needed") or 8)))


@router.post("/public/passport/preview", response_model=PassportView)
async def preview(
    body: MergeInput,
    request: Request,
    lat: float | None = None,
    lng: float | None = None,
    tz: str = "UTC",
) -> PassportView:
    """The passport drawn from this phone's receipts (signed out: "on this phone")."""
    await enforce_limits(request, [("discover", client_ip(request))], anonymous=True)
    state = PassportState()
    shops: dict[str, Any] = {}
    for _, visit in await receipt_visits(request, body.receipts):
        apply_visit(state, visit)
        shops[visit.shop_id] = visit.shop
    for bid in list(body.cards)[:100]:
        if bid not in shops:
            shops[bid] = await anyio.to_thread.run_sync(store(request).public_shop, bid)
    apply_cards(state, body.cards, {k: v for k, v in shops.items() if v})
    return await build_view(
        request, state, signed_in=False, device_only=True, lat=lat, lng=lng, timezone=tz
    )


@router.post("/customer/passport/merge", response_model=PassportView)
async def merge(
    body: MergeInput,
    request: Request,
    lat: float | None = None,
    lng: float | None = None,
    tz: str = "UTC",
) -> PassportView:
    """Once on sign-in: this phone's receipts are re-checked and each counts once, ever."""
    principal = await customer(request)
    await enforce_limits(request, [("passport", principal.uid)], anonymous=True)
    service = passports(request)
    fresh: list[Visit] = []
    shops: dict[str, Any] = {}
    for digest, visit in await receipt_visits(request, body.receipts):
        if await anyio.to_thread.run_sync(service.use_receipt, digest, principal.uid):
            fresh.append(visit)
        shops[visit.shop_id] = visit.shop
    for bid in list(body.cards)[:100]:
        if bid not in shops:
            shops[bid] = await anyio.to_thread.run_sync(store(request).public_shop, bid)
    owned = {bid for bid in shops if await is_owner(request, principal.uid, bid)}

    def edit(state: PassportState) -> None:
        for visit in fresh:
            visit.own_shop = visit.shop_id in owned
            apply_visit(state, visit)
        apply_cards(state, body.cards, {k: v for k, v in shops.items() if v})

    state, _ = await anyio.to_thread.run_sync(service.edit, principal.uid, edit)
    await post_board(request, principal, state)
    return await build_view(request, state, signed_in=True, lat=lat, lng=lng, timezone=tz)


@router.get("/customer/passport", response_model=PassportView)
async def passport(
    request: Request, lat: float | None = None, lng: float | None = None, tz: str = "UTC"
) -> PassportView:
    principal = await customer(request)
    state = await anyio.to_thread.run_sync(passports(request).get, principal.uid)
    return await build_view(request, state, signed_in=True, lat=lat, lng=lng, timezone=tz)


@router.delete("/customer/passport")
async def erase_passport(request: Request) -> dict[str, bool]:
    principal = await customer(request)
    await anyio.to_thread.run_sync(passports(request).erase, principal.uid)
    return {"deleted": True}


@router.post("/customer/passport/shops/{business_id}/claim", response_model=PassportView)
async def claim(business_id: str, request: Request) -> PassportView:
    """Counter staff saw the full card: it starts again."""
    principal = await customer(request)
    shop = await shared(request, business_id)
    needed = int(shop.get("stamps_needed") or 8)
    state, claimed = await anyio.to_thread.run_sync(
        passports(request).edit, principal.uid, lambda s: claim_card(s, business_id, needed)
    )
    if not claimed:
        raise HTTPException(409, "CARD_NOT_FULL")
    return await build_view(request, state, signed_in=True)


# --- Rescue collected (QR at pickup) ---


@router.post("/customer/passport/rescues", response_model=StampResult)
async def collect_rescue(body: RescueStampInput, request: Request) -> StampResult:
    """Scanning the shop QR during the pickup window collects the rescue: leaf stamp."""
    principal = await customer(request)
    await enforce_limits(request, [("passport", principal.uid)], anonymous=True)
    shop, visit = await verified_visit(request, body, principal.uid)
    now = time.time()
    deal = await find_rescue(request, shop, body.rescue_id, now)
    if deal is None or not deal.pickup_start - 15 * 60 <= now <= deal.pickup_end + 15 * 60:
        raise HTTPException(409, "RESCUE_NOT_ACTIVE")
    probe = apply_visit(PassportState(), visit)
    if probe.verdict != "stamped" or visit.own_shop:
        return StampResult(outcome=probe)
    state, outcome = await anyio.to_thread.run_sync(
        passports(request).edit,
        principal.uid,
        lambda s: apply_rescue(
            s, body.shop_id, shop, deal.id, now, max(0, deal.was_price - deal.price)
        ),
    )
    await post_board(request, principal, state)
    return StampResult(
        outcome=outcome,
        passport=await build_view(request, state, signed_in=True, lat=body.lat, lng=body.lng),
    )


async def award_rescue(
    request: Request, uid: str, business_id: str, rescue_id: str, saved_minor: int = 0
) -> Outcome:
    """For the owner's "Collected" tap in chat (rescue feature): the customer gets the stamp."""
    shop = await shared(request, business_id)
    _, outcome = await anyio.to_thread.run_sync(
        passports(request).edit,
        uid,
        lambda s: apply_rescue(s, business_id, shop, rescue_id, time.time(), saved_minor),
    )
    return outcome


async def award_tip(request: Request, uid: str, business_id: str, shop: dict[str, Any]) -> None:
    """A tip that passed moderation earns a pencil stamp (called by the tip route)."""
    if await is_owner(request, uid, business_id):
        return
    await anyio.to_thread.run_sync(
        passports(request).edit, uid, lambda s: apply_tip(s, business_id, shop, time.time())
    )


# --- Helpful tips ---


class Helpful(BaseModel):
    helpful: int


@router.post("/customer/shops/{business_id}/tips/{tip_id}/helpful", response_model=Helpful)
async def mark_helpful(business_id: str, tip_id: str, request: Request) -> Helpful:
    principal = await customer(request)
    shop = await shared(request, business_id)
    await enforce_limits(request, [("helpful", principal.uid)], anonymous=True)
    service = community(request)
    author, count = await anyio.to_thread.run_sync(
        service.mark_helpful, business_id, tip_id, principal.uid
    )
    if author:
        demo = bool(shop.get("demo"))
        await anyio.to_thread.run_sync(
            passports(request).edit, author, lambda s: apply_helpful(s, tip_id, demo)
        )
    return Helpful(helpful=count)


# --- Leaderboard (opt-in) ---


class BoardInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    on: bool


@router.put("/customer/passport/leaderboard", response_model=PassportView)
async def join_board(body: BoardInput, request: Request) -> PassportView:
    principal = await customer(request)
    service = passports(request)

    def edit(state: PassportState) -> None:
        state.leaderboard = body.on

    state, _ = await anyio.to_thread.run_sync(service.edit, principal.uid, edit)
    if body.on:
        await post_board(request, principal, state)
    else:
        for area in state.week_points:
            await anyio.to_thread.run_sync(service.leave_board, principal.uid, area)
    return await build_view(request, state, signed_in=True)


@router.get("/customer/passport/board", response_model=Board)
async def board(
    request: Request, area: str = "", lat: float | None = None, lng: float | None = None
) -> Board:
    principal = await customer(request)
    service = passports(request)
    state = await anyio.to_thread.run_sync(service.get, principal.uid)
    if not area and lat is not None and lng is not None:
        area = geohash(lat, lng)
    if not area:
        area = max(state.week_points, key=lambda a: sum(state.week_points[a].values()), default="")
    if not area or len(area) > 12:
        raise HTTPException(422, "Choose an area.")
    week = week_of(local_now("UTC", time.time()).date())
    rows = await anyio.to_thread.run_sync(service.board, area, week)
    me = member_id(principal.uid)
    entries = [{**row, "you": key == me} for key, row in rows.items()]
    nearby = await nearby_shops(request, lat, lng)
    demo_area = any(s.get("demo") for s in nearby) or any(
        p.demo for p in state.shops.values() if p.area == area
    )
    if demo_area:
        entries += [{**r, "you": False} for r in demo_residents(area, week)]
    if state.leaderboard and not any(e["you"] for e in entries):
        points = state.week_points.get(area, {}).get(week, 0)
        entries.append(
            {
                "name": display(display_name(principal)),
                "points": points,
                "level": state.level,
                "stamps": 0,
                "demo": False,
                "at": time.time(),
                "you": True,
            }
        )
    entries.sort(key=lambda e: (-e["points"], e["at"]))
    ranked = [
        BoardRow(
            rank=index + 1,
            name=e["name"] if (state.leaderboard or e.get("demo")) else "•••",
            level=e["level"],
            points=e["points"],
            stamps=e["stamps"],
            demo=bool(e.get("demo")),
            you=e["you"],
        )
        for index, e in enumerate(entries)
    ]
    you = next((r for r in ranked if r.you), None)
    return Board(area=area, week=week, joined=state.leaderboard, rows=ranked[:30], you=you)


# --- Perks the owner funds ---


@router.get("/businesses/{business_id}/perks", response_model=PerkList)
async def owner_perks(business_id: str, request: Request) -> PerkList:
    uid = await owner(request)
    await anyio.to_thread.run_sync(store(request).inquiries, uid, business_id)
    perks = await anyio.to_thread.run_sync(passports(request).perks, business_id)
    return PerkList(perks=[Perk.model_validate(p) for p in perks])


@router.put("/businesses/{business_id}/perks", response_model=PerkList)
async def save_perks(business_id: str, body: PerkList, request: Request) -> PerkList:
    uid = await owner(request)
    await anyio.to_thread.run_sync(store(request).inquiries, uid, business_id)
    if len({p.id for p in body.perks}) != len(body.perks):
        raise HTTPException(422, "Each perk needs its own ID.")
    await anyio.to_thread.run_sync(
        passports(request).save_perks, business_id, [p.model_dump() for p in body.perks]
    )
    return body


@router.get("/public/shops/{business_id}/perks", response_model=PerkList)
async def public_perks(business_id: str, request: Request) -> PerkList:
    shop = await shared(request, business_id)
    perks = await anyio.to_thread.run_sync(passports(request).perks, business_id)
    if not perks and shop.get("demo"):
        perks = demo_perks(shop)
    return PerkList(perks=[Perk.model_validate(p) for p in perks if p.get("active", True)])


__all__ = ["award_rescue", "award_tip", "router", "shop_area"]
