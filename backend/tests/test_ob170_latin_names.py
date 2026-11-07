"""OB-170 (#528): a shop named in any script is found by typing its name in English letters."""

from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from google.adk.sessions import InMemorySessionService

from app.discover_ask import Intent, shop_pick
from app.latin_names import latin, sounds_like
from app.main import create_app
from app.merchant import BusinessFields, MerchantRepository, ProductFields, ProposalRequest
from app.sourcing import matches as sourcing_matches
from tests.test_discover import settings

pytest_plugins = ("tests.test_merchant_store",)  # store fixture covers both adapters

DELHI = {"lat": 28.6139, "lng": 77.209}
CHINKU = "चिंकू जिया"
MURUGAN = "முருகன் கடை"
THAI = "ร้านข้าวมันไก่"


def named(typed: str, name: str) -> bool:
    """Every typed word names the name, or (unspaced names) all of them together do."""
    return all(sounds_like(word, name) for word in typed.split()) or sounds_like(typed, name)


@pytest.mark.parametrize(
    ("typed", "name"),
    [
        # The owner's example, whole and in parts, and the ways people spell it.
        ("chinku jiya", CHINKU),
        ("chinku", CHINKU),
        ("jiya", CHINKU),
        ("chink", CHINKU),
        ("Chinkoo", CHINKU),
        ("cheenku", CHINKU),
        ("chinku jia", CHINKU),
        # Devanagari leaves the inherent vowel unwritten: srma is "sharma".
        ("sharma", "शर्मा जनरल स्टोर"),
        ("shree ganesh mithai", "श्री गणेश मिठाई"),
        ("kamal", "कमल"),
        ("amar", "अमर"),
        ("mohan", "मोहन"),
        ("paneer", "पनीर"),
        ("jalebi", "जलेबी"),
        ("hotel sagar", "होटल सागर"),
        ("coffee", "कॉफी"),
        # Tamil: one letter for k and g, t and d.
        ("murugan", MURUGAN),
        ("murugan kadai", MURUGAN),
        ("muru", MURUGAN),
        ("annapoorna", "அன்னபூர்ணா"),
        # Thai is written without spaces: a word may start anywhere once it is long enough.
        ("khao man", THAI),
        ("raan khao", THAI),
        ("aroi", "อร่อย"),
        ("ramen", "ラーメン屋"),
        ("beijing", "北京烤鸭"),
        # Accents only.
        ("cafe zoe", "Café Zoë"),
        # Typed in the script, name in English.
        ("चिंकू", "Chinku Jiya"),
    ],
)
def test_ob_170_name_is_found_by_its_english_sound(typed: str, name: str) -> None:
    assert named(typed, name), (typed, latin(name))


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
        # Common English words that once found unrelated names (PR #604 review).
        ("sugar", "होटल सागर"),
        ("bread", "पराठा"),
        ("bread", "भारत होटल"),
        ("paratha", "ब्रेड"),
        ("paratha", "मॉडर्न ब्रेड"),
        ("paratha", "भारत होटल"),
        ("milk", "मिलन स्वीट्स"),
        ("dal", "थाली"),
        ("thali", "दाल"),
        ("hot", "होटल सागर"),
        ("hot", "भारत होटल"),
        ("story", "सितारा"),
        ("store", "सत्यार"),
        ("chaat", "चाय"),
        ("tail", "तेल"),
        ("cold", "गोल्ड"),
        # Three or four letters never land inside a name written without spaces.
        ("man", THAI),
        ("ran", THAI),
        ("raan", THAI),
        ("ana", THAI),
        ("nka", THAI),
        ("kha", THAI),
        ("kao", "北京烤鸭"),
        ("jing", "北京烤鸭"),
        ("dong", "東京"),
    ],
)
def test_ob_170_no_false_matches(typed: str, name: str) -> None:
    assert not sounds_like(typed, name), (typed, latin(name))


