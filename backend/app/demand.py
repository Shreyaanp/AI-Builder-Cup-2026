"""Private demand capture and k=5 radius aggregates. Real and demo kinds never mix."""

from __future__ import annotations

import hashlib
import hmac
import secrets
from collections import defaultdict
from datetime import UTC, date, datetime, timedelta
from typing import TYPE_CHECKING, Any, Literal

from pydantic import BaseModel

from .community import Documents
from .demand_terms import inferred_category, normalise
from .discover import CATEGORIES, distance
from .sourcing import shop_pin

if TYPE_CHECKING:
    from .discover_ask import Intent
    from .merchant import MerchantRepository

ALPHABET = "0123456789bcdefghjkmnpqrstuvwxyz"
DAY = 86400


def cell_for(lat: float, lng: float, precision: int = 6) -> str:
    bounds = [[-180.0, 180.0], [-90.0, 90.0]]
    value = bits = 0
    result = ""
    for i in range(precision * 5):
        axis = i % 2
        midpoint = sum(bounds[axis]) / 2
        high = (lng if axis == 0 else lat) >= midpoint
        value = value * 2 + int(high)
        bounds[axis][0 if high else 1] = midpoint
        bits += 1
        if bits == 5:
            result += ALPHABET[value]
            value = bits = 0
    return result


def cell_point(cell: str) -> tuple[float, float]:
    bounds = [[-180.0, 180.0], [-90.0, 90.0]]
    i = 0
    for char in cell:
        for bit in range(4, -1, -1):
            axis = i % 2
            high = bool(ALPHABET.index(char) & (1 << bit))
            bounds[axis][0 if high else 1] = sum(bounds[axis]) / 2
            i += 1
    return sum(bounds[1]) / 2, sum(bounds[0]) / 2


def scopes(lat: float, lng: float) -> set[str]:
    # Precision-four scopes cover ~20 km. Neighbours include edges and the date line.
    return {
        cell_for(max(-89.999, min(89.999, lat + dy)), (lng + dx + 180) % 360 - 180, 4)
        for dy in (-0.18, 0, 0.18)
        for dx in (-0.36, 0, 0.36)
    }


def actor_for(docs: Documents, identity: str, now: datetime) -> str:
    day = now.astimezone(UTC).date().isoformat()
    start = datetime.combine(now.astimezone(UTC).date(), datetime.min.time(), UTC).timestamp()
    docs.purge_before("demand_salt", start)
    salt = secrets.token_hex(32)
    docs.update("demand_salt", day, "rotation", lambda old: (start, old or {"salt": salt}))
    saved = docs.get("demand_salt", day)
    assert saved is not None
    return hmac.new(bytes.fromhex(saved["salt"]), identity.encode(), hashlib.sha256).hexdigest()


def capture(
    docs: Documents,
    intent: Intent,
    lat: float,
    lng: float,
    identity: str,
    matched_local: int,
    matched_google: int | None,
    now: datetime,
) -> None:
    docs.purge_before("demand_real", now.timestamp() - 30 * DAY)
    terms = normalise(intent.keywords)
    if not terms:
        return
    cell = cell_for(lat, lng)
    # Use the salt's UTC day, so changing a client timezone cannot multiply actor-days.
    day = now.astimezone(UTC).date().isoformat()
    actor = actor_for(docs, identity, now)
    row = {
        "cell": cell,
        "day": day,
        "terms": terms,
        "category": intent.category
        if intent.category in CATEGORIES and intent.category
        else inferred_category(terms),
        "part": "morning" if now.hour < 12 else "afternoon" if now.hour < 17 else "evening",
        "max_price_band": None
        if intent.max_price is None
        else "under10"
        if intent.max_price < 10
        else "10–49"
        if intent.max_price < 50
        else "50+",
        "constraints": [
            key for key in ("halal", "vegetarian", "locally_made") if getattr(intent, key)
        ],
        "matched_local": matched_local,
        "matched_google": matched_google,
        "actor": actor,
        "demo": False,
    }
    key = hashlib.sha256(repr([cell, day, actor, terms, row["constraints"]]).encode()).hexdigest()
    docs.put(
        "demand_real",
        key,
        cell[:4],
        datetime.combine(date.fromisoformat(day), datetime.min.time(), UTC).timestamp(),
        row,
    )


