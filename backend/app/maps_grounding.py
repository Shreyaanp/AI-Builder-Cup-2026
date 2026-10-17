"""Area questions answered with Google's live local knowledge (Gemini grounding with Google Maps).

"Is there parking near the market?", "what's open near the metro?", "best filter coffee near me":
Gemini on Vertex answers with the Google Maps tool, centred on the customer. We show the text,
the Google Maps places it used (Google's required source attribution) and pin them on the map.
Our own shops are matched separately and always listed first for products they sell.

Behind a switch (`MAPS_GROUNDING`): "off" answers nothing (the app shows its own list with
straight-line distances), "demo" returns labelled sample answers offline, "live" calls Gemini.
Answers are cached per question and ~1 km area because GCP credit is limited.
"""

from __future__ import annotations

import asyncio
import math
import re
import time
from typing import Any, Literal

import anyio
import structlog
from pydantic import BaseModel

from .discover import MapsService, distance
from .reply_language import written_language
from .settings import Settings

log = structlog.get_logger()

# A question about the area itself rather than (only) a product our shops sell.
AREA = re.compile(
    r"\b(park(ing)?|car ?park|toilets?|restrooms?|washrooms?|atms?|petrol|fuel|ev charg\w*"
    r"|what'?s open|whats open|open near|near (?:me|here|the|my)|nearby|around (?:here|me)"
    r"|best\b.+\bnear|recommend\w*|how do i get|is there)\b"
    r"|पार्किंग|पास में|附近|停车|近く|駐車|근처|주차|ใกล้|ที่จอดรถ|gần đây|dekat|malapit|அருகில்"
)

PROMPT = """You help a customer with a question about the area around them.
Answer in {language} in at most 3 short sentences, like a helpful local friend.
Use Google Maps for real places, opening hours and parking; name only places Google Maps knows.
Never invent prices, menus or places. If Google Maps has nothing useful, say so in one sentence.
Question: {q}"""


class AreaSource(BaseModel):
    """A Google Maps place the answer used: shown with a link, as Google requires."""

    title: str
    uri: str
    place_id: str | None = None


class AreaPlace(BaseModel):
    """A grounded Google place with coordinates, so the results map can pin it."""

    id: str
    name: str
    lat: float
    lng: float
    distance_m: int
    open_now: bool | None = None
    rating: float | None = None
    google_maps_uri: str | None = None


class AreaAnswer(BaseModel):
    status: Literal["ok", "off", "unavailable"]
    text: str = ""
    sources: list[AreaSource] = []
    places: list[AreaPlace] = []
    # Google Maps contextual widget token, when Gemini returns one.
    widget_token: str | None = None
    demo: bool = False
    cached: bool = False


def is_area_question(q: str) -> bool:
    return bool(AREA.search(q.casefold()))


def grounding_request(
    settings: Settings, q: str, lat: float, lng: float, language: str
) -> dict[str, Any]:
    """The generate_content arguments: Maps tool on, centred on the customer, short answer."""
    from google.genai import types

    return {
        "model": settings.maps_grounding_model or settings.google_text_model,
        "contents": PROMPT.format(language=written_language(language), q=q),
        "config": types.GenerateContentConfig(
            tools=[types.Tool(google_maps=types.GoogleMaps())],
            tool_config=types.ToolConfig(
                retrieval_config=types.RetrievalConfig(
                    lat_lng=types.LatLng(latitude=lat, longitude=lng),
                    language_code=language,
                )
            ),
            temperature=0.2,
            max_output_tokens=400,
        ),
    }


def place_id(raw: str | None) -> str | None:
    """Grounding names places as "places/ChIJ…"; the Places API takes the bare id."""
    if not raw:
        return None
    bare = raw.removeprefix("places/")
    return bare if re.fullmatch(r"[A-Za-z0-9_-]{8,256}", bare) else None


def parse_grounded(response: Any) -> AreaAnswer:
    """Text plus the Google Maps places it was grounded on (deduplicated, in answer order)."""
    text = (getattr(response, "text", None) or "").strip()
    candidates = getattr(response, "candidates", None) or []
    metadata = getattr(candidates[0], "grounding_metadata", None) if candidates else None
    sources: list[AreaSource] = []
    seen: set[str] = set()
    for chunk in getattr(metadata, "grounding_chunks", None) or []:
        maps = getattr(chunk, "maps", None)
        if maps is None or not getattr(maps, "uri", None):
            continue
        key = getattr(maps, "place_id", None) or maps.uri
        if key in seen:
            continue
        seen.add(key)
        sources.append(
            AreaSource(
                title=(getattr(maps, "title", None) or "Google Maps")[:120],
                uri=maps.uri,
                place_id=place_id(getattr(maps, "place_id", None)),
            )
        )
    if not text:
        return AreaAnswer(status="unavailable")
    return AreaAnswer(
        status="ok",
        text=text[:600],
        sources=sources[:8],
        widget_token=getattr(metadata, "google_maps_widget_context_token", None),
    )


