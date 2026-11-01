"""Public demo: the real owner app on a private, expiring sandbox. No account, no live services.

Each visitor gets a throwaway SQLite store seeded with the tour shop (Lantern Chai Corner and its
WhatsApp wholesaler) plus the labelled chains. Owner API calls are forwarded to the real routes
with the sandbox as the merchant store and offline copies of every paid service. Only an
allowlist of reads and local writes runs, so every owner feature works here (OB-248). Only what
would touch the real world (a face check, voice, deleting an account, reviewer tools) answers
DEMO_NOT_SENT, and the app shows a plain "this is pretend" note for it.
"""

import hashlib
import hmac
import json
import re
import sqlite3
import time
from collections.abc import AsyncIterator, Sequence
from dataclasses import dataclass, field, replace
from datetime import date
from pathlib import Path
from secrets import token_urlsafe
from tempfile import TemporaryDirectory
from typing import Annotated, Any
from uuid import uuid4

import anyio
import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from itsdangerous import URLSafeTimedSerializer
from pydantic import BaseModel, ConfigDict, Field
from sse_starlette import EventSourceResponse
from starlette.datastructures import State
from starlette.types import Receive, Scope, Send

from .auth import Principal
from .community import Community
from .demo_chains import CHAINS
from .demo_data import SHOPS
from .demo_sessions import KIND, repository, restore_files, save
from .demo_supplier import settle as settle_supplier_replies
from .demo_uploads import demo_upload, is_upload
from .limits import Bucket, RateLimiter, client_ip, local_test_rate_limit_bypass
from .merchant import MerchantStore
from .merchant_routes import LEGAL_VERSION
from .passport import PassportStore
from .tour_catalogue import TOUR_SHOPS
from .tour_story import (
    SEED_OWNER,
    seed_shop,
    seed_wholesaler,
    seed_workspace,
)
from .tour_story import (
    seed_supply as seed_tour_supply,
)

router = APIRouter(prefix="/api/v1/demo/sessions")
TTL_SECONDS = 900
MAX_SESSIONS = 128
# New sandboxes per network address. Judges often share one office or venue address, and one
# visitor reuses a sandbox per tab, so these allow a room of people without inviting abuse.
OPEN_PER_MINUTE = 10
OPEN_PER_HOUR = 200
MAX_COACH_TURNS = 40
# Grow reloads several tiles per sheet. These reads use offline services, so allow normal
# exploration without consuming the live owner's hourly budget; still bound sandbox traffic.
READ_PER_MINUTE = 600
CHAIN_OWNER = "demo-world-owner"

