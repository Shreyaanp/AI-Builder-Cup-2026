"""Public discovery and consented pin lookups. Provider I/O is replaceable in offline tests."""

import asyncio
import math
import re
import time
from datetime import UTC, datetime
from typing import Any, Literal

import httpx
import structlog
from fastapi import APIRouter, HTTPException, Query, Request, Response
from pydantic import BaseModel

from .limits import client_ip, enforce_limits
from .merchant import MerchantRepository, ProposalRequest
from .place_photos import PlacesPhotos
from .places_cache import SharedPlaces
from .settings import Settings
from .shop_time import shop_timezone
from .words import words

log = structlog.get_logger()

PLACES_MASK = ",".join(
    "places." + field
    for field in (
        "id",
        "displayName",
        "location",
        "primaryType",
        "rating",
        "userRatingCount",
        "currentOpeningHours.openNow",
        "priceLevel",
        "googleMapsUri",
        "photos",
    )
)
# Field masks pick the Places SKU: ask only for what each caller shows. The station anchor needs
# no rating, opening state or price (Pro, not Enterprise), the grounded-answer pins no photos.
STATION_MASK = ",".join(
    "places." + field for field in ("id", "displayName", "location", "primaryType")
)
DETAILS_MASK = ",".join(
    (
        "id",
        "displayName",
        "location",
        "currentOpeningHours.openNow",
        "rating",
        "googleMapsUri",
    )
)
CATEGORIES = {
    "coffee": (("cafe",), ("kopi", "coffee", "tea", "teh", "cafe", "café")),
    "food": (
        ("restaurant", "food_court", "meal_takeaway"),
        ("restaurant", "food", "hawker", "cater", "eatery", "dhaba", "tiffin"),
    ),
    "bakery": (("bakery",), ("bakery", "bake", "bread")),
    "grocery": (
        ("grocery_store", "supermarket"),
        ("grocer", "supermarket", "minimart", "convenience"),
    ),
    "pharmacy": (("pharmacy",), ("pharmacy", "chemist", "drugstore")),
    "hardware": (("hardware_store",), ("hardware", "tools", "building supplies")),
    "fashion": (
        ("clothing_store", "shoe_store"),
        ("clothing", "fashion", "apparel", "boutique", "shoe"),
    ),
    "beauty": (("beauty_salon", "hair_care"), ("beauty", "salon", "hair", "barber", "nail", "spa")),
    "services": (("laundry",), ("service", "laundry", "repair", "plumb", "electric", "tailor")),
    "other": (("store",), ("store", "shop", "retail", "florist")),
}
# Existing query values stay valid; the UI presents only the generic categories.
CATEGORY_ALIASES = {
    "kopi": "coffee",
    "hawker": "food",
    "cafe": "coffee",
    "café": "coffee",
    "catering": "food",
}
CATEGORIES.update({alias: CATEGORIES[key] for alias, key in CATEGORY_ALIASES.items()})
# Google Places (New) types for "what's around me": small local businesses, food and non-food.
LOCAL_SHOP_TYPES = [
    *("restaurant", "cafe", "bakery", "food_court", "meal_takeaway"),
    *("grocery_store", "supermarket", "convenience_store"),
    *("pharmacy", "hardware_store", "florist", "clothing_store", "shoe_store", "book_store"),
    *("electronics_store", "home_goods_store", "pet_store", "store"),
    *("beauty_salon", "hair_care", "laundry"),
]
AREAS = {
    "Tiong Bahru": (1.2847, 103.832),
    "Chinatown": (1.283, 103.843),
    "Bugis": (1.3007, 103.855),
    "Orchard": (1.3048, 103.8318),
    "Jurong East": (1.3331, 103.7423),
    "Tampines": (1.3547, 103.9437),
    "Katong": (1.3052, 103.9045),
    "Toa Payoh": (1.3343, 103.8563),
    # The demo catalogue's neighbourhoods in every city, so offline previews work worldwide.
    "Indiranagar": (12.9719, 77.6412),
    "Koramangala": (12.9352, 77.6245),
    "Hauz Khas": (28.5494, 77.2001),
    "Bandra": (19.0596, 72.8295),
    "HITEC City": (17.4474, 78.3762),
    "Bangsar": (3.1302, 101.671),
    "Kemang": (-6.2604, 106.813),
    "Shimokitazawa": (35.6615, 139.6669),
    "Ari": (13.7797, 100.5447),
    # Whole cities (and common names) last: a typed neighbourhood wins over its city.
    "Singapore": (1.2903, 103.8519),
    "Bengaluru": (12.9716, 77.5946),
    "Bangalore": (12.9716, 77.5946),
    "New Delhi": (28.6139, 77.209),
    "Delhi": (28.6139, 77.209),
    "Mumbai": (19.076, 72.8777),
    "Bombay": (19.076, 72.8777),
    "Hyderabad": (17.385, 78.4867),
    "Kuala Lumpur": (3.139, 101.6869),
    "Jakarta": (-6.2088, 106.8456),
    "Tokyo": (35.6762, 139.6503),
    "Bangkok": (13.7563, 100.5018),
}
FIXTURE_PLACES = [
    {
        "id": "demo-kopi",
        "displayName": {"text": "Tiong Bahru Kopi"},
        "location": {"latitude": 1.2848, "longitude": 103.8321},
        "primaryType": "cafe",
        "rating": 4.5,
        "userRatingCount": 120,
        "currentOpeningHours": {"openNow": True},
        "priceLevel": "PRICE_LEVEL_INEXPENSIVE",
        "googleMapsUri": "https://www.google.com/maps/search/?api=1&query=Tiong+Bahru+Market",
    },
    {
        "id": "demo-bakery",
        "displayName": {"text": "Tiong Bahru Bakery"},
        "location": {"latitude": 1.2834, "longitude": 103.834},
        "primaryType": "bakery",
        "rating": 4.3,
        "userRatingCount": 80,
        "currentOpeningHours": {"openNow": False},
        "priceLevel": "PRICE_LEVEL_MODERATE",
        "googleMapsUri": "https://www.google.com/maps/search/?api=1&query=Tiong+Bahru+Bakery",
    },
    {
        "id": "demo-hawker",
        "displayName": {"text": "Chinatown Hawker Centre"},
        "location": {"latitude": 1.283, "longitude": 103.843},
        "primaryType": "food_court",
        "rating": 4.4,
        "userRatingCount": 60,
        "currentOpeningHours": {"openNow": True},
        "priceLevel": "PRICE_LEVEL_INEXPENSIVE",
        "googleMapsUri": "https://www.google.com/maps/search/?api=1&query=Chinatown+Complex",
    },
]


