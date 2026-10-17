"""The shop's region: money, languages, payments, rides, tax and examples, from where it is.

One profile per country, shared with the app (src/region/regions.json, read by
src/region/region.ts too). An owner's region comes from the shop's pin; a customer's from their
area. Without a pin it falls back to the phone (its timezone, then its language region), then to
the shop's saved currency. An Indian shop is never shown SGD or PayNow, and a Singapore shop never
UPI or Rapido.
"""

from __future__ import annotations

import json
from contextvars import ContextVar
from dataclasses import dataclass
from functools import cache
from pathlib import Path
from typing import Any

from .money import exponent, to_major

# The phone's country from its Accept-Language region (en-IN → IN), set per request by
# boundary.py next to the X-Client-Timezone header.
client_country: ContextVar[str | None] = ContextVar("client_country", default=None)
# Scripts and tests send no phone signals at all; the offline test environment sets this to the
# demo market. Real phones always send a timezone.
NO_SIGNAL_COUNTRY: str | None = None

_HERE = Path(__file__).resolve().parent
# The container copies the file next to this module (see Dockerfile); a checkout reads src/.
_SOURCES = (_HERE / "regions.json", _HERE.parent.parent / "src" / "region" / "regions.json")


@cache
def _data() -> dict[str, Any]:
    for path in _SOURCES:
        if path.exists():
            data: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))
            return data
    raise FileNotFoundError("regions.json")


@dataclass(frozen=True)
class Region:
    country: str
    """ISO 3166 code; empty for the fallback."""
    name: str
    currency: str
    symbol: str
    number_locale: str
    timezone: str
    centre: tuple[float, float]
    languages: tuple[str, ...]
    payment_rail: str
    """upi (India), paynow (Singapore) or empty: the payment link the app can prepare."""
    payments: tuple[str, ...]
    delivery: tuple[str, ...]
    rides: tuple[str, ...]
    units: tuple[str, ...]
    tax: str
    tax_note: str
    ask_item: str
    ask_budget: float
    cheap: float
    examples: str

    @property
    def known(self) -> bool:
        return bool(self.country)


def _region(country: str, raw: dict[str, Any], currency: str = "") -> Region:
    return Region(
        country=country,
        name=raw["name"],
        currency=raw["currency"] or currency,
        symbol=raw["symbol"] or symbol(raw["currency"] or currency),
        number_locale=raw["number_locale"],
        timezone=raw["timezone"],
        centre=(raw["centre"][0], raw["centre"][1]),
        languages=tuple(raw["languages"]),
        payment_rail=raw["payment_rail"],
        payments=tuple(raw["payments"]),
        delivery=tuple(raw["delivery"]),
        rides=tuple(raw["rides"]),
        units=tuple(raw["units"]),
        tax=raw["tax"],
        tax_note=raw["tax_note"],
        ask_item=raw["ask_item"],
        ask_budget=raw["ask_budget"],
        cheap=raw["cheap"],
        examples=raw["examples"],
    )


def symbol(currency: str) -> str:
    return str(_data()["symbols"].get(currency.upper(), ""))


def currency_of(country: str | None) -> str | None:
    found = _data()["country_currency"].get((country or "").upper())
    return str(found) if found else None


def profile(country: str | None, currency: str = "") -> Region:
    """The profile of a country; the generic fallback (with the given or the country's currency)
    for countries without one."""
    code = (country or "").upper()
    raw = _data()["regions"].get(code)
    if raw:
        return _region(code, raw)
    return _region("", _data()["fallback"], currency or currency_of(code) or "USD")


def _inside(lat: float, lng: float, polygon: list[list[float]]) -> bool:
    """Ray casting on [lat, lng] vertices (fine at country scale away from the poles)."""
    found = False
    j = len(polygon) - 1
    for i, (y1, x1) in enumerate(polygon):
        y2, x2 = polygon[j]
        if (y1 > lat) != (y2 > lat) and lng < (x2 - x1) * (lat - y1) / (y2 - y1) + x1:
            found = not found
        j = i
    return found


def country_at(lat: float | None, lng: float | None) -> str | None:
    """The country of a point from known bounds (India, Singapore), or None."""
    if lat is None or lng is None:
        return None
    for code, raw in _data()["regions"].items():
        if any(_inside(float(lat), float(lng), polygon) for polygon in raw["bounds"]):
            return str(code)
    return None


def area_language(lat: float | None, lng: float | None) -> str | None:
    """The regional language of the area a point is in (Bengaluru → kn), if the app has one."""
    code = country_at(lat, lng)
    if code is None or lat is None or lng is None:
        return None
    for area in _data()["regions"][code]["areas"]:
        south, west, north, east = area["box"]
        if south <= lat <= north and west <= lng <= east:
            return str(area["language"])
    return None