_ID = r"[A-Za-z0-9_.-]{1,120}"
_BIZ = rf"businesses/{_ID}"
log = structlog.get_logger()
SUPPLY_READ = re.compile(rf"^businesses/(?P<bid>{_ID})/supply(?:/.*)?$")
# Reads and writes that stay inside the sandbox store.
ALLOWED: tuple[tuple[str, re.Pattern[str]], ...] = tuple(
    (method, re.compile(f"^(?:{pattern})$"))
    for method, pattern in (
        ("GET", "businesses"),
        ("GET", rf"{_BIZ}(?:/{_ID}){{0,4}}"),
        ("GET", rf"demo/chain/{_ID}"),
        ("GET", "reminders/?"),
        ("GET", "trust"),
        # O-4: the address under a map pin. The demo's maps service has no key, so these are
        # answered offline from the area list (never a paid Maps call).
        ("GET", "places/(?:reverse|pin)"),
        ("POST", "proposals"),
        ("POST", rf"proposals/{_ID}/approve"),
        ("POST", rf"{_BIZ}/inventory/{_ID}/(?:availability|source)"),
        ("POST", rf"{_BIZ}/(?:share|sort-menu|update)"),
        ("PUT", rf"{_BIZ}/perks"),
        ("DELETE", rf"{_BIZ}/notes/{_ID}"),
        # Files added to the gallery or icon are answered in demo_uploads; these only rearrange.
        ("DELETE", rf"{_BIZ}/gallery/{_ID}"),
        ("POST", rf"{_BIZ}/gallery/{_ID}/(?:cover|kind)"),
        ("DELETE", rf"{_BIZ}/icon"),
        ("POST", rf"{_BIZ}/connect/(?:analyze|mapping|sync)"),
        ("POST", rf"{_BIZ}/connect/live/{_ID}/{_ID}"),
        ("POST", rf"{_BIZ}/google-sim(?:/reset)?"),
        ("POST", rf"{_BIZ}/freshness/confirm"),
        ("POST", rf"{_BIZ}/import/{_ID}/approve"),
        ("POST", rf"{_BIZ}/day/(?:read|prepare)"),
        ("POST", rf"{_BIZ}/supply/reorder"),
        ("POST", rf"{_BIZ}/supply/demo/next"),
        ("POST", rf"{_BIZ}/supply/(?:inbound|send-all)"),
        ("POST", rf"{_BIZ}/supply/inbox/{_ID}/dismiss"),
        (
            "POST",
            rf"{_BIZ}/supply/orders/{_ID}/"
            r"(?:accept|approve|asn|cancel|change|fix|inbound|receipt|received|send|simulate)",
        ),
        ("POST", rf"{_BIZ}/supply/orders/{_ID}/flags/{_ID}"),
        ("POST", rf"{_BIZ}/supply/suppliers/{_ID}/rules/confirm"),
        ("PUT", rf"{_BIZ}/supply/suppliers/{_ID}/rules"),
        ("POST", rf"{_BIZ}/orders/{_ID}/(?:read|received|discard|send|cancel|change|messages)"),
        ("POST", rf"{_BIZ}/inquiries/{_ID}/(?:read|messages|done|complete|block|unblock)"),
        ("POST", rf"{_BIZ}/inquiries/{_ID}/messages/{_ID}/translation"),
        ("POST", rf"{_BIZ}/rescue(?:/{_ID}/approve)?"),
        ("DELETE", rf"{_BIZ}/rescue/{_ID}"),
        ("POST", rf"{_BIZ}/planning/{_ID}/(?:decision|approve|observations|demo|forecast)"),
        ("PATCH", rf"{_BIZ}/playbook(?:/items/{_ID})?"),
        ("DELETE", rf"{_BIZ}/playbook/items/{_ID}"),
        ("POST", rf"{_BIZ}/playbook/regenerate"),
    )
)


class SandboxStore(MerchantStore):
    """Every handle closes when its `with` block ends, so the session's files can be removed."""

    def connect(self) -> sqlite3.Connection:
        db = sqlite3.connect(self.path, timeout=10, factory=ClosingConnection)
        db.row_factory = sqlite3.Row
        return db


class ClosingConnection(sqlite3.Connection):
    def __exit__(self, *exc: Any) -> Any:
        try:
            return super().__exit__(*exc)
        finally:
            self.close()


@dataclass
class DemoSession:
    expires: float
    reads: dict[str, Any]
    uid: str = ""
    bid: str = ""
    store: MerchantStore | None = None
    directory: TemporaryDirectory[str] | None = None
    coach: str | None = None
    turns: int = 0
    reminders: dict[str, Any] = field(default_factory=dict)
    revision: int = 0

    def close(self) -> None:
        if self.directory is not None:
            self.directory.cleanup()
            self.directory = None


def sessions(request: Request) -> dict[str, DemoSession]:
    if not request.app.state.v1_settings.public_demo_enabled:
        raise HTTPException(404, "DEMO_DISABLED")
    saved: dict[str, DemoSession] = getattr(request.app.state, "public_demos", {})
    request.app.state.public_demos = saved
    for key in list(saved):
        if saved[key].expires <= time.time():
            saved.pop(key).close()
    return saved