class Opportunity(BaseModel):
    key: str
    label: str
    band: Literal["5–9", "10–19", "20+"]
    unmet_share: float
    google_count: int | None
    fit: float
    demo: bool


class Radar(BaseModel):
    area_label: str
    approximate: bool
    radius: int = 2000
    days: int = 14
    minimum_askers: int = 5
    demo: bool
    opportunities: list[Opportunity]


def category_of(text: str) -> str:
    return next(
        (key for key, (_, names) in CATEGORIES.items() if any(n in text.casefold() for n in names)),
        text.casefold(),
    )


def radar(store: MerchantRepository, uid: str, bid: str, now: datetime | None = None) -> Radar:
    now = now or datetime.now(UTC)
    context = store.context(uid, bid)
    fields = context["business"]["fields"]
    pin = shop_pin(fields)
    docs = store.feature_docs
    docs.purge_before("demand_real", now.timestamp() - 30 * DAY)
    grouped: dict[tuple[str, bool], list[dict[str, Any]]] = defaultdict(list)
    sold = {term for p in context["inventory"] for term in normalise([p["name"]])}
    for demo in (False, True):
        for scope in scopes(pin.lat, pin.lng):
            for row in docs.scoped("demand_demo" if demo else "demand_real", scope, 500):
                age = (now.date() - date.fromisoformat(row["day"])).days
                if not 0 <= age < 14 or distance(pin.lat, pin.lng, *cell_point(row["cell"])) > 2000:
                    continue
                for term in row["terms"]:
                    key = "|".join([term, *row.get("constraints", [])])
                    if term not in sold:
                        grouped[key, demo].append(row)
    ideas: list[tuple[float, Opportunity]] = []
    for (key, demo), rows in grouped.items():
        distinct = len({(r["actor"], r["day"]) for r in rows})
        unmet = sum(r["matched_local"] == 0 for r in rows) / len(rows)
        if distinct < 5 or unmet < 0.6:
            continue
        own = category_of(fields.get("category", ""))
        category = rows[0]["category"]
        food = {"bakery", "coffee", "food", "grocery"}
        fit = 1.0 if own == category else 0.6 if own in food and category in food else 0.2
        asks = sum(0.5 ** ((now.date() - date.fromisoformat(r["day"])).days / 7) for r in rows)
        idea = Opportunity(
            key=key,
            label=" ".join(reversed(key.split("|"))),
            band="20+" if distinct >= 20 else "10–19" if distinct >= 10 else "5–9",
            unmet_share=round(unmet, 3),
            google_count=max(
                (r["matched_google"] for r in rows if r["matched_google"] is not None), default=None
            ),
            fit=fit,
            demo=demo,
        )
        ideas.append((asks * unmet * fit, idea))
    ideas.sort(key=lambda row: (-row[0], row[1].key, row[1].demo))
    return Radar(
        area_label="your shop",
        approximate=pin.approximate,
        demo=any(i.demo for _, i in ideas),
        opportunities=[i for _, i in ideas[:20]],
    )


def seed_demo_signals(
    store: MerchantRepository, lat: float, lng: float, now: datetime | None = None
) -> None:
    now = now or datetime.now(UTC)
    docs = store.feature_docs
    docs.purge_before("demand_demo", now.timestamp() - 30 * DAY)
    cell = cell_for(lat, lng)
    # Stable actor-days: repeated world loads refresh the window without manufacturing volume.
    for term, count, category in (
        ("cake|eggless", 24, "bakery"),
        ("sourdough", 14, "bakery"),
        ("oat milk coffee", 8, "coffee"),
    ):
        for index in range(count):
            day = (now.date() - timedelta(days=index % 7)).isoformat()
            row = {
                "cell": cell,
                "day": day,
                "terms": [term],
                "category": category,
                "constraints": [],
                "matched_local": 0,
                "matched_google": 0,
                "actor": f"demo-{index}",
                "demo": True,
            }
            key = f"{cell}:{term}:{index}"
            docs.put("demand_demo", key, cell[:4], now.timestamp(), row)