class TopItem(BaseModel):
    name: str
    price: int
    unit: str
    available: bool


class DiscoveryPlace(BaseModel):
    id: str
    name: str
    source: Literal["chalkboard", "google"]
    category: str
    lat: float
    lng: float
    distance_m: int
    open_now: bool | None
    currency: str | None = None
    items: list[TopItem]
    sold_out: list[str]
    rating: float | None = None
    user_rating_count: int | None = None
    price_level: str | None = None
    google_maps_uri: str | None = None
    halal: bool | None = None
    # The owner said they make what they sell or source it from local makers.
    locally_made: bool = False
    demo: bool = False
    # A seeded sample shop (labelled "Demo shop"), as opposed to demo map data above.
    demo_shop: bool = False
    photo_url: str | None = None
    # The shop's own icon (shared shops only); the app draws a monogram when there is none.
    icon_url: str | None = None
    photo_authors: list[str] = []


class DiscoveryResponse(BaseModel):
    mode: Literal["demo", "live"]
    google_unavailable: bool = False
    places: list[DiscoveryPlace]


def consumer_shop(shop: dict[str, Any]) -> bool:
    """Whether customers may see this shared shop. Wholesale suppliers sell to shops (sourcing.py):
    their bulk prices and lead times never appear in what a customer finds nearby."""
    return not shop.get("supplier")