def sandbox(zone: str) -> tuple[DemoSession, date]:
    """The visitor's own filled owner workspace and the customer-side snapshot."""
    from .sales import today_for

    directory = TemporaryDirectory(prefix="chalkboard-demo-", ignore_cleanup_errors=True)
    try:
        store = SandboxStore(str(Path(directory.name) / "demo.sqlite3"))
        uid = f"public-demo-{token_urlsafe(8)}"
        bid, _ = seed_workspace(store, uid, "bengaluru", label="")
        tour_shop = next(shop for shop in TOUR_SHOPS if shop.city == "bengaluru")
        day = today_for(tour_shop.fields.model_dump())
        seed_shop(store, SEED_OWNER, tour_shop, day)
        seed_tour_supply(store, SEED_OWNER, tour_shop, day)
        seed_wholesaler(store, tour_shop, day)
        # The chains show the larger channels: CSV to a distributor, SAP IDoc with an FMCG firm.
        from .demo_supply_seed import seed_shop as seed_chain_supply

        for chain in CHAINS:
            store.seed_demo_shop(CHAIN_OWNER, chain.id, chain.fields, chain.products)
            store.attach_demo_owner(CHAIN_OWNER, chain.id, uid)
            seed_chain_supply(store, CHAIN_OWNER, chain.id)
        store.record_consent(uid, LEGAL_VERSION)
        business = store.context(uid, bid)["business"]
        # One "(Demo)" label, never "(Demo) (Demo)" or "(Demo) (Tour)".
        business["fields"]["name"] = re.sub(
            r"(\s*\((?:Demo|Tour)\))+$", " (Demo)", business["fields"]["name"]
        )
        today = today_for(business["fields"])
        # The customer walk-through collects a stamp at Lantern Chai Corner in Bengaluru.
        # Keep the browse list in that same market regardless of the visitor's time zone.
        city = "bengaluru"
        shops = [shop for shop in SHOPS if shop.city == city]
        reads: dict[str, Any] = {
            "/shops": [{"id": shop.id, "name": shop.fields.name} for shop in shops]
        }
        for shop in shops:
            fields = shop.fields.model_dump()
            reads[f"/public/shops/{shop.id}"] = {
                **fields,
                "id": shop.id,
                "demo": True,
                "stamps_enabled": True,
                "reward_text": fields.get("reward_text") or "Free item after 8 visits",
                "phone": "",
                "products": [p.model_dump() for p in shop.products],
                "facts": fields,
            }
    except BaseException:
        directory.cleanup()
        raise
    entry = DemoSession(0, reads, uid, bid, store, directory)
    return entry, today


async def open_workspace(request: Request, zone: str) -> dict[str, Any]:
    saved = sessions(request)
    # Always enforce this public allocation limit, even when owner limits are disabled locally.
    retry = 0
    if not local_test_rate_limit_bypass(request):
        try:
            retry = await anyio.to_thread.run_sync(
                request.app.state.rate_limiter.take,
                [
                    Bucket("public-demo", client_ip(request), OPEN_PER_MINUTE, 60),
                    Bucket("public-demo", client_ip(request), OPEN_PER_HOUR, 3600),
                ],
                time.time(),
            )
        except Exception:
            retry = 60
    if retry:
        raise HTTPException(429, "RATE_LIMITED", headers={"Retry-After": str(retry)})
    await anyio.to_thread.run_sync(repository(request).purge_before, KIND, time.time())
    # Reserve before yielding so concurrent allocations cannot exceed the memory bound.
    if len(saved) >= MAX_SESSIONS:
        raise HTTPException(429, "DEMO_BUSY", headers={"Retry-After": "60"})
    key = token_urlsafe(24)
    saved[key] = DemoSession(time.time() + TTL_SECONDS, {})
    try:
        entry, _today = await anyio.to_thread.run_sync(sandbox, zone)
    except BaseException:
        saved.pop(key, None)
        raise
    entry.expires = saved[key].expires
    if key in saved:
        saved[key] = entry
    else:
        entry.close()
    try:
        await anyio.to_thread.run_sync(lambda: save(repository(request), key, entry, create=True))
    except BaseException:
        saved.pop(key, None)
        entry.close()
        raise
    return {"session_id": key, "expires_at": entry.expires}


