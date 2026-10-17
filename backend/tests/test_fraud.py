"""Listing fraud rules on fixed fictional listings, and the review flow they feed."""

import io
import json
from pathlib import Path
from typing import Any

import numpy as np
import pytest
from fastapi.testclient import TestClient
from google.adk.sessions import InMemorySessionService
from PIL import Image

from app import fraud, trust
from app.main import create_app
from tests.test_trust import new_owner, settings

FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "fraud_listings.json").read_text())


@pytest.fixture(scope="module")
def found() -> dict[str, list[dict[str, Any]]]:
    return fraud.scan(FIXTURE["shops"])


@pytest.mark.parametrize("shop", FIXTURE["shops"], ids=lambda shop: shop["id"])
def test_each_fixture_shop_gets_exactly_the_expected_rules(shop, found):
    rules = sorted({reason["rule"] for reason in found.get(shop["id"], [])})
    assert rules == sorted(shop.get("expect", []))


def test_an_owner_reusing_their_own_phone_menu_and_photos_is_not_flagged(found):
    # chai-1 and chai-second-branch share an owner: only the stranger's shop is named.
    others = {reason.get("other_id") for reason in found["chai-1"] if reason.get("other_id")}
    assert others == {"chai-copy"}


def test_price_reasons_name_the_item_and_the_usual_price(found):
    details = [reason["detail"] for reason in found["pricey"]]
    assert "Masala chai at 20000.00 INR; usually about 20.00 INR" in details
    assert "Free water at 0.00 INR: zero or below" in details
    owner = [reason["owner_detail"] for reason in found["pricey"]]
    # What the owner reads has no English words: item · price.
    assert "Masala chai · ₹20,000.00" in owner


def test_a_price_far_off_the_shops_own_range_is_flagged_without_other_shops():
    shop = {
        "id": "s",
        "name": "Solo",
        "currency": "SGD",
        "products": [
            {"name": "Kopi", "price": 180},
            {"name": "Teh", "price": 160},
            {"name": "Toast", "price": 250},
            {"name": "Eggs", "price": 200},
            {"name": "Milo", "price": 2_500_000},
        ],
    }
    assert [r["detail"] for r in fraud.price_reasons(shop, [shop])] == [
        "Milo at 25000.00 SGD; the shop's other items are about 2.00 SGD"
    ]


@pytest.mark.parametrize(
    ("name", "brand"),
    [
        ("Starbux Coffee", None),  # Misspellings are Gemini's job; the rule stays exact.
        ("St4rbucks Reserve", "starbucks"),
        ("McDonald's Family Restaurant", "mcdonalds"),
        ("Domino’s Pizza Point", "dominos"),
        ("Ya Kun Kaya Toast stall", "ya kun"),
        ("Kentucky Courtyard", None),
        ("Subwayside Snacks", None),
        ("Zarathustra Books", None),
    ],
)
def test_brand_names_are_matched_on_whole_words(name, brand):
    assert fraud.brand_in(name) == brand


def test_brand_fixture_uses_the_listed_brand(found):
    assert [r["owner_detail"] for r in found["brand-plain"]] == ["kfc"]


def test_phone_numbers_compare_on_their_last_digits():
    assert fraud.phone_key("+91 98450 12345") == fraud.phone_key("098450-12345")
    assert fraud.phone_key("12") == ""


def test_photo_prints_survive_resizing_and_recompression():
    pixels = np.random.default_rng(7).integers(0, 255, (48, 64, 3), dtype=np.uint8)
    image = Image.fromarray(pixels).resize((256, 192), Image.Resampling.BILINEAR)

    def jpeg(img: Image.Image, quality: int) -> bytes:
        out = io.BytesIO()
        img.save(out, format="JPEG", quality=quality)
        return out.getvalue()

    original = fraud.dhash(jpeg(image, 95))
    smaller = fraud.dhash(jpeg(image.resize((320, 240)), 60))
    different = fraud.dhash(jpeg(image.rotate(90, expand=True), 95))
    assert fraud.distance(original, smaller) <= fraud.PHOTO_DISTANCE
    assert fraud.distance(original, different) > fraud.PHOTO_DISTANCE


