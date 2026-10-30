"""OB-170 (#528): a shop named in any script is found by typing its name in English letters."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from google.adk.sessions import InMemorySessionService

from app.latin_names import latin, sounds_like
from app.main import create_app
from app.merchant import BusinessFields, MerchantRepository, ProductFields, ProposalRequest
from tests.test_discover import settings

pytest_plugins = ("tests.test_merchant_store",)  # store fixture covers both adapters

DELHI = {"lat": 28.6139, "lng": 77.209}
CHINKU = "चिंकू जिया"
MURUGAN = "முருகன் கடை"
THAI = "ร้านข้าวมันไก่"


@pytest.mark.parametrize(
    ("typed", "name"),
    [
        # The owner's example, whole and in parts, and the ways people spell it.
        ("chinku jiya", CHINKU),
        ("chinku", CHINKU),
        ("jiya", CHINKU),
        ("chin", CHINKU),
        ("Chinkoo", CHINKU),
        ("cheenku", CHINKU),
        ("chinku jia", CHINKU),
        # Devanagari leaves the inherent vowel unwritten: srma is "sharma".
        ("sharma", "शर्मा जनरल स्टोर"),
        ("shree ganesh mithai", "श्री गणेश मिठाई"),
        # Tamil: one letter for k and g, t and d.
        ("murugan", MURUGAN),
        ("murugan kadai", MURUGAN),
        ("muru", MURUGAN),
        ("annapoorna", "அன்னபூர்ணா"),
        # Thai is written without spaces; a word may start anywhere.
        ("khao man", THAI),
        ("raan", THAI),
        ("aroi", "อร่อย"),
        # Accents only.
        ("cafe zoe", "Café Zoë"),
        # Typed in the script, name in English.
        ("चिंकू", "Chinku Jiya"),
    ],
)
def test_ob_170_name_is_found_by_its_english_sound(typed: str, name: str) -> None:
    assert all(sounds_like(word, name) for word in typed.split()), (typed, latin(name))


@pytest.mark.parametrize(
    ("typed", "name"),
    [
        # Under three letters is never enough.
        ("ch", CHINKU),
        ("ji", CHINKU),
        ("ab", CHINKU),
        ("mu", MURUGAN),
        # Other words, close or not.
        ("tea", CHINKU),
        ("chai", CHINKU),
        ("bakery", CHINKU),
        ("milk", "श्री गणेश मिठाई"),
        ("bread", "प्रदीप स्टोर"),
        ("rice", MURUGAN),
        ("pizza", "पनीर"),
        # An accent gives no spelling slack.
        ("cake", "Café Zoë"),
        # English names keep their exact match (handled elsewhere): no sound match at all.
        ("chinku", "Chinku Jiya"),
        ("store", "Store"),
    ],
)
def test_ob_170_no_false_matches(typed: str, name: str) -> None:
    assert not sounds_like(typed, name), (typed, latin(name))


def shop(repository: MerchantRepository, name: str, products: list[str]) -> str:
    proposal = repository.propose(
        "fixture-owner",
        ProposalRequest(
            kind="business",
            business=BusinessFields(
                name=name,
                category="Kirana",
                location="Connaught Place",
                hours="7am–10pm",
                currency="INR",
                **DELHI,
            ),
            products=[
                ProductFields(name=item, price=2000 + i, unit="plate")
                for i, item in enumerate(products)
            ],
        ),
    )
    bid = repository.commit("fixture-owner", proposal["id"], proposal["digest"])["business_id"]
    repository.share("fixture-owner", bid, True)
    return str(bid)


def test_ob_170_ask_and_nearby_search_find_shops_by_english_name(
    store: MerchantRepository, tmp_path: Path
) -> None:
    hindi = shop(store, CHINKU, ["समोसा", "जलेबी"])
    tamil = shop(store, MURUGAN, ["இட்லி"])
    thai = shop(store, THAI, ["ข้าว"])
    app = create_app(settings(tmp_path), InMemorySessionService())
    with TestClient(app) as client:
        app.state.merchant = store

        def ask(q: str) -> set[str]:
            response = client.post("/api/v1/discover/ask", json={"q": q, **DELHI})
            assert response.status_code == 200, response.text
            return {p["id"] for g in response.json()["groups"] for p in g["places"]}

        def nearby(q: str) -> set[str]:
            response = client.get("/api/v1/discover", params={"q": q, **DELHI})
            assert response.status_code == 200, response.text
            return {p["id"] for p in response.json()["places"] if p["source"] == "chalkboard"}

        for search in (ask, nearby):
            assert hindi in search("chinku jiya")
            assert hindi in search("Chinku")
            assert tamil in search("murugan kadai")
            assert thai in search("khao man")
            # The script itself still works.
            assert hindi in search(CHINKU)
            # Short or unrelated words find none of them.
            for q in ("ch", "ab", "pizza"):
                assert not {hindi, tamil, thai} & search(q), q
        # Items too: 'samosa' finds the shop selling 'समोसा', and names it as the match.
        response = client.post("/api/v1/discover/ask", json={"q": "samosa", **DELHI}).json()
        places = [p for g in response["groups"] for p in g["places"] if p["id"] == hindi]
        assert places and places[0]["matched"][0]["name"] == "समोसा"
        assert tamil not in ask("samosa")
