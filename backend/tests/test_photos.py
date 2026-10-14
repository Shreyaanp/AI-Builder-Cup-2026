import io
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from google.adk.sessions import InMemorySessionService
from PIL import Image

from app.main import create_app
from app.photos import FIXTURE_BLOCK_WIDTH, PhotoRejected, sanitize
from app.settings import Settings


def jpeg(width: int = 64, *, exif: bool = False) -> bytes:
    image = Image.new("RGB", (width, 48), (240, 200, 120))
    output = io.BytesIO()
    if exif:
        metadata = Image.Exif()
        metadata[0x8825] = {2: (12.0, 58.0, 0.0)}  # GPS latitude
        image.save(output, format="JPEG", exif=metadata)
    else:
        image.save(output, format="JPEG")
    return output.getvalue()


@pytest.fixture
def app(tmp_path: Path):
    settings = Settings(
        app_env="test",
        v1_enabled=True,
        merchant_database=str(tmp_path / "merchant.sqlite3"),
        recall_path=str(tmp_path / "recall"),
        _env_file=None,
    )
    return create_app(settings, InMemorySessionService())


def join(client: TestClient) -> None:
    """Start a local workspace and accept the current Terms and Privacy Notice."""
    client.get("/api/v1/bootstrap")
    version = client.get("/api/v1/me").json()["legal_version"]
    accepted = client.post(
        "/api/v1/consent", json={"version": version, "terms": True, "privacy": True}
    )
    assert accepted.status_code == 200


def upload(client: TestClient, data: bytes, query: str = "", mime: str = "image/jpeg"):
    return client.post(f"/api/v1/photos{query}", content=data, headers={"content-type": mime})


def test_sanitize_strips_metadata_and_rejects_non_images() -> None:
    original = jpeg(exif=True)
    assert Image.open(io.BytesIO(original)).getexif()
    cleaned = sanitize(original)
    assert not Image.open(io.BytesIO(cleaned)).getexif()
    for bad in [b"%PDF-1.7 not an image", b"\xff\xd8\xff" + b"\x00" * 64]:
        with pytest.raises(PhotoRejected):
            sanitize(bad)


def test_explicit_photo_is_blocked_before_extraction_or_storage(app) -> None:
    with TestClient(app) as client:
        join(client)
        blocked = upload(client, jpeg(FIXTURE_BLOCK_WIDTH))
        assert blocked.status_code == 422
        assert blocked.json()["detail"] == "PHOTO_BLOCKED"
        assert client.get("/api/v1/businesses").json() == []
        assert upload(client, b"GIF89a", mime="image/gif").status_code == 415


def test_clean_photo_becomes_a_reviewable_proposal_only(app) -> None:
    with TestClient(app) as client:
        join(client)
        response = upload(client, jpeg())
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "needs_review"
        assert body["google_publication"] == "not_connected"
        assert body["photo_id"] is None  # no bucket configured locally
        proposal = body["proposal"]
        assert proposal["snapshot"]["business"]["name"] == "Offline Fixture Tea Stall"
        assert client.get("/api/v1/businesses").json() == []  # nothing saved without approval
        saved = client.post(
            f"/api/v1/proposals/{proposal['id']}/approve", json={"digest": proposal["digest"]}
        ).json()
        bid = saved["business_id"]
        priced = upload(client, jpeg(), f"?business_id={bid}").json()
        assert priced["proposal"]["snapshot"]["products"] == [
            {"name": "Chai", "price": 1500, "unit": "cup", "stock": None, "available": True}
        ]
    with TestClient(app) as stranger:
        join(stranger)
        assert upload(stranger, jpeg(), f"?business_id={bid}").status_code == 404


def test_zero_decimal_currency_stores_whole_units(app) -> None:
    with TestClient(app) as client:
        join(client)
        proposal = upload(client, jpeg(), "?currency=jpy").json()["proposal"]
        assert proposal["snapshot"]["business"]["currency"] == "JPY"
        saved = client.post(
            f"/api/v1/proposals/{proposal['id']}/approve", json={"digest": proposal["digest"]}
        ).json()
        # The shop's saved currency wins over the query once the shop exists.
        priced = upload(client, jpeg(), f"?business_id={saved['business_id']}&currency=SGD")
        assert priced.json()["proposal"]["snapshot"]["products"][0]["price"] == 15
        assert (
            upload(client, jpeg(), "?currency=S%24").json()["proposal"]["snapshot"]["business"][
                "currency"
            ]
            == "SGD"
        )


def test_oversized_photo_is_rejected(app) -> None:
    with TestClient(app) as client:
        join(client)
        assert upload(client, b"\xff\xd8\xff" + b"\x00" * 5_000_001).status_code == 413
