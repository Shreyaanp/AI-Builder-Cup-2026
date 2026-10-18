import io
from pathlib import Path
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient
from google.adk.sessions import InMemorySessionService
from PIL import Image

from app.main import create_app
from app.photos import FIXTURE_BLOCK_WIDTH, PhotoPipeline, PhotoRejected, header_gps, sanitize
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


def test_gcs_uploads_set_cache_metadata_without_making_objects_public() -> None:
    pipeline = PhotoPipeline(Settings(_env_file=None, media_bucket="fixture-private-bucket"))
    bucket = Mock()
    pipeline._bucket = bucket
    blob = bucket.blob.return_value
    pipeline.store_sync("fixture-owner", None, b"sanitized-intake")
    assert blob.cache_control == "private, no-store"
    blob.upload_from_string.assert_called_once_with(b"sanitized-intake", content_type="image/jpeg")
    blob.reset_mock()
    pipeline.save_gallery_sync("fixture-shop", "fixture-photo", b"sanitized-gallery")
    assert blob.cache_control == "private, max-age=3600"
    blob.upload_from_string.assert_called_once_with(b"sanitized-gallery", content_type="image/jpeg")
    blob.make_public.assert_not_called()


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
            {
                "name": "Chai",
                "category": "drinks",
                "price": 1500,
                "unit": "cup",
                "stock": None,
                "available": True,
            }
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
        assert upload(client, b"\xff\xd8\xff" + b"\x00" * 20_000_001).status_code == 413


def test_big_modern_phone_photo_is_accepted_and_shrunk() -> None:
    # A 12000x9000 (108 MP) JPEG, as a flagship phone camera produces.
    image = Image.effect_noise((12000, 9000), 40).convert("RGB")
    output = io.BytesIO()
    image.save(output, format="JPEG", quality=92)
    data = output.getvalue()
    assert len(data) > 5_000_000  # the old limit rejected photos like this
    cleaned = Image.open(io.BytesIO(sanitize(data)))
    assert max(cleaned.size) <= 1600


def test_header_gps_accepts_only_a_real_location() -> None:
    assert header_gps("12.9716,77.5946") == (12.9716, 77.5946)
    for bad in (None, "", "12.9", "a,b", "91,10", "10,181", "0,0", "nan,nan", "1,2,3"):
        assert header_gps(bad) is None


@pytest.mark.anyio
async def test_moderation_and_extraction_run_together_and_a_block_wins() -> None:
    import asyncio
    import time

    pipeline = PhotoPipeline(Settings(_env_file=None, media_dir="unused"))
    delay = 0.3

    def slow_moderation(image: bytes) -> dict[str, int]:
        time.sleep(delay)
        return {"adult": 1, "racy": 1, "violence": 1}

    original = pipeline.extract

    async def slow_extract(image: bytes, language: str = "en"):  # noqa: ANN202
        await asyncio.sleep(delay)
        return await original(image, language)

    pipeline.moderate_sync = slow_moderation  # type: ignore[method-assign]
    pipeline.extract = slow_extract  # type: ignore[method-assign]
    pipeline.store_sync = lambda *args: "p1"  # type: ignore[method-assign]
    started = time.perf_counter()
    outcome = await pipeline.process("u", None, jpeg())
    assert outcome["photo_id"] == "p1"
    assert time.perf_counter() - started < delay * 1.8  # sequential would be 2x

    pipeline.moderate_sync = lambda image: {"adult": 5, "racy": 1, "violence": 1}  # type: ignore[method-assign]
    with pytest.raises(PhotoRejected) as blocked:
        await pipeline.process("u", None, jpeg())
    assert blocked.value.code == "PHOTO_BLOCKED"


def test_ob37_classify_accepts_a_5mb_photo_not_413(app) -> None:
    """OB-37: the JSON body limit used to reject big chat photos before the route saw them."""
    with TestClient(app) as client:
        join(client)
        image = Image.effect_noise((1800, 1800), 90).convert("RGB")
        output = io.BytesIO()
        image.save(output, format="JPEG", quality=100, subsampling=0)
        big = output.getvalue()
        if len(big) < 5_000_000:
            big += b"\0" * (5_000_000 - len(big))  # trailing padding, still a valid JPEG
        sent = client.post(
            "/api/v1/photos/classify",
            content=big,
            headers={"content-type": "image/jpeg"},
        )
        assert sent.status_code != 413, sent.text
        assert sent.status_code == 200, sent.text


def test_classify_names_the_kind_and_saves_nothing(app) -> None:
    with TestClient(app) as client:
        join(client)
        kinds = {21: "shop_photo", 22: "product", 23: "receipt", 24: "till", 25: "other"}
        kinds[64] = "menu"
        for width, kind in kinds.items():
            sent = client.post(
                "/api/v1/photos/classify",
                content=jpeg(width),
                headers={"content-type": "image/jpeg"},
            )
            assert sent.json() == {"kind": kind}
        blocked = client.post(
            "/api/v1/photos/classify",
            content=jpeg(FIXTURE_BLOCK_WIDTH),
            headers={"content-type": "image/jpeg"},
        )
        assert blocked.status_code == 422
        assert client.get("/api/v1/businesses").json() == []
