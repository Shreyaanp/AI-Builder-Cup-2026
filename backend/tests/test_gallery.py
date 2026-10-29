import io
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from google.adk.sessions import InMemorySessionService
from PIL import Image

from app.main import create_app
from app.photos import FIXTURE_BLOCK_WIDTH
from app.settings import Settings
from tests.test_photo_location import located_jpeg
from tests.test_photos import join, upload


@pytest.fixture
def app(tmp_path: Path):
    settings = Settings(
        app_env="test",
        v1_enabled=True,
        merchant_database=str(tmp_path / "merchant.sqlite3"),
        recall_path=str(tmp_path / "recall"),
        media_dir=str(tmp_path / "media"),
        _env_file=None,
    )
    return create_app(settings, InMemorySessionService())


def shop(client: TestClient) -> str:
    first = upload(client, located_jpeg()).json()["proposal"]
    return str(
        client.post(
            f"/api/v1/proposals/{first['id']}/approve", json={"digest": first["digest"]}
        ).json()["business_id"]
    )


def add(client: TestClient, bid: str, data: bytes):
    return client.post(
        f"/api/v1/businesses/{bid}/gallery", content=data, headers={"content-type": "image/jpeg"}
    )


def test_gallery_is_owner_only_moderated_stripped_and_public_only_when_shared(app) -> None:
    with TestClient(app) as client:
        join(client)
        bid = shop(client)
        added = add(client, bid, located_jpeg())
        assert added.status_code == 200
        photo = added.json()["photo_id"]
        assert added.json()["gallery"] == [photo]
        # Explicit content never enters the gallery.
        blocked = Image.new("RGB", (FIXTURE_BLOCK_WIDTH, 48))
        data = io.BytesIO()
        blocked.save(data, format="JPEG")
        assert add(client, bid, data.getvalue()).status_code == 422
        # The owner sees it; the stored image carries no location metadata.
        owner = client.get(f"/api/v1/businesses/{bid}/gallery/{photo}.jpg")
        assert owner.status_code == 200
        assert not Image.open(io.BytesIO(owner.content)).getexif()
        # Customers only see photos of shared shops.
        public = f"/api/v1/public/shops/{bid}/photos/{photo}.jpg"
        assert client.get(public).status_code == 404
        client.post(f"/api/v1/businesses/{bid}/share", json={"public": True})
        served = client.get(public)
        assert served.status_code == 200
        assert "immutable" in served.headers["cache-control"]
        assert client.get(f"/api/v1/public/shops/{bid}").json()["gallery"] == [photo]
        # Its first photo becomes the shop's picture in discovery (the shop's pin is Katong).
        found = client.get("/api/v1/discover", params={"lat": 1.305, "lng": 103.905}).json()
        mine = next(p for p in found["places"] if p["id"] == bid)
        assert mine["photo_url"] == public
    # Another owner can neither add to nor read this gallery.
    with TestClient(app) as stranger:
        join(stranger)
        assert add(stranger, bid, located_jpeg()).status_code == 404
        assert stranger.get(f"/api/v1/businesses/{bid}/gallery/{photo}.jpg").status_code == 404


def test_remove_and_limit(app) -> None:
    with TestClient(app) as client:
        join(client)
        bid = shop(client)
        client.post(f"/api/v1/businesses/{bid}/share", json={"public": True})
        ids = [add(client, bid, located_jpeg()).json()["photo_id"] for _ in range(12)]
        assert add(client, bid, located_jpeg()).status_code == 409  # gallery is full
        removed = client.delete(f"/api/v1/businesses/{bid}/gallery/{ids[0]}")
        assert removed.json()["gallery"] == ids[1:]
        assert client.get(f"/api/v1/public/shops/{bid}/photos/{ids[0]}.jpg").status_code == 404
        assert client.get(f"/api/v1/public/shops/{bid}/photos/{ids[1]}.jpg").status_code == 200
        assert client.get(f"/api/v1/public/shops/{bid}/photos/../x.jpg").status_code == 404


def phone_photo() -> bytes:
    """A real-size phone photo (well over the 16 KB JSON body limit)."""
    import random

    rng = random.Random(7)
    image = Image.new("RGB", (1600, 1200))
    image.putdata([(rng.randrange(256), rng.randrange(256), rng.randrange(256))] * 1600 * 1200)
    noise = Image.effect_noise((1600, 1200), 80).convert("RGB")
    out = io.BytesIO()
    Image.blend(image, noise, 0.6).save(out, "JPEG", quality=92)
    return out.getvalue()


def test_real_size_phone_photos_reach_the_gallery_and_close_the_day(app) -> None:
    data = phone_photo()
    assert len(data) > 200_000
    with TestClient(app) as client:
        join(client)
        bid = shop(client)
        added = add(client, bid, data)
        assert added.status_code == 200, added.text
        read = client.post(
            f"/api/v1/businesses/{bid}/day/read?kind=sales",
            content=data,
            headers={"content-type": "image/jpeg"},
        )
        assert read.status_code == 200, read.text


def test_gallery_photos_keep_their_kind_for_grouping_issue_482(app) -> None:
    """OB-39 / #482: the owner's Photos sheet groups by kind, so the kind must be stored."""
    with TestClient(app) as client:
        join(client)
        bid = shop(client)
        front = client.post(
            f"/api/v1/businesses/{bid}/gallery?kind=storefront",
            content=located_jpeg(),
            headers={"content-type": "image/jpeg"},
        )
        assert front.status_code == 200 and front.json()["kind"] == "storefront"
        plain = add(client, bid, located_jpeg()).json()["photo_id"]  # no kind given
        bad = client.post(
            f"/api/v1/businesses/{bid}/gallery?kind=selfie",
            content=located_jpeg(),
            headers={"content-type": "image/jpeg"},
        )
        assert bad.status_code == 422
        business = next(b for b in client.get("/api/v1/businesses").json() if b["id"] == bid)
        assert business["photo_kinds"] == {front.json()["photo_id"]: "storefront", plain: "other"}
        assert client.delete(f"/api/v1/businesses/{bid}/gallery/{plain}").status_code == 200
        after = next(b for b in client.get("/api/v1/businesses").json() if b["id"] == bid)
        assert after["photo_kinds"] == {front.json()["photo_id"]: "storefront"}


def test_upload_reaches_the_customer_page_and_cover_can_be_changed_issue_481(app) -> None:
    """OB-21 / #481: a photo the owner uploads is what customers get; the first one is the cover."""
    with TestClient(app) as client:
        join(client)
        bid = shop(client)
        first = add(client, bid, located_jpeg()).json()["photo_id"]
        second = add(client, bid, located_jpeg()).json()["photo_id"]
        assert client.post(f"/api/v1/businesses/{bid}/gallery/{'0' * 36}/cover").status_code == 404
        covered = client.post(f"/api/v1/businesses/{bid}/gallery/{second}/cover")
        assert covered.json()["gallery"] == [second, first]
        client.post(f"/api/v1/businesses/{bid}/share", json={"public": True})
        public = f"/api/v1/public/shops/{bid}"
        assert client.get(f"{public}/photos/{second}.jpg").status_code == 200
        assert client.get(public).json()["gallery"] == [second, first]
        found = client.get("/api/v1/discover", params={"lat": 1.305, "lng": 103.905}).json()
        mine = next(p for p in found["places"] if p["id"] == bid)
        assert mine["photo_url"] == f"{public}/photos/{second}.jpg"
