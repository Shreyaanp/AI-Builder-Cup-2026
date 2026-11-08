"""OB-279 / OB-281: photo readings keep the number the paper shows, the shop's way."""

from __future__ import annotations

import json

import pytest

from app.day_close import lenient_read
from app.document_ai import parse_document
from app.gemini_schema import to_number
from app.numbers import read_number


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("1,000", 1000),
        ("1,00,000", 100000),
        ("₹ 1,000", 1000),
        ("Rs. 1,00,000.50", 100000.5),
        ("1000.50", 1000.5),
        ("840", 840),
        ("1.5", 1.5),
        ("840.00", 840),
    ],
)
def test_rupee_amounts_are_read_as_written(text: str, expected: float) -> None:
    assert read_number(text, "INR") == expected


@pytest.mark.parametrize("text", ["1,5", "12,50", "1.005", "1,234,56.7.8", "", "abc"])
def test_rupee_amounts_that_could_be_two_numbers_are_not_guessed(text: str) -> None:
    assert read_number(text, "INR") is None


def test_decimal_comma_shops_still_read_two_and_a_half() -> None:
    assert read_number("2,5", "IDR", "quantity") == 2.5
    assert read_number("15.000", "IDR") == 15000
    assert read_number("1.000.000", "VND") == 1_000_000
    assert read_number("1.000,50", "EUR") == 1000.5
    assert read_number("2,5", "IDR") is None  # rupiah has no cents


def test_quantities_allow_three_decimals_whatever_the_currency() -> None:
    for currency in ("INR", "JPY", "IDR", "SGD"):
        assert read_number("0.125", currency, "quantity") == 0.125
        assert read_number("2.5", currency, "quantity") == 2.5
        assert read_number("0.1255", currency, "quantity") is None
    assert read_number("0.125", "INR", "money") is None
    assert read_number("0.125", "KWD", "money") == 0.125


def test_menu_prices_without_a_shop_keep_the_old_reading() -> None:
    assert to_number("12,50") == 12.5
    assert to_number("1,200") == 1200
    assert to_number("RM 8.90") == 8.9
    assert to_number(True) is None
    assert to_number(42) == 42.0


def test_till_photo_lines_are_read_in_the_shop_currency() -> None:
    text = json.dumps(
        {
            "kind": "sales",
            "lines": [
                {"item": "Cake", "quantity": "1.5", "amount": "1,000"},
                {"item": "Rice", "quantity": "0.125", "amount": "1,00,000"},
                {"item": "Tea", "quantity": "2", "amount": "1,5"},
            ],
        }
    )
    read = lenient_read(text, "sales", "INR")
    assert read is not None
    assert [(line.quantity, line.amount) for line in read.lines] == [
        (1.5, 1000),
        (0.125, 100000),
        (2, None),  # asked about in the app, never saved as ₹1.50 or ₹15
    ]


def test_document_ai_text_does_not_glue_a_decimal_comma_into_the_digits() -> None:
    def prop(kind: str, text: str) -> dict[str, object]:
        return {"type": f"line_item/{kind}", "mentionText": text}

    document = {
        "entities": [
            {
                "type": "line_item",
                "properties": [
                    prop("description", "Sugar"),
                    prop("quantity", "2,5"),
                    prop("amount", "1,000"),
                ],
            }
        ]
    }
    parsed = parse_document(document, "receipt")
    assert [(line.quantity, line.amount) for line in parsed.lines] == [(2.5, 1000)]


# PR #701 review: the billing/POS import and the Document AI text fallback read numbers with
# the same reader, in the shop's currency.


@pytest.mark.parametrize(
    ("text", "currency", "expected"),
    [
        ("170/-", "INR", 170),
        ("₹170/-", "INR", 170),
        ("1,000", "INR", 1000),
        ("1,00,000.50", "INR", 100000.5),
        ("Rp 15.000", "IDR", 15000),
        ("15.000", "IDR", 15000),
        ("1 234,50", "EUR", 1234.5),
        ("33.330000001", "INR", 33.330000001),  # export float noise is not refused
    ],
)
def test_import_cells_are_read_in_the_shop_currency(
    text: str, currency: str, expected: float
) -> None:
    from app.imports import number

    assert number(text, currency) == expected


def test_import_does_not_guess_a_lone_comma_in_a_rupee_shop() -> None:
    from app.imports import number

    assert number("1,5", "INR") is None
    assert number("2,50") == 2.5  # no shop currency yet: the old reading


def test_menu_import_keeps_rupee_and_rupiah_prices() -> None:
    from app.imports import ColumnMap, menu_items

    mapping = ColumnMap(kind="menu", name=0, price=1)
    rupees, _ = menu_items([["Chai", "170/-"], ["Thali", "1,000"]], mapping, "INR")
    assert [item["price"] for item in rupees] == [170, 1000]
    rupiah, _ = menu_items([["Kopi", "15.000"]], mapping, "IDR")
    assert [item["price"] for item in rupiah] == [15000]


def test_sales_import_reads_rupiah_totals_in_full() -> None:
    from app.imports import ColumnMap
    from app.sales import daily_sales

    mapping = ColumnMap(kind="sales", name=1, quantity=2, total=3, date=0)
    rows = daily_sales([["2026-11-01", "Kopi", "2", "Rp 30.000"]], mapping, "IDR")
    assert rows[0]["revenue"] == 30000
    assert rows[0]["quantity"] == 2


def test_document_ai_text_is_read_in_the_shop_currency() -> None:
    def prop(kind: str, text: str) -> dict[str, object]:
        return {"type": f"line_item/{kind}", "mentionText": text}

    def document(quantity: str, amount: str) -> dict[str, object]:
        return {
            "entities": [
                {
                    "type": "line_item",
                    "properties": [
                        prop("description", "Kopi"),
                        prop("quantity", quantity),
                        prop("amount", amount),
                    ],
                }
            ]
        }

    rupiah = parse_document(document("2", "15.000"), "receipt", "IDR")
    assert [(line.quantity, line.amount) for line in rupiah.lines] == [(2, 15000)]
    rupee = parse_document(document("2", "1,5"), "receipt", "INR")
    assert [line.amount for line in rupee.lines] == [None]
    assert not rupee.complete()  # so Gemini reads it instead of a guessed ₹1.50