def distance(lat: float, lng: float, other_lat: float, other_lng: float) -> int:
    a, b = math.radians(lat), math.radians(other_lat)
    h = (
        math.sin((b - a) / 2) ** 2
        + math.cos(a) * math.cos(b) * math.sin(math.radians(other_lng - lng) / 2) ** 2
    )
    return round(6_371_000 * 2 * math.asin(math.sqrt(min(1, h))))


def open_now(
    hours: str,
    timezone: str,
    now: datetime | None = None,
    weekly_hours: list[dict[str, Any]] | None = None,
    closed_on: str | None = None,
) -> bool | None:
    """Match the owner's plain daily-range logic; day-specific/ambiguous text stays unknown.
    A shop the owner closed for today (closed_on, shop-local date) is closed all that day."""
    if closed_on:
        try:
            local_day = (now or datetime.now(UTC)).astimezone(shop_timezone(timezone)).date()
        except (ValueError, KeyError):
            local_day = None
        if local_day and local_day.isoformat() == closed_on:
            return False
    if weekly_hours:
        try:
            local = (now or datetime.now(UTC)).astimezone(shop_timezone(timezone))
        except (ValueError, KeyError):
            return None
        days = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
        entries = {entry["day"]: entry for entry in weekly_hours}
        today = entries.get(days[local.weekday()])
        previous = entries.get(days[(local.weekday() - 1) % 7])
        current = local.hour * 60 + local.minute

        def minute(value: str) -> int:
            hour, minute = value.split(":")
            return int(hour) * 60 + int(minute)

        # A closed day may still include the tail of the previous day's overnight shift.
        if previous and not previous["closed"]:
            begin, finish = minute(previous["open"]), minute(previous["close"])
            if begin > finish and current < finish:
                return True
        if not today:
            return None
        if today["closed"]:
            return False
        begin, finish = minute(today["open"]), minute(today["close"])
        return begin <= current < finish if begin < finish else current >= begin
    match = re.search(
        r"(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\s*(?:-|–|—|to)\s*"
        r"(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?",
        hours,
        re.I,
    )
    if not match:
        return None
    rest = re.sub(
        r"\b(daily|every\s*day)\b", "", hours[: match.start()] + hours[match.end() :], flags=re.I
    )
    if any(char.isalpha() or char.isdigit() for char in rest):
        return None

    def minutes(hour: str, minute: str | None, half: str | None) -> int | None:
        h, m = int(hour), int(minute or 0)
        if m > 59 or h > (12 if half else 23) or (half and h < 1):
            return None
        return (h % 12 + (12 if half.lower() == "pm" else 0) if half else h) * 60 + m

    h1, m1, half1, h2, m2, half2 = match.groups()
    start, end = minutes(h1, m1, half1 or half2), minutes(h2, m2, half2)
    if start is None or end is None:
        return None
    if not half1 and half2 and start > end:
        start = minutes(h1, m1, "am")
    if start is None or start == end:
        return None
    try:
        local = (now or datetime.now(UTC)).astimezone(shop_timezone(timezone))
    except (ValueError, KeyError):
        return None
    current = local.hour * 60 + local.minute
    return start <= current < end if start < end else current >= start or current < end


