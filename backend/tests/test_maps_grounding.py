import json
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient
from google.adk.sessions import InMemorySessionService

from app.discover import MapsService
from app.main import create_app
from app.maps_grounding import (
    AreaGrounding,
    grounding_request,
    is_area_question,
    parse_grounded,
)
from app.merchant import MerchantRepository
from app.settings import Settings
from tests.test_discover import settings, shared_shop

pytest_plugins = ("tests.test_merchant_store",)  # store fixture covers both adapters

TIONG_BAHRU = {"lat": 1.2847, "lng": 103.832}


def live_settings(tmp_path: Path, **extra: Any) -> Settings:
    return Settings(
        app_env="test",
        v1_enabled=True,
        merchant_database=str(tmp_path / "route.sqlite"),
        recall_path=str(tmp_path / "recall"),
        maps_grounding="live",
        maps_grounding_model="gemini-maps-fixture",
        google_cloud_project="fixture-project",
        _env_file=None,
        **extra,
    )


def grounded_response(text: str = "There is a car park on Seng Poh Road.") -> Any:
    chunk = SimpleNamespace(
        maps=SimpleNamespace(
            uri="https://maps.google.com/?cid=1",
            title="Seng Poh Car Park",
            place_id="places/ChIJfixture0001",
        )
    )
    duplicate = SimpleNamespace(maps=chunk.maps)
    web = SimpleNamespace(maps=None, web=SimpleNamespace(uri="https://example.com"))
    metadata = SimpleNamespace(
        grounding_chunks=[chunk, duplicate, web],
        google_maps_widget_context_token="widget-token",
    )
    return SimpleNamespace(text=text, candidates=[SimpleNamespace(grounding_metadata=metadata)])