def restore(docs: Any, session_id: str) -> DemoSession:
    """The visitor's sandbox as last saved, in a fresh directory of its own."""
    data = docs.get(KIND, session_id)
    if not data or data["expires"] <= time.time():
        raise HTTPException(410, "DEMO_EXPIRED")
    directory = TemporaryDirectory(prefix="chalkboard-demo-", ignore_cleanup_errors=True)
    try:
        store = SandboxStore(restore_files(data, directory.name))
        return DemoSession(
            data["expires"],
            data["reads"],
            data["uid"],
            data["bid"],
            store,
            directory,
            turns=data["turns"],
            reminders=data["reminders"],
            revision=data["revision"],
        )
    except BaseException:
        directory.cleanup()
        raise


async def live(request: Request, session_id: str) -> AsyncIterator[DemoSession]:
    prior = getattr(request.app.state, "public_demos", {}).get(session_id)
    if prior is not None and prior.expires <= time.time():
        await anyio.to_thread.run_sync(repository(request).delete, KIND, session_id)
    saved = sessions(request)
    # Local mode keeps its cache for developer previews. Hosted requests always
    # restore the shared revision, including writes made by another instance.
    cached = saved.get(session_id)
    hosted = request.app.state.v1_settings.merchant_backend == "firestore"
    if cached is not None and not hosted:
        yield cached
        return

    entry = await anyio.to_thread.run_sync(restore, repository(request), session_id)
    try:
        yield entry
    finally:
        entry.close()


@router.get("/{session_id}")
async def read_demo(
    session_id: str,
    request: Request,
    response: Response,
    entry: Annotated[DemoSession, Depends(live)],
    path: str = Query(max_length=256),
) -> Any:
    """Customer-side snapshot reads (the owner side goes through /api/...)."""
    response.headers["Cache-Control"] = "no-store"
    if path not in entry.reads:
        raise HTTPException(403, "DEMO_READ_ONLY")
    return entry.reads[path]


@router.delete("/{session_id}")
async def exit_demo(session_id: str, request: Request) -> dict[str, bool]:
    entry = sessions(request).pop(session_id, None)
    if entry:
        entry.close()
    await anyio.to_thread.run_sync(repository(request).delete, KIND, session_id)
    return {"exited": True}


class DemoIdentity:
    """Every owner call in the sandbox is the visitor's throwaway owner; nothing else."""

    def __init__(self, uid: str, secret: bytes) -> None:
        self.uid = uid
        # QR keys and stamp receipts in the sandbox sign with a key of its own (OB-52), so a demo
        # QR can never stamp a real shop.
        self.signer = URLSafeTimedSerializer(secret, salt="public-demo")

    async def require(self, _request: Request) -> Principal:
        return Principal(self.uid, "public-demo")

    async def require_customer(self, _request: Request) -> Principal:
        raise HTTPException(403, "DEMO_NOT_SENT")


def demo_secret(app: Any) -> bytes:
    """The sandbox's signing key: derived from the app's, never equal to it."""
    key = app.state.services.identity.signer.secret_key
    key = key if isinstance(key, bytes) else str(key).encode()
    return hmac.new(key, b"public-demo", hashlib.sha256).digest()


class DemoReadLimiter:
    """A session's offline reads get their own budget; all other limits pass through."""

    def __init__(self, delegate: RateLimiter) -> None:
        self.delegate = delegate

    def take(self, buckets: Sequence[Bucket], now: float) -> int:
        # Both live owner windows become one sandbox window. Deduplicate so each request
        # consumes one read, and keep the sandbox owner UID as the session-specific subject.
        scoped = dict.fromkeys(
            Bucket("public-demo-read", bucket.subject, READ_PER_MINUTE, 60)
            if bucket.action == "owner:read"
            else bucket
            for bucket in buckets
        )
        return self.delegate.take(list(scoped), now)

    def close(self) -> None:
        # The app lifespan owns the shared delegate; a sandbox must never close it.
        pass