# The review's corpus (PR #604): 66 common Hindi items and 19 shop names (Hindi, Tamil, Thai)
# against what customers type in English. Only these pairs may match; every other pair must not.
ITEMS = (
    "दूध चाय समोसा जलेबी पनीर दाल चावल आटा घी तेल चीनी नमक मसाला बिस्कुट ब्रेड केक लड्डू बर्फी "
    "पेड़ा रसगुल्ला कचौरी पकोड़ा भेलपुरी पानी_पूरी मिठाई नमकीन मक्खन दही लस्सी कॉफी साबुन शैम्पू "
    "टूथपेस्ट अंडा मुर्गा मटन मछली सब्ज़ी आलू प्याज टमाटर केला सेब आम नारियल मोमो डोसा इडली वड़ा "
    "पराठा रोटी नान बिरयानी पुलाव थाली चाट कुल्फी आइसक्रीम पान सिगरेट दवाई किताब कपड़ा जूते "
    "मोबाइल रिचार्ज"
)
SHOPS = (
    "शर्मा जनरल स्टोर",
    "गुप्ता मिठाई भंडार",
    "अग्रवाल स्वीट्स",
    "राम किराना",
    "श्याम टी स्टॉल",
    "बालाजी मेडिकल",
    "कृष्णा डेयरी",
    "लक्ष्मी बेकरी",
    "मॉडर्न ब्रेड",
    "होटल सागर",
    "भारत होटल",
    "मिलन स्वीट्स",
    "राजू पान भंडार",
    "सिटी मार्ट",
    "न्यू फैशन",
    "ஸ்ரீ முருகன் ஸ்டோர்ஸ்",
    "அம்மா உணவகம்",
    "ร้านกาแฟ",
    "ร้านข้าวมันไก่",
)
NAMES = (*(item.replace("_", " ") for item in ITEMS.split()), *SHOPS)
QUERIES = (
    "milk tea chai coffee bread cake samosa sweets bakery pharmacy medicine soap rice dal oil "
    "sugar salt butter curd eggs chicken mutton fish veg vegetables onion tomato banana apple "
    "mango coconut momo dosa idli paratha roti naan biryani thali chaat icecream paan cigarette "
    "book clothes shoes mobile recharge cheap open near best good fresh hot cold veggie atta ghee "
    "spicy snacks juice water grocery kirana store shop hotel lunch dinner breakfast"
).split()
MATCHES = {
    "chai": {"चाय"},
    "coffee": {"कॉफी"},
    "bread": {"ब्रेड", "मॉडर्न ब्रेड"},
    "samosa": {"समोसा"},
    "sweets": {"अग्रवाल स्वीट्स", "मिलन स्वीट्स"},
    "dal": {"दाल"},
    "momo": {"मोमो"},
    "dosa": {"डोसा"},
    "idli": {"इडली"},
    "paratha": {"पराठा"},
    "roti": {"रोटी"},
    "naan": {"नान"},
    "biryani": {"बिरयानी"},
    "thali": {"थाली"},
    "chaat": {"चाट"},
    "paan": {"पान", "राजू पान भंडार"},
    "atta": {"आटा"},
    "ghee": {"घी"},
    "kirana": {"राम किराना"},
    "store": {"शर्मा जनरल स्टोर", "ஸ்ரீ முருகன் ஸ்டோர்ஸ்"},
    "hotel": {"होटल सागर", "भारत होटल"},
}


def test_ob_170_corpus_is_the_reviewed_one() -> None:
    assert (len(NAMES), len(set(NAMES))) == (66 + 19, 66 + 19)


@pytest.mark.parametrize("typed", QUERIES)
def test_ob_170_corpus_matches_only_the_names_it_sounds_like(typed: str) -> None:
    assert {name for name in NAMES if sounds_like(typed, name)} == MATCHES.get(typed, set())


def test_ob_170_a_real_english_match_outranks_a_sound_alike() -> None:
    """'bread' puts the shop selling Bread first; 'ब्रेड' only sounds like it (tier 1, 0.6)."""

    def bakery(id_: str, item: str) -> dict[str, Any]:
        return {
            "id": id_,
            "name": id_,
            "category": "Bakery",
            "lat": DELHI["lat"],
            "lng": DELHI["lng"],
            "hours": "24 hours",
            "timezone": "Asia/Kolkata",
            "currency": "INR",
            "products": [{"name": item, "price": 4000, "available": True, "unit": "loaf"}],
        }

    def pick(item: str, typed: str) -> tuple[int, float, str]:
        found = shop_pick(bakery(item, item), Intent(keywords=[typed]), **DELHI)
        assert found is not None and found._components is not None, item
        return found._tier, found._components.keyword, found.matched[0].name

    assert pick("Bread", "bread") == (0, 1.0, "Bread")
    assert pick("ब्रेड", "bread") == (1, 0.6, "ब्रेड")
    # Spelled as its Latin reading ('dosa' for 'डोसा') is a real match.
    assert pick("डोसा", "dosa") == (0, 1.0, "डोसा")


def test_ob_170_supplier_items_are_found_by_their_english_sound() -> None:
    assert sourcing_matches("आटा", "atta")
    assert sourcing_matches("Chakki आटा", "atta")
    assert not sourcing_matches("होटल सागर", "sugar")
    assert not sourcing_matches("दूध", "milk")


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