class MapsService:
    def __init__(self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None):
        self.key = settings.maps_server_key.get_secret_value() if settings.maps_server_key else ""
        browser = settings.maps_browser_key.get_secret_value() if settings.maps_browser_key else ""
        self.demo = not (self.key and browser)
        self.client = httpx.AsyncClient(timeout=8, trust_env=False, transport=transport)
        self.photos = PlacesPhotos(self.client, self.key, enabled=not self.demo)
        self.cache: dict[tuple[Any, ...], tuple[float, Any]] = {}
        self.lock = asyncio.Lock()
        # Places search/details shared by every instance (main.py sets it when PLACES_CACHE is
        # on and the app runs on Firestore); this per-instance memory stays in front of it.
        self.shared: SharedPlaces | None = None

    async def close(self) -> None:
        await self.client.aclose()

    async def cached(self, key: tuple[Any, ...], lookup: Any, shared: bool = False) -> Any:
        # Single-flight prevents bursts from multiplying paid lookups. Bounded lifetime and size.
        async with self.lock:
            now = time.monotonic()
            self.cache = {k: v for k, v in self.cache.items() if v[0] > now}
            if key in self.cache:
                if shared:
                    log.info("places_cache", kind=key[0], result="hit", layer="memory")
                return self.cache[key][1]
            result = await self.shared_lookup(key, lookup) if shared else await lookup()
            if len(self.cache) >= 256:
                self.cache.pop(next(iter(self.cache)))
            self.cache[key] = (time.monotonic() + 600, result)
            return result

    async def shared_lookup(self, key: tuple[Any, ...], lookup: Any) -> Any:
        """The shared copy when another instance paid for it; otherwise call Google and share
        the answer. A store failure only costs the provider call."""
        store = None if self.demo else self.shared
        if store:
            try:
                found = await store.get(key)
            except Exception:  # noqa: BLE001 - the cache is an optimisation; Google still answers
                log.warning("places_cache_unavailable", kind=key[0])
                found = None
            if found is not None:
                log.info("places_cache", kind=key[0], result="hit", layer="shared")
                return found
        log.info("places_cache", kind=key[0], result="miss")
        result = await lookup()
        if store and result is not None:
            try:
                await store.put(key, result)
            except Exception:  # noqa: BLE001
                log.warning("places_cache_unavailable", kind=key[0])
        return result

    async def geocode(self, location: str) -> dict[str, Any]:
        async def lookup() -> dict[str, Any]:
            if self.demo:
                # Whole words only: "Marina" must not match Bangkok's "Ari".
                area = next(
                    (a for a in AREAS if re.search(rf"\b{re.escape(a)}\b", location, re.I)), None
                )
                if not area:
                    raise HTTPException(422, "PIN_NOT_FOUND")
                lat, lng = AREAS[area]
                return {
                    "lat": lat,
                    "lng": lng,
                    "place_id": "demo-" + area.lower().replace(" ", "-"),
                    "pin_label": "Tiong Bahru Market" if area == "Tiong Bahru" else area,
                    "pin_demo": True,
                }
            try:
                response = await self.client.get(
                    "https://maps.googleapis.com/maps/api/geocode/json",
                    params={"address": location, "key": self.key},
                )
                response.raise_for_status()
                data = response.json()
                if data.get("status") == "ZERO_RESULTS":
                    raise HTTPException(422, "PIN_NOT_FOUND")
                if data.get("status") != "OK":
                    raise HTTPException(503, "PIN_UNAVAILABLE")
                result = data["results"][0]
                point = result["geometry"]["location"]
                return {
                    "lat": point["lat"],
                    "lng": point["lng"],
                    "place_id": result["place_id"],
                    "pin_label": result["formatted_address"],
                    "pin_demo": False,
                }
            except (httpx.HTTPError, KeyError, ValueError, IndexError) as error:
                raise HTTPException(503, "PIN_UNAVAILABLE") from error

        return dict(await self.cached(("pin", location.casefold()), lookup))

    async def reverse(self, lat: float, lng: float) -> dict[str, Any]:
        """A photo's coordinates as a pin. The point itself is the evidence, so if the address
        lookup is unavailable the pin keeps the coordinates with a plain label."""

        async def lookup() -> dict[str, Any]:
            nearest = min(AREAS, key=lambda area: distance(lat, lng, *AREAS[area]))
            label = (
                f"Near {nearest}"
                if distance(lat, lng, *AREAS[nearest]) <= 5000
                else "Your current location"
            )
            pin: dict[str, Any] = {
                "lat": lat,
                "lng": lng,
                "place_id": None,
                "pin_label": label,
                "pin_demo": False,
            }
            if self.demo:
                return pin
            try:
                response = await self.client.get(
                    "https://maps.googleapis.com/maps/api/geocode/json",
                    params={"latlng": f"{lat},{lng}", "key": self.key},
                )
                response.raise_for_status()
                data = response.json()
                if data.get("status") == "OK" and data.get("results"):
                    result = data["results"][0]
                    pin["place_id"] = result.get("place_id")
                    pin["pin_label"] = result.get("formatted_address") or pin["pin_label"]
            except (httpx.HTTPError, KeyError, ValueError, IndexError):
                log.warning("reverse_geocode_unavailable")
            return pin

        return dict(await self.cached(("reverse", round(lat, 5), round(lng, 5)), lookup))

    async def places(
        self, lat: float, lng: float, radius: int, q: str, category: str, mask: str = PLACES_MASK
    ) -> list[dict[str, Any]]:
        async def lookup() -> list[dict[str, Any]]:
            if self.demo:
                return FIXTURE_PLACES
            circle = {"center": {"latitude": lat, "longitude": lng}, "radius": float(radius)}
            if q:
                method = "searchText"
                # Global: the search circle around the customer decides the region.
                payload: dict[str, Any] = {
                    "textQuery": q,
                    "locationBias": {"circle": circle},
                    "rankPreference": "DISTANCE",
                    "pageSize": 20,
                }
                if category:
                    payload["includedType"] = CATEGORIES[category][0][0]
            else:
                method = "searchNearby"
                # Nearest first, and every kind of local shop, not only food.
                payload = {
                    "locationRestriction": {"circle": circle},
                    "maxResultCount": 20,
                    "rankPreference": "DISTANCE",
                    "includedTypes": list(CATEGORIES[category][0])
                    if category
                    else LOCAL_SHOP_TYPES,
                }
            try:
                response = await self.client.post(
                    "https://places.googleapis.com/v1/places:" + method,
                    headers={"X-Goog-Api-Key": self.key, "X-Goog-FieldMask": mask},
                    json=payload,
                )
                response.raise_for_status()
                return list(response.json().get("places", []))
            except (httpx.HTTPError, KeyError, ValueError) as error:
                raise HTTPException(503, "PLACES_UNAVAILABLE") from error

        return list(
            await self.cached(
                ("places", round(lat, 3), round(lng, 3), radius, q.casefold(), category, mask),
                lookup,
                shared=True,
            )
        )

    async def place(self, place_id: str) -> dict[str, Any] | None:
        """One place by id (a grounded answer names places without coordinates). Cached."""

        async def lookup() -> dict[str, Any] | None:
            if self.demo:
                return None
            try:
                response = await self.client.get(
                    "https://places.googleapis.com/v1/places/" + place_id,
                    headers={
                        "X-Goog-Api-Key": self.key,
                        "X-Goog-FieldMask": DETAILS_MASK,
                    },
                )
                response.raise_for_status()
                return dict(response.json())
            except (httpx.HTTPError, ValueError):
                log.warning("place_details_unavailable")
                return None

        if not re.fullmatch(r"[A-Za-z0-9_-]{8,256}", place_id):
            return None
        return await self.cached(("place", place_id), lookup, shared=True)