# Offline sample answers (labelled demo): what the area answer looks like without a live call.
DEMO_TOPICS: list[tuple[re.Pattern[str], str, list[tuple[str, int, int, bool]]]] = [
    (
        re.compile(r"park|car|駐車|停车|पार्किंग|주차|จอด|letak kereta|பார்க்கிங்|நிறுத்த"),
        "Sample answer: there is a public car park about two minutes' walk away, and street "
        "parking on the next road fills up after 6 pm.",
        [("Sample public car park", 140, 60, True), ("Sample street parking", -90, 160, True)],
    ),
    (
        re.compile(
            r"coffee|kopi|cafe|café|filter|tea|chai|कॉफ़ी|咖啡|コーヒー|커피|กาแฟ|காபி|தேநீர்|teh"
        ),
        "Sample answer: two cafés nearby are known for filter coffee; the closer one is open "
        "now and busy in the morning.",
        [
            ("Sample filter coffee house", 220, -120, True),
            ("Sample roastery café", -260, 310, False),
        ],
    ),
]
DEMO_DEFAULT = (
    "Sample answer: a few places nearby match; the nearest is a short walk away and open now.",
    [("Sample local place", 180, 90, True), ("Sample corner store", -150, -200, False)],
)


# The same samples for a customer in Hindi or a Singapore language (the labelled demo still
# reads in their language). Keys are the English samples above.
_SAMPLES = [
    "Sample answer: there is a public car park about two minutes' walk away, and street "
    "parking on the next road fills up after 6 pm.",
    "Sample answer: two cafés nearby are known for filter coffee; the closer one is open "
    "now and busy in the morning.",
    "Sample answer: a few places nearby match; the nearest is a short walk away and open now.",
    "Sample public car park",
    "Sample street parking",
    "Sample filter coffee house",
    "Sample roastery café",
    "Sample local place",
    "Sample corner store",
]
DEMO_LANGUAGES: dict[str, dict[str, str]] = {
    language: dict(zip(_SAMPLES, rows, strict=True))
    for language, rows in {
        "hi": [
            "नमूना जवाब: लगभग दो मिनट की पैदल दूरी पर एक सार्वजनिक पार्किंग है, और अगली सड़क की "
            "पार्किंग शाम 6 बजे के बाद भर जाती है।",
            "नमूना जवाब: पास के दो कैफ़े फ़िल्टर कॉफ़ी के लिए जाने जाते हैं; नज़दीक वाला अभी खुला है "
            "और सुबह भीड़ रहती है।",
            "नमूना जवाब: पास की कुछ जगहें मेल खाती हैं; सबसे नज़दीक वाली थोड़ी पैदल दूरी पर है और अभी खुली है।",
            "नमूना सार्वजनिक पार्किंग",
            "नमूना सड़क पार्किंग",
            "नमूना फ़िल्टर कॉफ़ी हाउस",
            "नमूना रोस्टरी कैफ़े",
            "नमूना स्थानीय जगह",
            "नमूना नुक्कड़ की दुकान",
        ],
        "zh": [
            "示例回答：步行约两分钟有一个公共停车场，下一条路的路边停车位晚上 6 点后就会停满。",
            "示例回答：附近有两家咖啡店以滴滤咖啡出名；较近的一家现在营业，早上人多。",
            "示例回答：附近有几处地方符合；最近的一处步行不远，现在营业。",
            "示例公共停车场",
            "示例路边停车",
            "示例滴滤咖啡店",
            "示例烘焙咖啡馆",
            "示例本地店铺",
            "示例街角小店",
        ],
        "ms": [
            "Jawapan contoh: ada tempat letak kereta awam kira-kira dua minit berjalan kaki, dan "
            "tempat letak di jalan sebelah penuh selepas 6 petang.",
            "Jawapan contoh: dua kafe berdekatan terkenal dengan kopi tapis; yang lebih dekat "
            "dibuka sekarang dan sibuk pada waktu pagi.",
            "Jawapan contoh: beberapa tempat berdekatan sepadan; yang terdekat hanya sedikit "
            "berjalan kaki dan dibuka sekarang.",
            "Contoh tempat letak kereta awam",
            "Contoh tempat letak tepi jalan",
            "Contoh kedai kopi tapis",
            "Contoh kafe pemanggang kopi",
            "Contoh tempat setempat",
            "Contoh kedai runcit",
        ],
        "ta": [
            "மாதிரி பதில்: இரண்டு நிமிட நடை தூரத்தில் ஒரு பொது வாகன நிறுத்தம் உள்ளது; அடுத்த "
            "சாலையின் ஓர நிறுத்தம் மாலை 6 மணிக்குப் பின் நிரம்பிவிடும்.",
            "மாதிரி பதில்: அருகிலுள்ள இரண்டு கஃபேக்கள் ஃபில்டர் காபிக்குப் பெயர் பெற்றவை; அருகில் "
            "உள்ளது இப்போது திறந்திருக்கிறது, காலையில் கூட்டமாக இருக்கும்.",
            "மாதிரி பதில்: அருகில் சில இடங்கள் பொருந்துகின்றன; மிக அருகிலுள்ளது சிறிது நடை "
            "தூரத்தில், இப்போது திறந்திருக்கிறது.",
            "மாதிரி பொது வாகன நிறுத்தம்",
            "மாதிரி சாலையோர நிறுத்தம்",
            "மாதிரி ஃபில்டர் காபி கடை",
            "மாதிரி காபி வறுப்புக் கஃபே",
            "மாதிரி உள்ளூர் இடம்",
            "மாதிரி மூலைக் கடை",
        ],
    }.items()
}


