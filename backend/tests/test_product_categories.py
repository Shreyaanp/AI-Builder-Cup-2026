import pytest
from fastapi.testclient import TestClient

from app.coordinator import MerchantContext, ProductInput, current, propose_products
from app.merchant import BusinessFields, MerchantRepository, ProductFields, ProposalRequest
from app.product_categories import suggest_category
from tests.test_imports import make_shop
from tests.test_imports import upload as import_menu
from tests.test_photos import app, join, jpeg  # noqa: F401
from tests.test_photos import upload as photo

pytest_plugins = ("tests.test_merchant_store",)


def test_categories_persist_in_both_adapters_and_coach_preserves_them(store: MerchantRepository):
    proposal = store.propose(
        "owner",
        ProposalRequest(
            kind="business",
            business=BusinessFields(name="Katong Kopi"),
            products=[ProductFields(name="Kopi", category="drinks", price=180, available=False)],
        ),
    )
    bid = store.commit("owner", proposal["id"], proposal["digest"])["business_id"]
    assert store.inventory("owner", bid)[0]["category"] == "drinks"
    store.share("owner", bid, True)
    assert store.public_shop(bid)["products"][0]["category"] == "drinks"
    ctx = MerchantContext(store, "owner", bid, [])
    token = current.set(ctx)
    try:
        result = propose_products([ProductInput(name="Kopi", category="House specials")])
        sealed = ctx.proposals[result["proposal_id"]]
        assert sealed["snapshot"]["products"][0]["category"] == "House specials"
        assert sealed["snapshot"]["products"][0]["available"] is False
        assert store.inventory("owner", bid)[0]["category"] == "drinks"
        store.commit("owner", sealed["id"], sealed["digest"])
        preserve = propose_products([ProductInput(name="Kopi", price=2)])
        assert (
            ctx.proposals[preserve["proposal_id"]]["snapshot"]["products"][0]["category"]
            == "House specials"
        )
        clear = propose_products([ProductInput(name="Kopi", category="")])
        assert "category" not in ctx.proposals[clear["proposal_id"]]["snapshot"]["products"][0]
    finally:
        current.reset(token)


@pytest.mark.parametrize(
    "name,expected",
    [
        ("Kopi", "drinks"),
        ("Kaya toast", "food"),
        ("Cake", "desserts"),
        ("Haircut", "services"),
        ("Unknown item", "other"),
    ],
)
def test_automatic_category_suggestions(name, expected):
    assert suggest_category(name) == expected
    assert suggest_category(name, "House specials") == "House specials"


def test_photo_and_import_categories_are_reviewable_only(app):  # noqa: F811
    with TestClient(app) as client:
        join(client)
        result = photo(client, jpeg()).json()["proposal"]
        assert result["snapshot"]["products"][0]["category"] == "drinks"
        assert client.get("/api/v1/businesses").json() == []
        bid = make_shop(client)
        extracted = import_menu(
            client, bid, b"Name,Price,Category\nKopi,1.80,House drinks\nKaya toast,2.50,\n"
        ).json()["proposal"]
        assert [item["category"] for item in extracted["snapshot"]["products"]] == [
            "House drinks",
            "food",
        ]
        assert client.get(f"/api/v1/businesses/{bid}/inventory").json() == []
        client.post(
            f"/api/v1/proposals/{extracted['id']}/approve", json={"digest": extracted["digest"]}
        )
        reimport = import_menu(client, bid, b"Name,Price\nKopi,2.00\n").json()["proposal"]
        assert reimport["snapshot"]["products"][0]["category"] == "House drinks"
