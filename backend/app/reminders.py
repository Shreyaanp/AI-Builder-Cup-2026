"""Owner opt-in reminders. Scheduler retries use atomic per-device delivery leases."""

import asyncio
import hashlib
import time
from datetime import UTC, datetime, timedelta
from typing import Any

import anyio
import httpx
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator

from . import web_push
from .analytics import verify_scheduler
from .community import Documents
from .discover import open_now
from .limits import enforce_limits
from .merchant import MerchantRepository
from .merchant_routes import consented_owner, owner, store
from .region import shop_zone
from .reply_language import LANGUAGES
from .settings import Settings
from .shop_time import shop_timezone, valid_timezone

router = APIRouter(prefix="/api/v1", tags=["reminders"])
KIND = "push_subscriptions"
MAX_DEVICES = 5

# Keep these keys and locale codes aligned with the owner's i18n copy files and
# src/i18n/locales.ts. English is used only if an individual translation is absent.
PUSH_COPY: dict[str, dict[str, str]] = {
    "en": {"needsYouNow": "{count} things need you", "closeDay": "Close the day"},
    "hi": {"needsYouNow": "{count} कामों पर ध्यान दें", "closeDay": "दिन पूरा करें"},
    "ta": {"needsYouNow": "{count} விஷயங்களைக் கவனியுங்கள்", "closeDay": "நாளை முடிக்கவும்"},
    "zh-Hans": {"needsYouNow": "有{count}件事需要您处理", "closeDay": "结束今天"},
    "bn": {"needsYouNow": "{count}টি বিষয়ে নজর দিন", "closeDay": "দিন শেষ করুন"},
    "te": {"needsYouNow": "{count} విషయాలపై శ్రద్ధ పెట్టండి", "closeDay": "రోజును ముగించండి"},
    "mr": {"needsYouNow": "{count} गोष्टींकडे लक्ष द्या", "closeDay": "दिवस संपवा"},
    "kn": {"needsYouNow": "{count} ವಿಷಯಗಳತ್ತ ಗಮನ ನೀಡಿ", "closeDay": "ದಿನ ಮುಗಿಸಿ"},
    "ms": {"needsYouNow": "{count} perkara perlu perhatian anda", "closeDay": "Tutup hari ini"},
    "ja": {"needsYouNow": "{count}件の対応が必要です", "closeDay": "今日を締めくくる"},
    "ko": {"needsYouNow": "확인할 일이 {count}개 있어요", "closeDay": "오늘 마감하기"},
    "id": {"needsYouNow": "{count} hal perlu perhatian Anda", "closeDay": "Tutup hari ini"},
    "th": {"needsYouNow": "มี {count} เรื่องที่ต้องจัดการ", "closeDay": "ปิดวัน"},
    "vi": {"needsYouNow": "Có {count} việc cần bạn xử lý", "closeDay": "Kết thúc ngày"},
    "fil": {
        "needsYouNow": "May {count} bagay na kailangan mong asikasuhin",
        "closeDay": "Tapusin ang araw",
    },
}


def push_title(locale: str, kind: str, count: int) -> str:
    key = "needsYouNow" if kind == "morning" else "closeDay"
    english = PUSH_COPY["en"][key]
    template = PUSH_COPY.get(locale, {}).get(key, english)
    return template.format(count=count)


class PushKeys(BaseModel):
    model_config = ConfigDict(extra="forbid")
    p256dh: str = Field(max_length=100)
    auth: str = Field(max_length=32)

    @field_validator("p256dh", "auth")
    @classmethod
    def valid_key(cls, value: str, info: Any) -> str:
        raw = web_push.decode(value)
        if info.field_name == "auth":
            if len(raw) != 16:
                raise ValueError("Invalid subscription")
        else:
            if len(raw) != 65:
                raise ValueError("Invalid subscription")
            ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), raw)
        return value


class Subscription(BaseModel):
    model_config = ConfigDict(extra="forbid")
    endpoint: str = Field(max_length=2048)
    keys: PushKeys
    # The browser serializes this optional field; no server expiration is inferred from it.
    expirationTime: float | None = None

    @field_validator("endpoint")
    @classmethod
    def valid_endpoint(cls, value: str) -> str:
        if not web_push.valid_endpoint(value):
            raise ValueError("Unsupported push service")
        return value


class ReminderInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    business_id: str = Field(min_length=1, max_length=80)
    locale: str = "en"
    subscription: Subscription

    @field_validator("locale")
    @classmethod
    def supported_locale(cls, value: str) -> str:
        if value not in LANGUAGES:
            raise ValueError("Unsupported locale")
        return value


class ReminderStatus(BaseModel):
    enabled: bool
    public_key: str
    subscriptions: list[str]


class ReminderResult(BaseModel):
    ok: bool = True


class SendResult(BaseModel):
    sent: int = 0
    expired: int = 0
    failed: int = 0


def subscription_id(endpoint: str) -> str:
    return hashlib.sha256(endpoint.encode()).hexdigest()


def save(docs: Documents, uid: str, body: ReminderInput) -> None:
    sid = subscription_id(body.subscription.endpoint)

    def change(current: dict[str, Any] | None) -> tuple[float, dict[str, Any]]:
        entries = dict((current or {}).get("entries", {}))
        if sid not in entries and len(entries) >= MAX_DEVICES:
            raise HTTPException(409, "Remove a reminder device first.")
        previous = entries.get(sid, {})
        entries[sid] = {**body.model_dump(), "deliveries": previous.get("deliveries", {})}
        return time.time(), {"entries": entries}

    docs.update(KIND, uid, uid, change)


def remove(docs: Documents, uid: str, sid: str) -> None:
    def change(current: dict[str, Any] | None) -> tuple[float, dict[str, Any]] | None:
        if current is None:
            return None
        entries = dict(current.get("entries", {}))
        entries.pop(sid, None)
        return time.time(), {"entries": entries}

    docs.update(KIND, uid, uid, change)


@router.get("/reminders", response_model=ReminderStatus)
async def status(request: Request) -> ReminderStatus:
    uid = await owner(request)
    settings: Settings = request.app.state.v1_settings
    current = await anyio.to_thread.run_sync(store(request).feature_docs.get, KIND, uid)
    enabled = web_push.configured(settings)
    return ReminderStatus(
        enabled=enabled,
        public_key=settings.web_push_public_key if enabled else "",
        subscriptions=list((current or {}).get("entries", {})),
    )


@router.put("/reminders", response_model=ReminderResult)
async def subscribe(body: ReminderInput, request: Request) -> ReminderResult:
    uid = await consented_owner(request)
    await enforce_limits(request, [("owner:write", uid)])
    if not web_push.configured(request.app.state.v1_settings):
        raise HTTPException(503, "Reminders are off.")
    repository = store(request)
    await anyio.to_thread.run_sync(repository.context, uid, body.business_id)
    await anyio.to_thread.run_sync(save, repository.feature_docs, uid, body)
    return ReminderResult()


@router.delete("/reminders/{sid}", response_model=ReminderResult)
async def unsubscribe(sid: str, request: Request) -> ReminderResult:
    uid = await owner(request)
    await anyio.to_thread.run_sync(remove, store(request).feature_docs, uid, sid)
    return ReminderResult()


def due(fields: dict[str, Any], now: datetime) -> tuple[str, str] | None:
    """Find an opening/closing transition in the last 15 minutes, including overnight/DST.

    Reuse the authoritative hours parser. Unknown hours, closed days and equal 24h ranges
    have no transition, so never invent a time. The UTC walk also covers DST gaps and folds.
    """
    zone = shop_zone(fields)
    if not valid_timezone(zone):
        return None
    local = now.astimezone(shop_timezone(zone))
    if fields.get("closed_on") == local.date().isoformat():
        return None
    tick = now.astimezone(UTC).replace(second=0, microsecond=0)
    for offset in range(15):
        point = tick - timedelta(minutes=offset)

        def is_open(at: datetime) -> bool | None:
            return open_now(
                fields.get("hours", ""),
                zone,
                at,
                fields.get("weekly_hours"),
                fields.get("closed_on"),
            )

        before, after = is_open(point - timedelta(minutes=1)), is_open(point)
        if before is False and after is True:
            return "morning", point.astimezone(shop_timezone(zone)).date().isoformat()
        if before is True and after is False:
            return "evening", point.astimezone(shop_timezone(zone)).date().isoformat()
    return None


