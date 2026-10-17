"""The shop's region decides money, languages, payments, rides and AI wording (region.py)."""

import pytest

from app import region
from app.coordinator import MerchantContext, current
from app.discover_ask import ask_region
from app.merchant import BusinessFields, ProductFields, ProposalRequest
from app.payments import _crc16, paynow_payload, prepare_payment_link
from app.reply_language import language_rule, reply_language, written_language
from app.shop_time import client_timezone
from tests.test_merchant_store import store as store  # noqa: F401

BENGALURU = (12.9716, 77.6412)  # Indiranagar
DELHI = (28.6139, 77.209)
CHENNAI = (13.0827, 80.2707)
TIONG_BAHRU = (1.2847, 103.832)
JOHOR_BAHRU = (1.4655, 103.7578)
KATHMANDU = (27.7172, 85.324)


@pytest.mark.parametrize(
    ("point", "country"),
    [
        (BENGALURU, "IN"),
        (DELHI, "IN"),
        (CHENNAI, "IN"),
        ((19.076, 72.8777), "IN"),  # Mumbai
        ((22.5726, 88.3639), "IN"),  # Kolkata
        ((26.1445, 91.7362), "IN"),  # Guwahati
        (TIONG_BAHRU, "SG"),
        ((1.436, 103.786), "SG"),  # Woodlands
        (JOHOR_BAHRU, None),
        (KATHMANDU, None),
        ((23.8103, 90.4125), None),  # Dhaka
        ((6.9271, 79.8612), None),  # Colombo
        ((31.5497, 74.3436), None),  # Lahore
        ((35.6762, 139.6503), None),  # Tokyo
    ],
)
def test_pin_to_country(point, country):
    assert region.country_at(*point) == country


def test_india_profile():
    india = region.region_at(*BENGALURU)
    assert (india.country, india.currency, india.symbol) == ("IN", "INR", "₹")
    assert india.languages[0] == "hi" and "en" in india.languages
    assert india.payment_rail == "upi" and "UPI" in india.payments
    assert india.rides == ("rapido", "uber", "porter")
    assert india.timezone == "Asia/Kolkata" and "GST" in india.tax
    # The regional language of the pin's area comes first after sign-in.
    assert region.area_language(*BENGALURU) == "kn"
    assert region.area_language(*CHENNAI) == "ta"
    assert region.area_language(*DELHI) is None


def test_singapore_profile():
    singapore = region.region_at(*TIONG_BAHRU)
    assert (singapore.currency, singapore.symbol) == ("SGD", "S$")
    assert singapore.languages == ("en", "zh-Hans", "ms", "ta")
    assert singapore.payment_rail == "paynow" and "paynow" in singapore.payments
    assert singapore.rides == ("grab", "gojek", "lalamove")
    assert singapore.tax == "GST 9%"


def test_fallback_takes_the_currency_of_the_phone_country():
    elsewhere = region.profile("JP")
    assert not elsewhere.known and elsewhere.currency == "JPY"
    assert elsewhere.languages == ("en",) and elsewhere.payment_rail == ""


def test_money_text_uses_the_region_symbol_and_grouping():
    assert region.money_text(12_400_000, "INR") == "₹1,24,000"
    assert region.money_text(1_234_567_89, "INR") == "₹12,34,567.89"
    assert region.money_text(1250, "SGD") == "S$12.50"
    assert region.money_text(123_456_789, "SGD") == "S$1,234,567.89"
    assert region.money_text(3000, "JPY") == "¥3,000"


def test_shop_region_without_a_pin_follows_timezone_then_currency():
    assert region.shop_region({"timezone": "Asia/Kolkata"}).country == "IN"
    assert region.shop_region({"currency": "INR"}).country == "IN"
    # Older Singapore shops were saved without a timezone.
    assert region.shop_zone({"currency": "SGD"}) == "Asia/Singapore"
    assert region.shop_zone({"currency": "INR"}) == "Asia/Kolkata"
    # The pin wins over the phone-chosen currency.
    assert region.shop_region({"lat": BENGALURU[0], "lng": BENGALURU[1]}).currency == "INR"


def test_new_shop_defaults_follow_the_pin_never_singapore_in_india():
    token = client_timezone.set("Asia/Kolkata")
    try:
        shop = BusinessFields(name="Chai")
        assert (shop.currency, shop.timezone) == ("INR", "Asia/Kolkata")
    finally:
        client_timezone.reset(token)
    # A phone set to Singapore registering an Indian pin still gets rupees and Indian time.
    token = client_timezone.set("Asia/Singapore")
    try:
        shop = BusinessFields(name="Chai", lat=BENGALURU[0], lng=BENGALURU[1])
        assert (shop.currency, shop.timezone) == ("INR", "Asia/Kolkata")
    finally:
        client_timezone.reset(token)