class SandboxApp:
    """The real app with the sandbox state: routes read `request.app.state` from here."""

    def __init__(self, app: Any, state: State) -> None:
        self._app = app
        self.state = state

    def __getattr__(self, name: str) -> Any:
        return getattr(self._app, name)


def offline(app: Any) -> dict[str, Any]:
    """Offline copies of every service that could call a paid API, built once per app."""
    cached: dict[str, Any] | None = getattr(app.state, "demo_offline", None)
    if cached is not None:
        return cached
    from .analytics import AnalyticsReader
    from .brief import BriefWriter, WeatherService
    from .business_profile import QuestionPlanner
    from .customer import CustomerAnswers
    from .discover import MapsService
    from .forecast import ForecastService
    from .fraud import FraudReviewer
    from .google_profile import SimulatedBusinessProfile
    from .imports import ColumnMapper
    from .photos import PhotoPipeline
    from .playbook import PlaybookWriter
    from .recap import RecapWriter
    from .sap_sandbox import SapSandbox
    from .sourcing import SupplierGenerator
    from .supply_docs import DocumentTranslator

    settings = app.state.v1_settings.model_copy(
        update={
            "coach_mode": "offline",
            "forecast_backend": "weekday_average",
            "document_ai_enabled": False,
            "analytics_backend": "live",
            "pos_live": "offline",
            "weather_backend": "offline",
            "web_push_enabled": False,
            "search_embeddings": "fixture",
            "search_explanations": False,
            "moderation_mode": "fixture",
            "media_bucket": "",
            "maps_grounding": "off",
            "shop_icon_ai": False,
            "supply_sap_live": False,
            "instant_embeddings": False,
            "context_cache_enabled": False,
            "gemini_context_cache": False,
            "maps_server_key": None,
            "maps_browser_key": None,
            "face_mode": "fixture",
            "rate_limits_enabled": True,
        }
    )
    cached = {
        "v1_settings": settings,
        "forecaster": ForecastService(settings),
        "question_planner": QuestionPlanner(settings),
        "supplier_generator": SupplierGenerator(settings),
        "supply_translator": DocumentTranslator(settings),
        "weather": WeatherService(settings),
        "brief_writer": BriefWriter(settings),
        "recap_writer": RecapWriter(settings),
        "playbook_writer": PlaybookWriter(settings),
        "analytics": AnalyticsReader(settings),
        "sap_sandbox": SapSandbox(settings),
        "photos": PhotoPipeline(settings),
        "maps": MapsService(settings),
        "column_mapper": ColumnMapper(settings),
        "fraud_reviewer": FraudReviewer(settings),
        "customer_answers": CustomerAnswers(settings),
        "google_profile": SimulatedBusinessProfile(),
        "document_ai": None,
        "day_genai": None,
        "recall": None,
    }
    app.state.demo_offline = cached
    return cached


class Forward(Response):
    """Runs the real route for the sandbox scope and streams its response unchanged."""

    def __init__(self, scope: Scope, request: Request, entry: DemoSession, key: str) -> None:
        super().__init__()
        self.inner = scope
        self.request = request
        self.entry = entry
        self.key = key

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        async def persist(message: Any) -> None:
            if message["type"] == "http.response.start":
                message["headers"].append((b"cache-control", b"no-store"))
                if self.request.method != "GET" and message["status"] < 400:
                    await anyio.to_thread.run_sync(
                        save, repository(self.request), self.key, self.entry
                    )
            await send(message)

        from .demo_context import services

        token = services.set(offline(scope["app"]))
        try:
            await scope["app"].router(self.inner, receive, persist)
        finally:
            services.reset(token)


def allowed(method: str, path: str) -> bool:
    if ".." in path or "//" in path:
        return False
    return any(method == m and pattern.match(path) for m, pattern in ALLOWED)


