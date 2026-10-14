"""B28: every new item gets a category and a unit from the fixed list; "Sort my menu" is a
reviewed proposal; picking a new unit for a saved item replaces it instead of duplicating it."""

import sqlite3
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.coordinator import MerchantContext, ProductInput, current, propose_products
from app.imports import ColumnMapper, Sections
from app.merchant import BusinessFields, MerchantRepository, ProductFields, ProposalRequest
from app.product_categories import suggest_category
from app.product_units import UNITS, known_unit, normalize_unit
from app.settings import Settings
from tests.test_imports import make_shop
from tests.test_imports import upload as import_menu
from tests.test_photos import app, join, jpeg  # noqa: F401
from tests.test_photos import upload as photo

pytest_plugins = ("tests.test_merchant_store",)


@pytest.mark.parametrize(
    "text,expected",
    [
        ("pcs", "piece"),
        ("Pieces", "piece"),
        ("per cup", "cup"),
        ("Plates", "plate"),
        ("btl", "bottle"),
        ("KG", "kg"),
        ("grams", "g"),
        ("ltr", "litre"),
        ("hrs", "hour"),
        ("serving", "portion"),
        ("doz", "dozen"),
        ("each", "item"),
    ],
)
def test_known_units_map_to_the_fixed_list(text, expected):
    assert normalize_unit(text) == expected
    assert expected in UNITS


def test_unknown_units_become_item_for_new_data_but_are_reported_unknown():
    assert normalize_unit("tray") == "item"
    assert normalize_unit("") == "item"
    assert known_unit("tray") is None


@pytest.mark.parametrize(
    "name,expected",
    [
        ("Milo dinosaur", "drinks"),
        ("Teh tarik", "drinks"),
        ("Egg tart", "desserts"),
        ("Ondeh ondeh", "desserts"),
        ("Mee siam", "food"),
        ("Chicken rice", "food"),
        ("Roti prata", "food"),
        ("Phở bò", "food"),
        ("Manicure", "services"),
        ("Hammer", "other"),
    ],
)
def test_keyword_categories_cover_common_apac_menus(name, expected):
    assert suggest_category(name) == expected


def _shop(store: MerchantRepository, products: list[ProductFields]) -> str:
    proposal = store.propose(
        "owner",
        ProposalRequest(
            kind="business", business=BusinessFields(name="Katong Kopi"), products=products
        ),
    )
    return str(store.commit("owner", proposal["id"], proposal["digest"])["business_id"])


def test_coach_always_categorises_and_uses_the_fixed_units(store: MerchantRepository):
    bid = _shop(store, [ProductFields(name="Kopi", price=180, unit="cup", category="Drinks")])
    ctx = MerchantContext(store, "owner", bid, [])
    token = current.set(ctx)
    try:
        result = propose_products(
            [
                ProductInput(name="Kaya toast", price=2.5, unit="pcs", category=""),
                ProductInput(name="Iced Milo", price=3, unit="glasses"),
                ProductInput(name="Kopi", price=2),
            ]
        )
        products = ctx.proposals[result["proposal_id"]]["snapshot"]["products"]
        by_name = {product["name"]: product for product in products}
        assert by_name["Kaya toast"]["category"] == "food"
        assert by_name["Kaya toast"]["unit"] == "piece"
        assert by_name["Iced Milo"] == {
            **by_name["Iced Milo"],
            "category": "drinks",
            "unit": "glass",
        }
        # A saved item keeps the owner's own section.
        assert by_name["Kopi"]["category"] == "Drinks"
        assert all(product["category"] for product in products)
    finally:
        current.reset(token)


def test_photo_and_import_items_are_never_uncategorised(app):  # noqa: F811
    with TestClient(app) as client:
        join(client)
        bid = make_shop(client)
        # A photo of the board for an existing shop keeps the section the read found.
        read = photo(client, jpeg(), f"?business_id={bid}").json()["proposal"]
        assert read["snapshot"]["products"][0] == {
            **read["snapshot"]["products"][0],
            "category": "drinks",
            "unit": "cup",
        }
        # A POS export with no category column, and free-text units.
        body = import_menu(
            client, bid, b"Item,Price,UOM\nKopi,1.80,cups\nKaya toast,2.50,pcs\nWidget,4,tray\n"
        ).json()
        products = {p["name"]: p for p in body["proposal"]["snapshot"]["products"]}
        assert {name: p["category"] for name, p in products.items()} == {
            "Kopi": "drinks",
            "Kaya toast": "food",
            "Widget": "other",
        }
        assert {name: p["unit"] for name, p in products.items()} == {
            "Kopi": "cup",
            "Kaya toast": "piece",
            "Widget": "item",
        }
        # The owner's own form fills a suggestion too; still only a proposal.
        manual = client.post(
            "/api/v1/proposals",
            json={
                "kind": "inventory",
                "business_id": bid,
                "revision": 1,
                "products": [{"name": "Teh", "price": 170, "unit": "cup"}],
            },
        ).json()
        assert manual["snapshot"]["products"][0]["category"] == "drinks"
        assert client.get(f"/api/v1/businesses/{bid}/inventory").json() == []


