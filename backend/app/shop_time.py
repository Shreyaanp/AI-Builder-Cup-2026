"""Shop timezones. The bundled ``tzdata`` package makes every IANA zone work on any OS."""

from contextvars import ContextVar
from datetime import UTC, timedelta, timezone, tzinfo
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

# The phone's own timezone for this request (``X-Client-Timezone``); only a brand-new shop
# uses it as its default, so existing shops never change underneath their owner.
client_timezone: ContextVar[str | None] = ContextVar("client_timezone", default=None)


def shop_timezone(name: str) -> tzinfo:
    if name == "Asia/Singapore":
        return timezone(timedelta(hours=8))
    if name == "UTC":
        return UTC
    return ZoneInfo(name)


def valid_timezone(name: str | None) -> str | None:
    if not name or len(name) > 100:
        return None
    try:
        shop_timezone(name)
    except (ZoneInfoNotFoundError, ValueError):
        return None
    return name
