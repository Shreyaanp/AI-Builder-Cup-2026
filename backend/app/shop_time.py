"""Singapore's fixed offset also works on Windows without an installed IANA database."""

from datetime import UTC, timedelta, timezone, tzinfo
from zoneinfo import ZoneInfo


def shop_timezone(name: str) -> tzinfo:
    if name == "Asia/Singapore":
        return timezone(timedelta(hours=8))
    if name == "UTC":
        return UTC
    return ZoneInfo(name)
