"""The morning a closed day pays back (OB-328, OB-329): the make list opens for "how much to make?"
in every path, and one close is already a plan."""

from datetime import date, timedelta

import pytest

from app.forecast import Forecast, Prediction, last_day, last_day_words
from app.instant import MAKE_LIST

TODAY = date(2026, 11, 9)
BAKERY = [
    {"name": "Black forest cake", "unit": "kg"},
    {"name": "Chocolate truffle cake", "unit": "kg"},
    {"name": "Brownie", "unit": "piece"},
]


def sold(day: date, item: str, quantity: float, revenue: int) -> dict[str, object]:
    return {"date": day.isoformat(), "item": item, "quantity": quantity, "revenue": revenue}


def priya(day: date) -> list[dict[str, object]]:
    return [
        sold(day, "Brownie", 12, 72_000),
        sold(day, "Chocolate truffle cake", 1.5, 135_000),
        sold(day, "Black forest cake", 2, 210_000),
    ]


def test_ob329_one_close_is_a_plan_ranked_by_money_with_units() -> None:
    found = last_day(priya(TODAY - timedelta(days=1)), TODAY, BAKERY, "Home bakery")
    assert found is not None
    assert found.date == TODAY - timedelta(days=1)
    assert [(r.item, r.quantity, r.unit) for r in found.rows] == [
        ("Black forest cake", 2, "kg"),
        ("Chocolate truffle cake", 1.5, "kg"),
        ("Brownie", 12, "piece"),
    ]
    assert found.make_same is True
    words = last_day_words(found, TODAY)
    assert words.startswith("Yesterday you sold 2 kg Black forest cake")
    assert words.endswith("Make about the same.")


def test_ob329_latest_day_only_and_lines_of_one_item_add_up() -> None:
    day = TODAY - timedelta(days=1)
    rows = [
        sold(day - timedelta(days=1), "Brownie", 99, 1),
        sold(day, "Brownie", 2, 100),
        sold(day, "Brownie", 3.5, 150),
    ]
    found = last_day(rows, TODAY, BAKERY)
    assert found is not None
    assert [(r.item, r.quantity, r.revenue) for r in found.rows] == [("Brownie", 5.5, 250)]


def test_ob329_a_day_closed_tonight_counts_and_a_future_row_does_not() -> None:
    found = last_day(
        [sold(TODAY, "Brownie", 1, 60), sold(TODAY + timedelta(days=1), "Brownie", 9, 9)],
        TODAY,
        BAKERY,
    )
    assert found is not None
    assert found.date == TODAY
    assert found.rows[0].quantity == 1
    assert last_day_words(found, TODAY).startswith("Today you sold")


def test_ob329_nothing_saved_says_nothing() -> None:
    assert last_day([], TODAY, BAKERY) is None
    assert last_day_words(None, TODAY) == ""


def test_ob329_the_forecast_wins_once_it_has_an_answer() -> None:
    forecast = Forecast(
        status="ready",
        method="weekday_average",
        training_cutoff=TODAY,
        predictions=[Prediction(date=TODAY, item="Brownie", quantity=10)],
    )
    assert last_day(priya(TODAY), TODAY, BAKERY, "", forecast) is None


def test_ob329_a_kirana_is_never_told_to_make_what_it_buys() -> None:
    stock = [{"name": "Toor Dal", "unit": "pack", "source": "bought"}]
    found = last_day(
        [sold(TODAY - timedelta(days=1), "Toor Dal", 9, 900)], TODAY, stock, "Kirana store"
    )
    assert found is not None
    assert found.rows[0].made is False
    assert found.make_same is False
    assert "Make about" not in last_day_words(found, TODAY)


def test_ob329_a_service_is_not_made_ahead() -> None:
    found = last_day(
        [sold(TODAY - timedelta(days=1), "Haircut", 4, 400)],
        TODAY,
        [{"name": "Haircut", "unit": "service"}],
        "Salon",
    )
    assert found is not None
    assert found.make_same is False


def test_ob329_an_old_close_still_reports_but_no_longer_says_repeat_it() -> None:
    old = TODAY - timedelta(days=8)
    found = last_day(priya(old), TODAY, BAKERY)
    assert found is not None
    assert found.make_same is False
    recent = last_day(priya(TODAY - timedelta(days=7)), TODAY, BAKERY)
    assert recent is not None
    assert recent.make_same is True


@pytest.mark.parametrize(
    "said",
    [
        "How much to make",
        "how much should i make today",
        "How many brownies to bake",
        "kitna banana hai",
        "aaj kitne banane hain",
        "कितना बनाना है",
        "आज कितने बनाने हैं",
        "कितनी तैयारी करूँ",
        "कितनी चाय बनानी है",
        "कितना बनाऊं",
        "मसाला चाय की मांग का अनुमान लगाएँ",
        "मसाला चाय की माँग का अनुमान लगाएँ",
    ],
)
def test_ob328_make_questions_open_the_list(said: str) -> None:
    assert MAKE_LIST.search(said)


@pytest.mark.parametrize(
    "said",
    [
        # The coach answers about tomorrow (also the Make list's own "Ask the coach" sentence).
        "How much should I prep tomorrow",
        "कल कितनी तैयारी करूँ",
        "kal kitna banana hai",
        # What happened, not what to do.
        "how many did i make",
        "how much money did i make",
        "कितना बनाया",
        "कितना बना",
        # A "don't" asks for nothing.
        "don't tell me how much to make",
        "kitna banana hai mat batao",
        "कितना बनाना है मत बताओ",
        "कितना बनाना है यह नहीं पूछा",
        # Other jobs.
        "मसाला चाय की कीमत 25 कर दो",
        "how much is masala chai",
        "make samosa sold out",
    ],
)
def test_ob328_other_questions_stay_with_the_coach(said: str) -> None:
    assert not MAKE_LIST.search(said)