class FakeGenai:
    """Stands in for google.genai.Client: counts calls, records arguments, can fail."""

    def __init__(self, response: Any = None, error: Exception | None = None):
        self.calls: list[dict[str, Any]] = []
        self.response = response if response is not None else grounded_response()
        self.error = error
        self.aio = SimpleNamespace(models=SimpleNamespace(generate_content=self.generate))

    async def generate(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        if self.error:
            raise self.error
        return self.response


def places_transport(calls: list[str]) -> httpx.MockTransport:
    def handle(request: httpx.Request) -> httpx.Response:
        calls.append(str(request.url))
        if request.url.path.startswith("/v1/places/"):
            return httpx.Response(
                200,
                json={
                    "id": "ChIJfixture0001",
                    "displayName": {"text": "Seng Poh Car Park"},
                    "location": {"latitude": 1.2851, "longitude": 103.8325},
                    "currentOpeningHours": {"openNow": True},
                    "googleMapsUri": "https://maps.google.com/?cid=1",
                },
            )
        return httpx.Response(200, json={"places": []})

    return httpx.MockTransport(handle)


def test_area_questions_are_recognised_and_products_are_not() -> None:
    for q in [
        "Is there parking near Tiong Bahru Market?",
        "what's open near the metro?",
        "best filter coffee near me",
        "toilets nearby",
        "पास में पार्किंग",
    ]:
        assert is_area_question(q), q
    for q in ["kopi", "coffee", "I want coffee", "cheap bread under 3", "open now?"]:
        assert not is_area_question(q), q


def test_grounding_call_turns_on_the_maps_tool_centred_on_the_customer(tmp_path: Path) -> None:
    request = grounding_request(live_settings(tmp_path), "parking?", 1.28, 103.83, "hi")
    assert request["model"] == "gemini-maps-fixture"
    assert "parking?" in request["contents"] and "Hindi (hi-IN)" in request["contents"]
    config = request["config"]
    assert config.tools[0].google_maps is not None
    point = config.tool_config.retrieval_config.lat_lng
    assert (point.latitude, point.longitude) == (1.28, 103.83)
    assert config.tool_config.retrieval_config.language_code == "hi"
    assert config.max_output_tokens <= 400
    # Without a dedicated model, the configured text model is used.
    plain = Settings(app_env="test", google_text_model="text-model", _env_file=None)
    assert grounding_request(plain, "q", 0, 0, "en")["model"] == "text-model"


def test_parse_keeps_text_and_google_maps_sources_for_attribution() -> None:
    answer = parse_grounded(grounded_response())
    assert answer.status == "ok"
    assert answer.text.startswith("There is a car park")
    # Maps chunks only, deduplicated; the bare Places id is kept for pinning.
    assert [(s.title, s.uri, s.place_id) for s in answer.sources] == [
        ("Seng Poh Car Park", "https://maps.google.com/?cid=1", "ChIJfixture0001")
    ]
    assert answer.widget_token == "widget-token"
    assert parse_grounded(SimpleNamespace(text="", candidates=[])).status == "unavailable"


async def test_answers_are_cached_per_question_and_area(tmp_path: Path) -> None:
    calls: list[str] = []
    live = live_settings(tmp_path, maps_server_key="key", maps_browser_key="browser")
    maps = MapsService(live, transport=places_transport(calls))
    fake = FakeGenai()
    grounding = AreaGrounding(live, client=fake)
    first = await grounding.answer("Parking  near the market?", 1.2847, 103.832, "en", maps)
    assert first.status == "ok" and not first.cached
    # Grounded places get coordinates for the map (one cached Places details lookup).
    assert [(p.name, p.open_now) for p in first.places] == [("Seng Poh Car Park", True)]
    assert 0 < first.places[0].distance_m < 200
    # Same question (case/spacing aside) a few metres away: from the cache, no second call.
    again = await grounding.answer("parking near the market?", 1.2849, 103.8321, "en", maps)
    assert again.cached and again.text == first.text
    assert len(fake.calls) == 1 and len(calls) == 1
    # Another area or language is a different answer.
    await grounding.answer("parking near the market?", 1.30, 103.83, "en", maps)
    await grounding.answer("parking near the market?", 1.2847, 103.832, "hi", maps)
    assert len(fake.calls) == 3
    await maps.close()


async def test_failures_fall_back_honestly_and_are_not_cached(tmp_path: Path) -> None:
    live = live_settings(tmp_path)
    maps = MapsService(live)
    fake = FakeGenai(error=RuntimeError("quota"))
    grounding = AreaGrounding(live, client=fake)
    failed = await grounding.answer("parking near me", 1.2847, 103.832, "en", maps)
    assert failed.status == "unavailable" and failed.text == "" and failed.sources == []
    await grounding.answer("parking near me", 1.2847, 103.832, "en", maps)
    assert len(fake.calls) == 2  # a failure is retried next time, never cached
    await maps.close()


def test_switch_off_never_calls_gemini_and_says_so(
    store: MerchantRepository, tmp_path: Path
) -> None:
    shared_shop(store)
    app = create_app(settings(tmp_path), InMemorySessionService())
    with TestClient(app) as client:
        app.state.merchant = store
        fake = FakeGenai()
        app.state.grounding.client = fake
        area = client.post(
            "/api/v1/discover/ask", json={"q": "is there parking near me?", **TIONG_BAHRU}
        ).json()
        assert area["area"] == {
            "status": "off",
            "text": "",
            "sources": [],
            "places": [],
            "widget_token": None,
            "demo": False,
            "cached": False,
        }
        assert area["intent"]["area"] is True
        product = client.post("/api/v1/discover/ask", json={"q": "kopi", **TIONG_BAHRU}).json()
        assert product["area"] is None
        assert fake.calls == []


def test_live_ask_returns_grounded_answer_with_our_shops_first(
    store: MerchantRepository, tmp_path: Path
) -> None:
    bid = shared_shop(store)
    app = create_app(live_settings(tmp_path), InMemorySessionService())
    with TestClient(app) as client:
        app.state.merchant = store
        fake = FakeGenai(response=grounded_response("Kopi spots nearby: Seng Poh is open."))
        app.state.grounding.client = fake
        body = client.post(
            "/api/v1/discover/ask", json={"q": "best kopi near me", **TIONG_BAHRU}
        ).json()
        # Our shop that sells kopi is still the first answer; Google's answer is added.
        assert body["groups"][0]["places"][0]["id"] == bid
        assert body["area"]["status"] == "ok"
        assert body["area"]["sources"][0]["title"] == "Seng Poh Car Park"
        # Demo maps (no server key): sources stay as links, no pins without coordinates.
        assert body["area"]["places"] == []
        # A refinement chip keeps the answer already on screen: no second paid call.
        client.post(
            "/api/v1/discover/ask",
            json={"q": "Cheaper", "refine": "price", "context": body["intent"], **TIONG_BAHRU},
        )
        assert len(fake.calls) == 1


def test_demo_mode_returns_labelled_sample_answers_with_pins(tmp_path: Path) -> None:
    app = create_app(
        Settings(
            app_env="test",
            v1_enabled=True,
            merchant_database=str(tmp_path / "route.sqlite"),
            recall_path=str(tmp_path / "recall"),
            maps_grounding="demo",
            _env_file=None,
        ),
        InMemorySessionService(),
    )
    with TestClient(app) as client:
        body = client.post(
            "/api/v1/discover/ask", json={"q": "parking near the market?", **TIONG_BAHRU}
        ).json()
        area = body["area"]
        assert area["status"] == "ok" and area["demo"] is True
        assert area["text"].startswith("Sample answer")
        assert len(area["places"]) == len(area["sources"]) == 2
        assert all(p["distance_m"] < 400 for p in area["places"])


def test_live_switch_requires_a_model_and_project(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="model"):
        Settings(app_env="test", maps_grounding="live", _env_file=None)
    with pytest.raises(ValueError, match="project"):
        Settings(
            app_env="test",
            maps_grounding="live",
            maps_grounding_model="m",
            _env_file=None,
        )


def sse_events(text: str) -> dict[str, dict[str, Any]]:
    """The last data of each event kind in a server-sent event stream."""
    events: dict[str, dict[str, Any]] = {}
    for block in text.replace("\r\n", "\n").split("\n\n"):
        lines = block.split("\n")
        kind = next((line[7:].strip() for line in lines if line.startswith("event: ")), "")
        data = "".join(line[6:] for line in lines if line.startswith("data: "))
        if kind and data:
            events[kind] = json.loads(data)
    return events


def test_streamed_ask_ranks_our_shops_instantly_then_adds_the_grounded_answer(
    store: MerchantRepository, tmp_path: Path
) -> None:
    bid = shared_shop(store)
    app = create_app(live_settings(tmp_path), InMemorySessionService())
    with TestClient(app) as client:
        app.state.merchant = store
        fake = FakeGenai(response=grounded_response("Kopi spots nearby: Seng Poh is open."))
        app.state.grounding.client = fake
        response = client.post(
            "/api/v1/discover/ask",
            json={"q": "best kopi near me", **TIONG_BAHRU},
            headers={"Accept": "text/event-stream"},
        )
        events = sse_events(response.text)
        # The instant answer is our shop, ranked by the search engine, before any Google call.
        instant = events["instant"]
        assert instant["groups"][0]["places"][0]["id"] == bid
        assert instant["engine"] == "fixture"
        assert instant["area"] is None
        # The complete answer keeps our shop first and adds Google's grounded area answer.
        complete = events["complete"]
        assert complete["groups"][0]["places"][0]["id"] == bid
        assert complete["engine"] == "fixture"
        assert complete["area"]["status"] == "ok"
        assert complete["intent"]["area"] is True
        assert len(fake.calls) == 1