def follow_pin(body: ProposalRequest, old: dict[str, Any], priced: bool) -> None:
    """A saved shop that moved to another country (OB-172: "change my location to HITEC City,
    Hyderabad"): its clock follows the new pin, and so does its money while it has no items yet.
    Saved prices are minor units of the saved currency, so a priced shop keeps it."""
    from .region import country_at, country_of_timezone, profile

    business = body.business
    assert business is not None
    country = country_at(business.lat, business.lng)
    pinned = profile(country)
    if not country or not pinned.known:
        return
    if country_of_timezone(old.get("timezone") or "") != country:
        business.timezone = pinned.timezone
    if not priced:
        business.currency = pinned.currency


async def prepare_pin(
    body: ProposalRequest, repository: MerchantRepository, uid: str, maps: MapsService
) -> None:
    """Keep coordinates when unchanged, clear stale pins, geocode only explicit owner consent."""
    if not body.business:
        return
    if body.kind != "business":
        return
    import anyio

    old: dict[str, Any] = {}
    priced = False
    if body.business_id:
        context = await anyio.to_thread.run_sync(repository.context, uid, body.business_id)
        if context["business"]["revision"] != body.revision:
            raise HTTPException(409, "The business changed. Reload before reviewing.")
        old = context["business"]["fields"]
        priced = bool(context.get("inventory"))
    elif body.revision != 0:
        raise HTTPException(409, "A new business starts at revision zero.")
    # The "Demo shop" label is server-owned too: only the seed script sets it, and an owner's
    # edit can neither add nor remove it.
    body.business.demo = bool(old.get("demo"))
    if body.owner_location is not None:
        point = body.owner_location
        pin = await maps.reverse(point.lat, point.lng)
        body.business = type(body.business).model_validate(
            {
                **body.business.model_dump(),
                **pin,
                "pin_source": point.source,
                "pin_accuracy_m": point.accuracy_m if point.source == "device" else None,
                # Keep the measured point even when the readable address is approximate.
                "lat": point.lat,
                "lng": point.lng,
                "pin_demo": False,
                "location": str(pin["pin_label"])[:300]
                if pin.get("place_id")
                else body.business.location,
            }
        )
        return
    exact = body.business
    if (
        old
        and (old.get("lat") is None or old.get("pin_demo"))
        and old.get("location") == exact.location
        and exact.lat is not None
        and exact.lng is not None
        and not exact.pin_demo
        and not body.geocode_confirmed
    ):
        # A photo's exact GPS replaces an approximate demo pin; the owner reviews the point
        # itself, so the label is the coordinates and no Places id is trusted from the client.
        exact.place_id = None
        exact.pin_label = f"{exact.lat:.5f}, {exact.lng:.5f}"
        exact.pin_source = None
        exact.pin_accuracy_m = None
        return
    if (
        old
        and old.get("location") == body.business.location
        and (
            (old.get("lat") is not None and not (old.get("pin_demo") and body.geocode_confirmed))
            or not body.geocode_confirmed
        )
    ):
        for field in (
            "lat",
            "lng",
            "place_id",
            "pin_label",
            "pin_demo",
            "pin_source",
            "pin_accuracy_m",
        ):
            setattr(body.business, field, old.get(field, False if field == "pin_demo" else None))
        return
    # Pin fields never come from an untrusted client or an obsolete location.
    for field in ("lat", "lng", "place_id", "pin_label", "pin_source", "pin_accuracy_m"):
        setattr(body.business, field, None)
    body.business.pin_demo = False
    if body.geocode_confirmed and body.business.location:
        body.business = body.business.model_copy(update=await maps.geocode(body.business.location))
        # Validate provider coordinates before sealing them.
        body.business = type(body.business).model_validate(body.business.model_dump())
        if old:
            follow_pin(body, old, priced)


