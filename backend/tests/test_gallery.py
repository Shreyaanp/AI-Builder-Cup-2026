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