def owner_of(app, bid: str) -> str:  # noqa: F811
    with sqlite3.connect(app.state.v1_settings.merchant_database) as db:
        return str(
            db.execute("SELECT uid FROM memberships WHERE business_id=?", (bid,)).fetchone()[0]
        )


def test_sort_my_menu_is_a_reviewed_proposal_for_uncategorised_items_only(app):  # noqa: F811
    with TestClient(app) as client:
        join(client)
        legacy = client.post(
            "/api/v1/proposals",
            json={"kind": "business", "revision": 0, "business": {"name": "Old Kopitiam"}},
        ).json()
        bid = client.post(
            f"/api/v1/proposals/{legacy['id']}/approve", json={"digest": legacy["digest"]}
        ).json()["business_id"]
        store = app.state.merchant
        # Items saved before categories existed (written straight to the store, no suggestion).
        old = store.propose(
            owner_of(app, bid),
            ProposalRequest(
                kind="inventory",
                business_id=bid,
                revision=1,
                products=[
                    ProductFields(name="Kopi", price=180, unit="cup"),
                    ProductFields(name="Kaya toast", price=250, unit="pcs", available=False),
                    ProductFields(name="Otah", price=150, unit="piece", category="Sides"),
                ],
            ),
        )
        client.post(f"/api/v1/proposals/{old['id']}/approve", json={"digest": old["digest"]})
        before = client.get(f"/api/v1/businesses/{bid}/inventory").json()
        assert sum(1 for item in before if not item.get("category")) == 2

        sorted_menu = client.post(f"/api/v1/businesses/{bid}/sort-menu")
        assert sorted_menu.status_code == 200
        products = sorted_menu.json()["snapshot"]["products"]
        # Only the uncategorised items, everything else exactly as saved.
        assert [(p["name"], p["category"]) for p in products] == [
            ("Kopi", "drinks"),
            ("Kaya toast", "food"),
        ]
        assert products[1]["unit"] == "pcs" and products[1]["available"] is False
        # Nothing changes until the owner confirms.
        assert client.get(f"/api/v1/businesses/{bid}/inventory").json() == before
        proposal = sorted_menu.json()
        client.post(
            f"/api/v1/proposals/{proposal['id']}/approve", json={"digest": proposal["digest"]}
        )
        after = client.get(f"/api/v1/businesses/{bid}/inventory").json()
        assert len(after) == 3 and all(item.get("category") for item in after)
        assert (
            client.post(f"/api/v1/businesses/{bid}/sort-menu").json()["detail"] == "NOTHING_TO_SORT"
        )


def test_a_new_unit_replaces_the_saved_item_in_both_adapters(store: MerchantRepository):
    bid = _shop(store, [ProductFields(name="Kaya toast", price=250, unit="pcs", category="food")])
    proposal = store.propose(
        "owner",
        ProposalRequest(
            kind="inventory",
            business_id=bid,
            revision=1,
            products=[
                ProductFields(
                    name="Kaya toast", price=260, unit="piece", previous_unit="pcs", category="food"
                )
            ],
        ),
    )
    assert proposal["snapshot"]["products"][0]["previous_unit"] == "pcs"
    store.commit("owner", proposal["id"], proposal["digest"])
    items = store.inventory("owner", bid)
    assert [(item["name"], item["unit"], item["price"]) for item in items] == [
        ("Kaya toast", "piece", 260)
    ]
    assert "previous_unit" not in items[0]
    # Same unit as before: nothing extra is sealed.
    same = ProductFields(name="Kaya toast", price=260, unit="piece", previous_unit="piece")
    assert "previous_unit" not in same.model_dump()


async def test_gemini_sorts_items_into_sections_and_falls_back_to_keywords():
    class Models:
        def __init__(self, reply):
            self.reply = reply

        async def generate_content(self, **_):
            return SimpleNamespace(parsed=self.reply)

    # model_copy skips the model-ID check: no real model is ever called here.
    settings = Settings(_env_file=None).model_copy(update={"coach_mode": "gemini"})
    mapper = ColumnMapper(settings)
    names = ["Hammer", "Kopi"]
    mapper._client = SimpleNamespace(
        aio=SimpleNamespace(models=Models(Sections(sections=["Tools", "Drinks"])))
    )
    assert await mapper.categorise(names, "Hardware") == ["Tools", "Drinks"]
    # A reply of the wrong length is not trusted.
    mapper._client.aio.models = Models(Sections(sections=["Tools"]))
    assert await mapper.categorise(names) == ["other", "drinks"]
    offline = ColumnMapper(Settings(coach_mode="offline", _env_file=None))
    assert await offline.categorise(names) == ["other", "drinks"]