def attention(repository: MerchantRepository, uid: str, bid: str, context: dict[str, Any]) -> int:
    waiting = sum(
        1
        for q in repository.recap_signals(uid, bid)["questions"]
        if not q.get("done")
        and q.get("status") != "closed"
        and next(
            (m["author"] for m in reversed(q.get("messages") or []) if m.get("kind") != "ai"),
            "customer",
        )
        == "customer"
    )
    low = sum(1 for p in context["inventory"] if p.get("stock") is not None and p["stock"] <= 5)
    return waiting + low


def claim(docs: Documents, uid: str, sid: str, kind: str, day: str, now: float) -> bool:
    acquired = False

    def change(current: dict[str, Any] | None) -> tuple[float, dict[str, Any]] | None:
        nonlocal acquired
        acquired = False  # Firestore may retry this callback.
        if not current or sid not in current.get("entries", {}):
            return None
        entry = current["entries"][sid]
        previous = entry.get("deliveries", {}).get(kind, {})
        if previous.get("day") == day and (previous.get("sent") or previous.get("until", 0) > now):
            return None
        entry.setdefault("deliveries", {})[kind] = {"day": day, "until": now + 120, "sent": False}
        acquired = True
        return now, current

    docs.update(KIND, uid, uid, change)
    return acquired


def finish(docs: Documents, uid: str, sid: str, kind: str, day: str, sent: bool) -> None:
    def change(current: dict[str, Any] | None) -> tuple[float, dict[str, Any]] | None:
        if not current or sid not in current.get("entries", {}):
            return None  # Never resurrect an unsubscribed device.
        entry = current["entries"][sid]
        entry.setdefault("deliveries", {})[kind] = {"day": day, "until": 0, "sent": sent}
        return time.time(), current

    docs.update(KIND, uid, uid, change)


async def dispatch(repository: MerchantRepository, settings: Settings, now: datetime) -> SendResult:
    result = SendResult()
    # Bounded work; refuse oversized scans rather than silently skip later owners.
    shops = await anyio.to_thread.run_sync(repository.analytics_shops, 1001)
    if len(shops) > 1000:
        raise HTTPException(503, "Reminder scan requires pagination.")
    docs = repository.feature_docs
    for uid in dict.fromkeys(uid for uid, _ in shops):
        current = await anyio.to_thread.run_sync(docs.get, KIND, uid) or {}
        for sid, entry in current.get("entries", {}).items():
            bid = entry["business_id"]
            try:
                context = await anyio.to_thread.run_sync(repository.context, uid, bid)
            except HTTPException as error:
                if error.status_code != 404:
                    raise
                await anyio.to_thread.run_sync(remove, docs, uid, sid)
                continue
            event = due(context["business"]["fields"], now)
            if event is None:
                continue
            kind, day = event
            n = (
                await anyio.to_thread.run_sync(attention, repository, uid, bid, context)
                if kind == "morning"
                else 0
            )
            if kind == "morning" and n == 0:
                continue
            if not await anyio.to_thread.run_sync(
                claim, docs, uid, sid, kind, day, now.timestamp()
            ):
                continue
            title = push_title(entry.get("locale", "en"), kind, n)
            payload = {
                "title": title,
                "tag": f"reminder-{bid}-{kind}-{day}",
                "kind": kind,
                "business_id": bid,
                "url": "/?app=business",
            }
            try:
                code = await web_push.send(settings, entry["subscription"], payload)
            except (httpx.HTTPError, ValueError):
                code = 503
            if code in (404, 410):
                await anyio.to_thread.run_sync(remove, docs, uid, sid)
                result.expired += 1
            else:
                success = 200 <= code < 300
                await anyio.to_thread.run_sync(finish, docs, uid, sid, kind, day, success)
                if success:
                    result.sent += 1
                else:
                    result.failed += 1
    return result


@router.post("/internal/reminders/send", response_model=SendResult)
async def send_reminders(request: Request) -> SendResult:
    settings: Settings = request.app.state.v1_settings
    if not web_push.configured(settings):
        raise HTTPException(404, "Not found.")
    await verify_scheduler(
        request, settings, caller=settings.reminders_caller, audience=settings.reminders_audience
    )
    try:
        async with asyncio.timeout(150):
            return await dispatch(store(request), settings, datetime.now(UTC))
    except TimeoutError:
        raise HTTPException(503, "Reminder run timed out.") from None