def demo_answer(q: str, lat: float, lng: float, language: str = "en") -> AreaAnswer:
    text = q.casefold()
    found = next(((t, p) for pattern, t, p in DEMO_TOPICS if pattern.search(text)), DEMO_DEFAULT)

    def say(words: str) -> str:
        return DEMO_LANGUAGES.get(language.split("-")[0], {}).get(words, words)

    places: list[AreaPlace] = []
    sources: list[AreaSource] = []
    for index, (name, north, east, is_open) in enumerate(found[1]):
        p_lat = lat + north / 111_320
        p_lng = lng + east / (111_320 * max(math.cos(math.radians(lat)), 0.01))
        uri = f"https://www.google.com/maps/search/?api=1&query={p_lat:.5f},{p_lng:.5f}"
        pid = f"demo-area-{index}"
        name = say(name)
        sources.append(AreaSource(title=name, uri=uri, place_id=pid))
        places.append(
            AreaPlace(
                id=pid,
                name=name,
                lat=p_lat,
                lng=p_lng,
                distance_m=distance(lat, lng, p_lat, p_lng),
                open_now=is_open,
                google_maps_uri=uri,
            )
        )
    return AreaAnswer(status="ok", text=say(found[0]), sources=sources, places=places, demo=True)


class AreaGrounding:
    """Gemini + Google Maps grounding with a per question+area cache and single flight."""

    def __init__(self, settings: Settings, client: Any = None):
        self.settings = settings
        self.mode = settings.maps_grounding
        self.client = client
        self.cache: dict[tuple[Any, ...], tuple[float, AreaAnswer]] = {}
        self.locks: dict[tuple[Any, ...], asyncio.Lock] = {}
        self.calls = 0

    @staticmethod
    def key(q: str, lat: float, lng: float, language: str) -> tuple[Any, ...]:
        # ~1 km cells: everyone asking the same thing in the same neighbourhood shares one call.
        return (" ".join(q.casefold().split()), round(lat, 2), round(lng, 2), language)

    def genai(self) -> Any:
        if self.client is None:
            from google import genai

            settings = self.settings
            self.client = (
                genai.Client(
                    vertexai=True,
                    project=settings.google_cloud_project,
                    location=settings.google_cloud_location,
                )
                if settings.gemini_backend == "vertex"
                else genai.Client(api_key=settings.google_api_key.get_secret_value())
            )
        return self.client

    async def answer(
        self, q: str, lat: float, lng: float, language: str, maps: MapsService
    ) -> AreaAnswer:
        if self.mode == "off":
            return AreaAnswer(status="off")
        if self.mode == "demo":
            return demo_answer(q, lat, lng, language)
        key = self.key(q, lat, lng, language)
        lock = self.locks.setdefault(key, asyncio.Lock())
        async with lock:
            now = time.monotonic()
            hit = self.cache.get(key)
            if hit and hit[0] > now:
                return hit[1].model_copy(update={"cached": True})
            try:
                self.calls += 1
                with anyio.fail_after(10):
                    response = await self.genai().aio.models.generate_content(
                        **grounding_request(self.settings, q, lat, lng, language)
                    )
                result = parse_grounded(response)
            except Exception:  # noqa: BLE001 - the app's own list is always an honest fallback
                log.warning("maps_grounding_unavailable")
                result = AreaAnswer(status="unavailable")
            if result.status == "ok":
                result.places = await self.pin(result.sources, lat, lng, maps)
                self.cache = {k: v for k, v in self.cache.items() if v[0] > now}
                if len(self.cache) >= 256:
                    self.cache.pop(next(iter(self.cache)))
                self.cache[key] = (now + self.settings.maps_grounding_cache_seconds, result)
            self.locks.pop(key, None)
            return result

    async def pin(
        self, sources: list[AreaSource], lat: float, lng: float, maps: MapsService
    ) -> list[AreaPlace]:
        """Coordinates for the grounded places (Places details, cached), for the results map."""
        places: list[AreaPlace] = []
        for source in sources[:5]:
            if not source.place_id:
                continue
            row = await maps.place(source.place_id)
            point = (row or {}).get("location") or {}
            if "latitude" not in point or "longitude" not in point:
                continue
            places.append(
                AreaPlace(
                    id=source.place_id,
                    name=((row or {}).get("displayName") or {}).get("text") or source.title,
                    lat=point["latitude"],
                    lng=point["longitude"],
                    distance_m=distance(lat, lng, point["latitude"], point["longitude"]),
                    open_now=((row or {}).get("currentOpeningHours") or {}).get("openNow"),
                    rating=(row or {}).get("rating"),
                    google_maps_uri=(row or {}).get("googleMapsUri") or source.uri,
                )
            )
        return places