def test_flags_open_a_review_the_owner_sees_calmly_and_never_change_the_shop(tmp_path: Path):
    with TestClient(create_app(settings(tmp_path), InMemorySessionService())) as client:
        new_owner(client, "Courtyard Chai", phone="+91 98450 12345")
        # Approving and sharing runs the check in the background; nothing waits for it.
        copy = new_owner(client, "Courtyard Chai Two", phone="098450-12345")
        status = client.get("/api/v1/trust").json()
        notice = next(n for n in status["notices"] if n["kind"] == "listing")
        assert notice == {
            "id": f"listing:{copy}",
            "kind": "listing",
            "business_id": copy,
            "shop": "Courtyard Chai Two",
            "reasons": [{"rule": "shared_phone", "detail": "098450-12345"}],
        }
        # The owner never sees the other shop's name; the reviewer does.
        assert "Courtyard Chai”" not in json.dumps(notice)
        review = next(item for item in status["queue"] if item["id"] == f"listing:{copy}")
        assert review["reasons"] == [
            {
                "rule": "shared_phone",
                "detail": "Same phone as Courtyard Chai",
                "source": "rules",
                # The reviewer's own language builds the sentence from these.
                "owner_detail": "098450-12345",
                "other": "Courtyard Chai",
            }
        ]
        public = client.get(f"/api/v1/public/shops/{copy}")
        assert public.status_code == 200 and public.json()["name"] == "Courtyard Chai Two"

        # The reviewer decides; the same reasons do not reopen it on the next scan.
        client.post(f"/api/v1/trust/reviews/listing:{copy}", json={"decision": "cleared"})
        assert client.post("/api/v1/trust/scan").json()["flagged"] == 1  # the first shop
        items = {item["id"]: item for item in client.get("/api/v1/trust").json()["queue"]}
        assert items[f"listing:{copy}"]["status"] == "cleared"


def test_a_fixed_listing_resolves_its_open_flag(tmp_path: Path):
    with TestClient(create_app(settings(tmp_path), InMemorySessionService())) as client:
        bid = new_owner(
            client, "Lakeside Tea", products=[{"name": "Chai", "price": 0, "unit": "cup"}]
        )
        store = client.app.state.community.docs  # type: ignore[attr-defined]
        assert store.get(trust.REVIEW_KIND, f"listing:{bid}")["status"] == "open"
        shop = client.get("/api/v1/businesses").json()[0]
        fixed = client.post(
            "/api/v1/proposals",
            json={
                "kind": "inventory",
                "business_id": bid,
                "revision": shop["revision"],
                "products": [{"name": "Chai", "price": 2000, "unit": "cup"}],
            },
        ).json()
        client.post(f"/api/v1/proposals/{fixed['id']}/approve", json={"digest": fixed["digest"]})
        assert store.get(trust.REVIEW_KIND, f"listing:{bid}")["status"] == "resolved"


async def test_gemini_second_look_is_off_offline():
    reviewer = fraud.FraudReviewer(settings(Path(".")))
    assert await reviewer.review({"name": "Starbux", "products": []}, []) == []


async def test_gemini_reasons_are_validated_and_added(tmp_path: Path, monkeypatch):
    class Reply:
        text = json.dumps(
            {
                "reasons": [
                    {
                        "rule": "brand_impersonation",
                        "detail": "Name imitates Starbucks.",
                        "owner_detail": "Starbux",
                    }
                ]
            }
        )

    class Models:
        async def generate_content(self, **kwargs):
            assert "Starbux" in kwargs["contents"]
            return Reply()

    class Client:
        class aio:  # noqa: N801 - mirrors google.genai's client shape
            models = Models()

            @staticmethod
            async def aclose():
                return None

    reviewer = fraud.FraudReviewer(
        settings(
            tmp_path,
            coach_mode="gemini",
            google_text_model="m",
            google_live_model="m",
            google_cloud_project="p",
        )
    )
    reviewer._client = Client()
    reasons = await reviewer.review({"name": "Starbux", "currency": "INR", "products": []}, [])
    assert [r.rule for r in reasons] == ["brand_impersonation"]
