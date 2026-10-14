import io

from fastapi.testclient import TestClient
from PIL import Image

from app.photos import ExtractedBusiness, PhotoExtraction, read_gps, sanitize
from tests.test_photos import app, join, upload  # noqa: F401

# Katong, Singapore: 1.305 N, 103.905 E as EXIF degrees/minutes/seconds.
KATONG = {1: "N", 2: (1.0, 18.0, 18.0), 3: "E", 4: (103.0, 54.0, 18.0)}


def located_jpeg(gps: dict | None = KATONG) -> bytes:
    image = Image.new("RGB", (64, 48), (240, 200, 120))
    output = io.BytesIO()
    metadata = Image.Exif()
    if gps:
        metadata[0x8825] = gps
    image.save(output, format="JPEG", exif=metadata)
    return output.getvalue()


def test_read_gps_handles_hemispheres_and_missing_or_bad_data() -> None:
    assert read_gps(located_jpeg()) == (1.305, 103.905)
    south_west = {**KATONG, 1: "S", 3: "W"}
    assert read_gps(located_jpeg(south_west)) == (-1.305, -103.905)
    assert read_gps(located_jpeg(None)) is None
    assert read_gps(located_jpeg({1: "N", 2: (1.0, 18.0, 18.0)})) is None  # no longitude
    assert read_gps(located_jpeg({1: "N", 2: (0.0, 0.0, 0.0), 3: "E", 4: (0.0, 0.0, 0.0)})) is None
    assert read_gps(b"not an image") is None
    # The stored image never keeps the location.
    assert not Image.open(io.BytesIO(sanitize(located_jpeg()))).getexif()


def test_new_shop_photo_proposes_its_location_as_the_pin(app) -> None:  # noqa: F811
    with TestClient(app) as client:
        join(client)
        proposal = upload(client, located_jpeg()).json()["proposal"]
        business = proposal["snapshot"]["business"]
        assert (business["lat"], business["lng"]) == (1.305, 103.905)
        assert business["pin_label"] == "1.30500, 103.90500"  # demo maps: no address lookup
        assert client.get("/api/v1/businesses").json() == []  # only proposed
        saved = client.post(
            f"/api/v1/proposals/{proposal['id']}/approve", json={"digest": proposal["digest"]}
        ).json()
        shop = next(s for s in client.get("/api/v1/businesses").json())
        assert shop["id"] == saved["business_id"]
        assert (shop["fields"]["lat"], shop["fields"]["lng"]) == (1.305, 103.905)


def test_storefront_photo_proposes_a_pin_for_a_shop_without_one(app, monkeypatch) -> None:  # noqa: F811
    with TestClient(app) as client:
        join(client)
        first = upload(client, located_jpeg(None)).json()["proposal"]
        bid = client.post(
            f"/api/v1/proposals/{first['id']}/approve", json={"digest": first["digest"]}
        ).json()["business_id"]

        async def storefront(image: bytes) -> PhotoExtraction:
            return PhotoExtraction(
                photo_kind="storefront", business=ExtractedBusiness(name="Katong Kopi")
            )

        monkeypatch.setattr(app.state.photos, "extract", storefront)
        body = upload(client, located_jpeg(), f"?business_id={bid}").json()
        assert body["status"] == "needs_review"
        business = body["proposal"]["snapshot"]["business"]
        assert business["name"] == "Offline Fixture Tea Stall"  # existing details kept
        assert (business["lat"], business["lng"]) == (1.305, 103.905)
        # A photo without location changes nothing.
        assert upload(client, located_jpeg(None), f"?business_id={bid}").json()["proposal"] is None


def test_existing_menu_photo_links_separate_pin_approval_and_rejects_stale(app) -> None:  # noqa: F811
    with TestClient(app) as client:
        join(client)
        first = upload(client, located_jpeg(None)).json()["proposal"]
        bid = client.post(
            f"/api/v1/proposals/{first['id']}/approve", json={"digest": first["digest"]}
        ).json()["business_id"]
        body = upload(client, located_jpeg(), f"?business_id={bid}").json()
        menu, pin = body["proposal"], body["pin_proposal"]
        assert menu["snapshot"]["kind"] == "inventory"
        assert pin["snapshot"]["kind"] == "business"
        assert menu["snapshot"]["business_id"] == pin["snapshot"]["business_id"] == bid
        assert (pin["snapshot"]["business"]["lat"], pin["snapshot"]["business"]["lng"]) == (
            1.305,
            103.905,
        )
        assert client.get("/api/v1/businesses").json()[0]["fields"].get("lat") is None
        assert (
            client.post(
                f"/api/v1/proposals/{menu['id']}/approve", json={"digest": menu["digest"]}
            ).status_code
            == 200
        )
        assert (
            client.post(
                f"/api/v1/proposals/{pin['id']}/approve", json={"digest": pin["digest"]}
            ).status_code
            == 409
        )
        # Explicit new review at the current revision, never a silent rebase/commit.
        current = client.get("/api/v1/businesses").json()[0]
        revised = client.post(
            "/api/v1/proposals",
            json={
                **pin["snapshot"],
                "revision": current["revision"],
            },
        ).json()
        assert client.get("/api/v1/businesses").json()[0]["fields"].get("lat") is None
        assert (
            client.post(
                f"/api/v1/proposals/{revised['id']}/approve", json={"digest": revised["digest"]}
            ).status_code
            == 200
        )
        assert client.get("/api/v1/businesses").json()[0]["fields"]["lat"] == 1.305
        assert upload(client, located_jpeg(), f"?business_id={bid}").json()["pin_proposal"] is None