@router.api_route(
    "/{session_id}/api/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    include_in_schema=False,
)
async def owner_api(
    session_id: str, path: str, request: Request, entry: Annotated[DemoSession, Depends(live)]
) -> Any:
    method = request.method
    path = path.strip("/") if path != "reminders/" else path
    # Owner-app calls with a sandbox answer of their own.
    if method == "GET" and path == "bootstrap":
        return {"customer_origin": str(request.base_url).rstrip("/")}
    if method == "GET" and path == "conversations":
        return []
    if method == "POST" and path == "demo/workspace":
        return {"business_id": entry.bid, "created": False}
    if path in {"reminders", "reminders/demo"} and method in {"GET", "PUT", "DELETE"}:
        if method != "GET":
            await limit(request, "public-demo-write", 120)
        result = reminders(entry, method, await request.body())
        if method != "GET":
            await anyio.to_thread.run_sync(save, repository(request), session_id, entry)
        return result
    if is_upload(method, path):
        # O-1: menu photos and files get a labelled sample read; the file is never read by AI.
        await limit(request, "public-demo-write", 120)
        result = await demo_upload(request, entry, path)
        await anyio.to_thread.run_sync(save, repository(request), session_id, entry)
        return result
    if path.startswith("reminders/") and method == "DELETE":
        # A reminder here has no push subscription behind it: this only clears the demo's own.
        await limit(request, "public-demo-write", 120)
        result = reminders(entry, method, b"")
        await anyio.to_thread.run_sync(save, repository(request), session_id, entry)
        return result
    if not allowed(method, path):
        raise HTTPException(403, "DEMO_NOT_SENT")
    if method != "GET":
        await limit(request, "public-demo-write", 120)
    app = request.scope["app"]
    if method == "GET" and (supply := SUPPLY_READ.match(path)):
        await deliver_replies(request, entry, session_id, supply["bid"])
    state = State({**app.state._state, **offline(app)})
    state.rate_limiter = DemoReadLimiter(app.state.rate_limiter)
    state.merchant = entry.store
    # Tips, updates, perks and listing reviews stay in the sandbox too: a route (or the check that
    # follows a saved change) must never write a visitor's demo into the shared community store.
    assert entry.store is not None
    state.community = Community(entry.store.feature_docs)
    state.passport = PassportStore(entry.store.feature_docs)
    state.services = replace(app.state.services, identity=DemoIdentity(entry.uid, demo_secret(app)))
    inner = dict(request.scope)
    for key in ("route", "endpoint", "path_params", "router"):
        inner.pop(key, None)
    target = f"/api/v1/{path}"
    inner.update(
        path=target,
        raw_path=target.encode(),
        root_path="",
        app=SandboxApp(app, state),
        headers=[
            (k, v) for k, v in request.scope["headers"] if k not in (b"authorization", b"cookie")
        ],
    )
    return Forward(inner, request, entry, session_id)


async def deliver_replies(request: Request, entry: DemoSession, session_id: str, bid: str) -> None:
    """The demo supplier's replies that are due arrive with the read that asks for them.

    This writes during a GET, so it must never fail the read. On the hosted path each request
    restores its own copy: when reads overlap only one save wins, and the others answer from the
    winner's copy instead of a 409. A sandbox at its size limit still shows the reply, unsaved.
    """
    from .demo_context import services

    docs = repository(request)
    for _attempt in range(3):
        assert entry.store is not None
        token = services.set(offline(request.scope["app"]))
        try:
            changed = await settle_supplier_replies(entry.store, entry.uid, bid)
        finally:
            services.reset(token)
        if not changed:
            return
        try:
            await anyio.to_thread.run_sync(save, docs, session_id, entry)
            return
        except HTTPException as error:
            if error.status_code != 409:
                log.info("demo_supplier_reply_unsaved", status=error.status_code)
                return
        # Another request saved first: carry on from its copy, which may already hold the reply.
        try:
            latest = await anyio.to_thread.run_sync(restore, docs, session_id)
        except HTTPException:
            return
        entry.close()
        entry.store, entry.directory = latest.store, latest.directory
        entry.revision, entry.turns, entry.reminders = (
            latest.revision,
            latest.turns,
            latest.reminders,
        )