def country_of_timezone(zone: str | None) -> str | None:
    found = _data()["timezones"].get(zone or "")
    return str(found) if found else None


def country_of_currency(currency: str | None) -> str | None:
    found = _data()["currencies"].get((currency or "").upper())
    return str(found) if found else None


def phone_country() -> str | None:
    """Where the phone making this request is: its timezone, then its language region."""
    from .shop_time import client_timezone

    return country_of_timezone(client_timezone.get()) or client_country.get() or NO_SIGNAL_COUNTRY


def region_at(lat: float | None, lng: float | None, currency: str = "") -> Region:
    """A customer's region from their area; the phone when the area is unknown."""
    return profile(country_at(lat, lng) or phone_country(), currency)


def shop_region(fields: dict[str, Any] | None) -> Region:
    """A saved or draft shop's region: its pin, then its timezone, then its currency, then the
    phone. A legacy shop with no pin and no stored timezone was saved as Singapore (SGD)."""
    fields = fields or {}
    currency = str(fields.get("currency") or "")
    code = (
        country_at(fields.get("lat"), fields.get("lng"))
        or country_of_timezone(fields.get("timezone"))
        or country_of_currency(currency)
        or phone_country()
    )
    return profile(code, currency)


def shop_currency(fields: dict[str, Any] | None) -> str:
    """The shop's saved currency; for a draft without one, its region's."""
    saved = str((fields or {}).get("currency") or "")
    return saved or shop_region(fields).currency


def shop_zone(fields: dict[str, Any] | None) -> str:
    """The shop's saved IANA timezone; its region's when it has none stored."""
    saved = str((fields or {}).get("timezone") or "")
    if saved:
        return saved
    region = shop_region(fields)
    if region.known:
        return region.timezone
    from .shop_time import client_timezone

    return client_timezone.get() or "UTC"


def new_shop_currency(lat: float | None, lng: float | None) -> str:
    """A brand-new shop's currency: where its pin is, else where the phone is."""
    return profile(country_at(lat, lng) or phone_country()).currency


def new_shop_zone(lat: float | None, lng: float | None) -> str:
    """A brand-new shop's timezone: its pin's country, else the phone's own zone."""
    from .shop_time import client_timezone

    pinned = country_at(lat, lng)
    phone = client_timezone.get()
    if pinned and country_of_timezone(phone) != pinned:
        return profile(pinned).timezone
    if phone:
        return phone
    return profile(phone_country()).timezone


def money_text(minor: int, currency: str) -> str:
    """₹1,24,000 / S$12.50 / ¥3,000: the region's symbol and digit grouping, for text the server
    writes (AI prompts, notices)."""
    major = to_major(minor, currency)
    digits = 0 if float(major).is_integer() else exponent(currency)
    whole, _, fraction = f"{abs(major):.{digits}f}".partition(".")
    if country_of_currency(currency) == "IN" and len(whole) > 3:
        # Indian grouping: the last three digits, then pairs (1,00,000).
        head, tail = whole[:-3], whole[-3:]
        pairs: list[str] = []
        while len(head) > 2:
            pairs.insert(0, head[-2:])
            head = head[:-2]
        whole = ",".join([head, *pairs, tail]) if head else ",".join([*pairs, tail])
    else:
        whole = f"{int(whole):,}"
    number = f"{whole}.{fraction}" if fraction else whole
    sign = "-" if major < 0 else ""
    mark = symbol(currency)
    return f"{sign}{mark}{number}" if mark else f"{sign}{number} {currency}"


# Saved payment and delivery keys (src/features/v1/strings.ts) as people say them.
BRANDS = {
    "paynow": "PayNow",
    "nets": "NETS",
    "grabpay": "GrabPay",
    "grab": "GrabFood",
    "foodpanda": "foodpanda",
}


def brand(key: str) -> str:
    return BRANDS.get(key, key)


def region_rule(region: Region, currency: str | None = None) -> str:
    """The instruction that keeps AI replies in the shop's or customer's region."""
    money = currency or region.currency
    if not region.known:
        return (
            f"Region: write money in {money} with its own symbol, never in another country's "
            "currency. Suggest only payment, delivery and ride services the owner names."
        )
    sample = money_text(round(1240 * 10 ** exponent(money)), money)
    return (
        f"Region: {region.name}. Write money as {sample} ({money}"
        + (", Indian digit grouping 1,00,000" if region.country == "IN" else "")
        + f"), never another country's currency. Payments people use here: "
        f"{', '.join(map(brand, region.payments))}. Delivery: "
        f"{', '.join(map(brand, region.delivery)) or 'own'}. "
        f"Rides and parcels: {', '.join(name.title() for name in region.rides)}. Units: "
        f"{', '.join(region.units)}. Tax: {region.tax_note}. Examples and suggestions fit "
        f"{region.name} ({region.examples}); never suggest services or examples from other "
        "countries."
    )
