import io
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from google.adk.sessions import InMemorySessionService
from PIL import Image

from app.icons import ICON_SIDE
from app.main import create_app
from app.photos import FIXTURE_BLOCK_WIDTH
from app.settings import Settings
from tests.test_gallery import add, shop
from tests.test_photo_location import located_jpeg
from tests.test_photos import join


def picture(width: int, height: int, colour=(200, 60, 40)) -> bytes:
    out = io.BytesIO()
    Image.new("RGB", (width, height), colour).save(out, format="JPEG")
    return out.getvalue()


class StubGenerator:
    """Stands in for the Gemini image model: no network, counts its calls."""

    def __init__(self, result: bytes | None) -> None:
        self.result = result
        self.calls: list[tuple[str, str, str]] = []
        self.available = True

    async def generate(self, name: str, kind: str, region: str) -> bytes | None:
        self.calls.append((name, kind, region))
        return self.result


@pytest.fixture
def stub() -> StubGenerator:
    return StubGenerator(picture(1024, 1024))


@pytest.fixture
def app(tmp_path: Path, stub: StubGenerator):
    settings = Settings(
        app_env="test",
        v1_enabled=True,
        merchant_database=str(tmp_path / "merchant.sqlite3"),
        recall_path=str(tmp_path / "recall"),
        media_dir=str(tmp_path / "media"),
        shop_icon_ai=True,
        _env_file=None,
    )
    built = create_app(settings, InMemorySessionService())
    built.state.icon_generator = stub
    return built


def base(bid: str) -> str:
    return f"/api/v1/businesses/{bid}/icon"


def test_make_my_icon_uses_name_kind_and_region_and_is_square(app, stub) -> None:
    with TestClient(app) as client:
        join(client)
        bid = shop(client)
        made = client.post(f"{base(bid)}/generate")
        assert made.status_code == 200, made.text
        assert made.json()["source"] == "ai"
        name, kind, region = stub.calls[0]
        assert name and kind  # from the saved shop, not from the request
        icon = made.json()["icon"]
        owner = client.get(f"{base(bid)}/{icon}.jpg")
        assert owner.status_code == 200
        assert Image.open(io.BytesIO(owner.content)).size == (ICON_SIDE, ICON_SIDE)
        assert client.get("/api/v1/businesses").json()[0]["icon"] == icon
        # Customers see it only once the shop is shared.
        public = f"/api/v1/public/shops/{bid}/icon/{icon}.jpg"
        assert client.get(public).status_code == 404
        client.post(f"/api/v1/businesses/{bid}/share", json={"public": True})
        assert client.get(public).status_code == 200
        assert client.get(f"/api/v1/public/shops/{bid}").json()["icon"] == icon
        found = client.get("/api/v1/discover", params={"lat": 1.305, "lng": 103.905}).json()
        assert next(p for p in found["places"] if p["id"] == bid)["icon_url"] == public


def test_at_most_three_generations_per_shop_per_day(app, stub) -> None:
    with TestClient(app) as client:
        join(client)
        bid = shop(client)
        for _ in range(3):
            assert client.post(f"{base(bid)}/generate").status_code == 200
        blocked = client.post(f"{base(bid)}/generate")
        assert blocked.status_code == 429
        assert blocked.json()["detail"] == "ICON_DAILY_LIMIT"
        assert len(stub.calls) == 3  # the guard stops the spend, not just the answer
        # Uploading is free and still works after the limit.
        assert client.put(base(bid), content=picture(300, 200), headers=JPEG).status_code == 200


JPEG = {"content-type": "image/jpeg"}


def test_failed_generation_keeps_the_old_icon_and_says_so(app, stub) -> None:
    with TestClient(app) as client:
        join(client)
        bid = shop(client)
        first = client.post(f"{base(bid)}/generate").json()["icon"]
        stub.result = None
        failed = client.post(f"{base(bid)}/generate")
        assert failed.status_code == 503
        assert failed.json()["detail"] == "ICON_UNAVAILABLE"
        assert client.get(base(bid)).json()["icon"] == first


def test_ai_off_falls_back_without_calling_the_model(app, stub) -> None:
    stub.available = False
    with TestClient(app) as client:
        join(client)
        bid = shop(client)
        status = client.get(base(bid)).json()
        assert status == {"icon": None, "ai_available": False}
        off = client.post(f"{base(bid)}/generate")
        assert off.status_code == 503 and off.json()["detail"] == "ICON_AI_OFF"
        assert stub.calls == []


def test_upload_crops_to_square_replaces_and_removes_the_old_picture(app) -> None:
    with TestClient(app) as client:
        join(client)
        bid = shop(client)
        one = client.put(base(bid), content=picture(900, 300), headers=JPEG).json()["icon"]
        two = client.put(base(bid), content=picture(300, 900), headers=JPEG).json()["icon"]
        assert one != two
        assert client.get(f"{base(bid)}/{one}.jpg").status_code == 404  # replaced
        stored = client.get(f"{base(bid)}/{two}.jpg")
        assert Image.open(io.BytesIO(stored.content)).size == (ICON_SIDE, ICON_SIDE)
        assert client.delete(base(bid)).json() == {"icon": None}
        assert client.get(f"{base(bid)}/{two}.jpg").status_code == 404


def test_upload_rejects_explicit_wrong_type_and_unreadable_pictures(app) -> None:
    with TestClient(app) as client:
        join(client)
        bid = shop(client)
        assert (
            client.put(
                base(bid), content=picture(FIXTURE_BLOCK_WIDTH, 48), headers=JPEG
            ).status_code
            == 422
        )
        gif = client.put(base(bid), content=b"GIF89a", headers={"content-type": "image/gif"})
        assert gif.status_code == 415
        broken = client.put(base(bid), content=b"\xff\xd8\xff" + b"\x00" * 64, headers=JPEG)
        assert broken.status_code == 415
        assert client.get(base(bid)).json()["icon"] is None  # nothing half-saved


def test_use_gallery_photo_as_icon_and_owner_only(app) -> None:
    with TestClient(app) as client:
        join(client)
        bid = shop(client)
        photo = add(client, bid, located_jpeg()).json()["photo_id"]
        made = client.post(f"{base(bid)}/from-gallery/{photo}")
        assert made.status_code == 200 and made.json()["source"] == "gallery"
        assert client.post(f"{base(bid)}/from-gallery/{'0' * 36}").status_code == 404
    with TestClient(app) as stranger:
        join(stranger)
        assert stranger.put(base(bid), content=picture(64, 64), headers=JPEG).status_code == 404
        assert stranger.post(f"{base(bid)}/generate").status_code == 404
        assert stranger.delete(base(bid)).status_code == 404