def test_new_shop_proposal_takes_the_pin_currency(store):  # noqa: F811
    token = client_timezone.set("Asia/Singapore")
    try:
        proposal = store.propose(
            "alice",
            ProposalRequest(
                kind="business",
                business=BusinessFields(
                    name="Chai Point",
                    currency="SGD",
                    timezone="Asia/Singapore",
                    lat=BENGALURU[0],
                    lng=BENGALURU[1],
                ),
                products=[ProductFields(name="Chai", price=1500)],
            ),
        )
    finally:
        client_timezone.reset(token)
    business = proposal["snapshot"]["business"]
    assert business["currency"] == "INR" and business["timezone"] == "Asia/Kolkata"
    # The owner said "15": still fifteen, now rupees.
    assert proposal["snapshot"]["products"][0]["price"] == 1500


def test_region_rule_for_ai_prompts():
    india = region.region_rule(region.region_at(*BENGALURU))
    assert "India" in india and "₹1,240" in india and "1,00,000" in india
    assert "UPI" in india and "Rapido" in india and "GST" in india
    assert "S$" not in india and "PayNow" not in india and "Grab" not in india
    singapore = region.region_rule(region.region_at(*TIONG_BAHRU))
    assert "S$1,240" in singapore and "PayNow" in singapore and "NETS" in singapore
    assert "GST is 9%" in singapore and "Grab" in singapore
    assert "₹" not in singapore and "UPI" not in singapore and "Rapido" not in singapore


def test_ask_prompt_examples_use_the_customer_area_money():
    assert ask_region(*BENGALURU)["under"] == "₹30"
    assert ask_region(*TIONG_BAHRU)["under"] == "S$3"
    assert "India" in ask_region(*DELHI)["region"]


def test_crc_matches_the_ccitt_false_check_value():
    assert _crc16("123456789") == "29B1"


def test_paynow_payload_is_a_valid_sgqr_code():
    payload = paynow_payload("+6591234567", "Kopi Corner", "4.50", "Order 7")
    assert payload.startswith("000201010212")
    assert "0009SG.PAYNOW" in payload and "0211+6591234567" in payload
    assert "5303702" in payload and "54044.50" in payload and "5802SG" in payload
    assert "5911Kopi Corner" in payload and "62110107Order 7" in payload
    assert payload[-8:-4] == "6304" and _crc16(payload[:-4]) == payload[-4:]
    uen = paynow_payload("201912345K", "Kopi", "1.00")
    assert "01012" in uen and "0210201912345K" in uen


async def test_singapore_shop_gets_a_paynow_card(store):  # noqa: F811
    proposal = store.propose(
        "alice",
        ProposalRequest(
            kind="business",
            business=BusinessFields(
                name="Kopi Corner", lat=TIONG_BAHRU[0], lng=TIONG_BAHRU[1], paynow_id="+6591234567"
            ),
        ),
    )
    bid = store.commit("alice", proposal["id"], proposal["digest"])["business_id"]
    context = MerchantContext(store, "alice", bid, [])
    token = current.set(context)
    try:
        result = await prepare_payment_link("4.5")
    finally:
        current.reset(token)
    assert result["status"] == "prepared"
    card = result["payment"]
    assert card["rail"] == "paynow" and card["currency"] == "SGD"
    assert card["payload"] == paynow_payload("+6591234567", "Kopi Corner", "4.50")
    assert "url" not in card and "upi_id" not in card


def test_paynow_id_format():
    for good in ("+6591234567", "201912345K", "53123456A", "T08LL1234A"):
        assert BusinessFields(name="Kopi", paynow_id=good).paynow_id == good
    for bad in ("91234567", "+6512345678", "+919876543210", "abc"):
        with pytest.raises(ValueError):
            BusinessFields(name="Kopi", paynow_id=bad)


def test_india_coach_turn_says_rupees_upi_and_never_singapore(store):  # noqa: F811
    from app.agent import coach_region

    proposal = store.propose(
        "alice",
        ProposalRequest(
            kind="business",
            business=BusinessFields(name="Chai Point", lat=BENGALURU[0], lng=BENGALURU[1]),
        ),
    )
    bid = store.commit("alice", proposal["id"], proposal["digest"])["business_id"]
    token = current.set(MerchantContext(store, "alice", bid, []))
    try:
        rule = coach_region()
    finally:
        current.reset(token)
    assert "India" in rule and "₹1,240" in rule and "UPI" in rule
    assert "S$" not in rule and "PayNow" not in rule


@pytest.mark.parametrize(
    ("tag", "must"),
    [
        ("zh-Hans", ["Simplified Chinese characters", "not Cantonese", "Traditional"]),
        ("ms", ["Malay (ms-MY)", "not Indonesian"]),
        ("ta", ["Tamil script", "not romanised Tamil"]),
    ],
)
def test_singapore_languages_are_pinned_in_every_prompt(tag, must):
    for text in (written_language(tag), language_rule(reply_language(tag))):
        for word in must:
            assert word in text, (tag, word, text)