def matches(place: DiscoveryPlace, q: str, category: str, only_open: bool) -> bool:
    text = " ".join([place.name, place.category, *(item.name for item in place.items)]).casefold()
    query = re.sub(r"\b(near me|open now|nearby)\b", "", q, flags=re.I).strip()
    terms = [*words(query.casefold()), *re.findall(r"\d+", query)]
    if query and not all(word in text for word in terms):
        return False
    if category and not any(term in place.category.casefold() for term in CATEGORIES[category][1]):
        return False
    return not only_open or place.open_now is True


router = APIRouter(prefix="/api/v1")


class PlaceMatch(BaseModel):
    lat: float
    lng: float
    label: str


@router.get("/discover/place", response_model=PlaceMatch)
async def find_place(
    request: Request,
    q: str | None = Query(default=None, max_length=180),
    lat: float | None = Query(default=None, ge=-90, le=90, allow_inf_nan=False),
    lng: float | None = Query(default=None, ge=-180, le=180, allow_inf_nan=False),
) -> PlaceMatch:
    """A typed city or area anywhere in the world, or coordinates reverse-geocoded to an area."""
    await enforce_limits(request, [("discover:place", client_ip(request))], anonymous=True)
    maps: MapsService = request.app.state.maps
    if lat is not None and lng is not None:
        pin = await maps.reverse(lat, lng)
        raw_label = str(pin.get("pin_label") or "")
        label = re.sub(r"^Near\s+", "", raw_label, flags=re.I).strip()
        if not label or label.lower() in ("your current location", "you"):
            label = "Nearby"
        return PlaceMatch(lat=lat, lng=lng, label=label)
    if not q or len(q.strip()) < 2:
        raise HTTPException(422, "PIN_NOT_FOUND")
    pin = await maps.geocode(q.strip())
    return PlaceMatch(lat=pin["lat"], lng=pin["lng"], label=pin["pin_label"] or q.strip())