def reminders(entry: DemoSession, method: str, body: bytes) -> Any:
    """Reminder times are kept for this demo only; no push subscription is ever made."""
    if method == "PUT":
        try:
            value = json.loads(body or b"{}")
        except ValueError:
            raise HTTPException(422, "Invalid reminder.") from None
        if not isinstance(value, dict) or len(body) > 4000:
            raise HTTPException(422, "Invalid reminder.")
        entry.reminders = {"subscriptions": ["demo"] if value.get("enabled", True) else []}
    if method == "DELETE":
        entry.reminders = {}
    return {"enabled": True, "public_key": "", "subscriptions": [], **entry.reminders, "demo": True}


async def limit(request: Request, name: str, per_ten_minutes: int) -> None:
    try:
        retry = await anyio.to_thread.run_sync(
            request.app.state.rate_limiter.take,
            [Bucket(name, client_ip(request), per_ten_minutes, 600)],
            time.time(),
        )
    except Exception:
        retry = 60
    if retry:
        raise HTTPException(429, "RATE_LIMITED", headers={"Retry-After": str(retry)})


class DemoTurn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    message: str = Field(min_length=1, max_length=500)
    language: str = Field(default="en", pattern=r"^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,3}$")
    currency: str | None = Field(default=None, pattern=r"^[A-Z]{3}$")
    business_id: str | None = Field(default=None, max_length=120)


def coach_runtime(app: Any) -> Any:
    """The offline coach (instant answers + fixture model); never a paid model call."""
    runtime = getattr(app.state, "demo_coach", None)
    if runtime is None:
        from google.adk.sessions import InMemorySessionService

        from .streaming import CoachRuntime

        runtime = CoachRuntime(offline(app)["v1_settings"], InMemorySessionService())
        app.state.demo_coach = runtime
    return runtime


@router.post("/{session_id}/coach")
async def demo_coach(
    session_id: str, body: DemoTurn, request: Request, entry: Annotated[DemoSession, Depends(live)]
) -> EventSourceResponse:
    await limit(request, "public-demo-coach", 30)
    entry.turns += 1
    if entry.turns > MAX_COACH_TURNS:
        raise HTTPException(429, "RATE_LIMITED", headers={"Retry-After": "600"})
    await anyio.to_thread.run_sync(save, repository(request), session_id, entry)
    from .coordinator import MerchantContext, current

    runtime = coach_runtime(request.scope["app"])
    principal = Principal(entry.uid, "public-demo")
    bid = body.business_id or entry.bid
    store = entry.store
    assert store is not None
    await anyio.to_thread.run_sync(store.context, entry.uid, bid)
    if entry.coach is None:
        entry.coach = await runtime.session(principal, None, bid)
    sid = entry.coach
    turn = str(uuid4())

    async def frames() -> Any:
        from .demo_context import services

        service_token = services.set(offline(request.scope["app"]))
        token = current.set(MerchantContext(store, entry.uid, bid, [], body.message))
        sequence = 0
        try:
            from .contracts import StreamEvent

            events = [StreamEvent(kind="ready", session_id=sid, mode="offline")]
            for event in events:
                sequence += 1
                yield frame(turn, sequence, event)
            async for event in runtime.text_events(
                principal, sid, body.message, body.language, body.currency
            ):
                if event.kind == "turn_complete":
                    await anyio.to_thread.run_sync(save, repository(request), session_id, entry)
                sequence += 1
                yield frame(turn, sequence, event)
        finally:
            current.reset(token)
            services.reset(service_token)

    return EventSourceResponse(
        frames(), headers={"X-Accel-Buffering": "no", "Cache-Control": "no-store"}
    )


def frame(turn: str, sequence: int, event: Any) -> dict[str, str]:
    return {
        "event": "coach",
        "id": f"{turn}:{sequence}",
        "data": json.dumps(event.payload(), ensure_ascii=False),
    }