class PinAddress(BaseModel):
    label: str
    # No street address was found (offline maps, or open country): the label is only an area.
    approximate: bool


@router.get("/places/reverse", response_model=PinAddress)
async def reverse_pin(
    request: Request,
    lat: float = Query(ge=-90, le=90, allow_inf_nan=False),
    lng: float = Query(ge=-180, le=180, allow_inf_nan=False),
) -> PinAddress:
    """The readable address under the owner's map pin while they place it (nothing is saved)."""
    uid = str((await request.app.state.services.identity.require(request)).uid)
    await enforce_limits(request, [("reverse", uid)])
    maps: MapsService = request.app.state.maps
    pin = await maps.reverse(lat, lng)
    return PinAddress(label=str(pin["pin_label"]), approximate=not pin.get("place_id"))


@router.get("/discover", response_model=DiscoveryResponse)
async def discover(
    request: Request,
    lat: float = Query(ge=-90, le=90, allow_inf_nan=False),
    lng: float = Query(ge=-180, le=180, allow_inf_nan=False),
    radius: int = Query(default=3000, ge=100, le=50000),
    q: str = Query(default="", max_length=180),
    category: str = Query(default="", max_length=30),
    open_now_filter: bool = Query(default=False, alias="open_now"),
) -> DiscoveryResponse:
    import anyio

    await enforce_limits(request, [("discover", client_ip(request))], anonymous=True)
    category = category.casefold()
    if category and category not in CATEGORIES:
        raise HTTPException(422, "UNKNOWN_CATEGORY")
    open_now_filter = open_now_filter or bool(re.search(r"\bopen now\b", q, re.I))
    maps: MapsService = request.app.state.maps
    repository: MerchantRepository | None = request.app.state.merchant
    in_sg = 1.15 <= lat <= 1.48 and 103.6 <= lng <= 104.1
    in_india = 6.5 <= lat <= 37.5 and 68.0 <= lng <= 97.5

    def norm_name(name: str) -> str:
        return re.sub(r"\s*\((Tour|Demo)\)$", "", name, flags=re.I).strip().casefold()

    shops = await anyio.to_thread.run_sync(repository.shared_shops) if repository else []
    places: list[DiscoveryPlace] = []
    seen_places_names: set[str] = set()
    for shop in shops:
        if shop["lat"] is None or shop["lng"] is None:
            continue
        # Wholesalers serve shops (sourcing), not customers exploring nearby.
        if not consumer_shop(shop):
            continue
        # Singapore demo shops only when browsing Singapore
        is_sg_shop = shop.get("demo") and (
            shop.get("city") == "singapore"
            or (
                shop.get("currency") == "SGD"
                and 1.15 <= shop["lat"] <= 1.48
                and 103.6 <= shop["lng"] <= 104.1
            )
        )
        if is_sg_shop and not in_sg:
            continue
        # Results near an Indian location never show SGD
        if in_india and shop.get("currency") == "SGD":
            continue
        # Results near a Singapore location never show INR
        if in_sg and shop.get("currency") == "INR":
            continue
        d = distance(lat, lng, shop["lat"], shop["lng"])
        if d > radius:
            continue
        name_key = norm_name(shop["name"])
        if name_key in seen_places_names:
            continue
        place = DiscoveryPlace(
            id=shop["id"],
            name=shop["name"],
            source="chalkboard",
            demo=bool(shop.get("pin_demo")),
            demo_shop=bool(shop.get("demo")),
            category=shop["category"],
            lat=shop["lat"],
            lng=shop["lng"],
            distance_m=d,
            open_now=open_now(
                shop["hours"],
                shop["timezone"],
                weekly_hours=shop.get("weekly_hours"),
                closed_on=shop.get("closed_on"),
            ),
            currency=shop["currency"],
            halal={"yes": True, "no": False}.get(shop.get("facts", {}).get("halal")),
            locally_made=bool(shop.get("facts", {}).get("locally_made")),
            # The owner's first gallery photo, served only because the shop is shared.
            photo_url=(
                f"/api/v1/public/shops/{shop['id']}/photos/{shop['gallery'][0]}.jpg"
                if shop.get("gallery")
                else None
            ),
            icon_url=(
                f"/api/v1/public/shops/{shop['id']}/icon/{shop['icon']}.jpg"
                if shop.get("icon")
                else None
            ),
            items=[TopItem(**p) for p in shop["products"][:3]],
            sold_out=[p["name"] for p in shop["products"] if not p["available"]],
        )
        if matches(place, q, category, open_now_filter):
            seen_places_names.add(name_key)
            places.append(place)
    unavailable = False
    try:
        google = await maps.places(lat, lng, radius, q, category)
    except HTTPException:
        google = []
        unavailable = True
    relevant_shop_ids = {p.id for p in places}
    owned_place_ids = {s.get("place_id") for s in shops if s["id"] in relevant_shop_ids}
    for row in google:
        if row["id"] in owned_place_ids:
            continue
        name_key = norm_name(row["displayName"]["text"])
        if name_key in seen_places_names:
            continue
        point = row["location"]
        d = distance(lat, lng, point["latitude"], point["longitude"])
        if d > radius:
            continue
        photo_url, photo_authors = maps.photos.describe(row)
        place = DiscoveryPlace(
            id=row["id"],
            name=row["displayName"]["text"],
            source="google",
            demo=maps.demo,
            items=[],
            sold_out=[],
            category=row.get("primaryType", ""),
            lat=point["latitude"],
            lng=point["longitude"],
            distance_m=d,
            open_now=row.get("currentOpeningHours", {}).get("openNow"),
            rating=row.get("rating"),
            user_rating_count=row.get("userRatingCount"),
            price_level=row.get("priceLevel"),
            google_maps_uri=row.get("googleMapsUri"),
            photo_url=photo_url,
            photo_authors=photo_authors,
        )
        # Live Text Search already matches semantic queries; don't discard matches by name alone.
        if matches(place, q if maps.demo else "", category if maps.demo else "", open_now_filter):
            seen_places_names.add(name_key)
            places.append(place)
    places.sort(key=lambda p: (p.source != "chalkboard", p.distance_m, p.id))
    return DiscoveryResponse(
        mode="demo" if maps.demo else "live", google_unavailable=unavailable, places=places
    )


@router.get("/place-photo", response_class=Response)
async def place_photo(
    request: Request,
    name: str = Query(min_length=1, max_length=4096),
    width: int = Query(default=800, ge=64, le=800),
    sig: str = Query(default="", max_length=64),
) -> Response:
    await enforce_limits(request, [("discover:photo", client_ip(request))], anonymous=True)
    maps: MapsService = request.app.state.maps
    body, media_type = await maps.photos.media(name, width, sig)
    # A photo for a given name never changes: let the browser keep it, so a repeat view is free.
    cache = {"Cache-Control": "private, max-age=86400"}
    return Response(body, media_type=media_type, headers=cache)
