import json
from typing import Any

import httpx
from fastapi.testclient import TestClient

from app.document_ai import DocumentAIReader, ParsedDocument, parse_document, supply_reading
from app.settings import Settings
from tests.test_day_close import photo
from tests.test_photo_location import located_jpeg
from tests.test_photos import app, join, upload  # noqa: F401


def entity(kind: str, mention: str, **normalized: Any) -> dict[str, Any]:
    return {"type": kind, "mentionText": mention, "normalizedValue": normalized}


def item(**fields: str) -> dict[str, Any]:
    return {
        "type": "line_item",
        "mentionText": " ".join(fields.values()),
        "properties": [entity(f"line_item/{k}", v) for k, v in fields.items()],
    }


# Shapes recorded from the live Expense/Invoice parsers on tests/fixtures/documents (16 Oct 2026).
TWO_ROW_RECEIPT = {
    "entities": [
        entity("receipt_date", "14/10/2026", dateValue={"year": 2026, "month": 10, "day": 14}),
        entity("currency", "SGD", text="SGD"),
        entity(
            "total_amount",
            "43.40",
            moneyValue={"currencyCode": "SGD", "units": "43", "nanos": 400000000},
        ),
        item(quantity="3", description="Kopi O"),
        item(amount="4.80"),
        item(description="22 x Egg Tart"),
        item(amount="33.00"),
    ]
}
INVOICE = {
    "entities": [
        entity("invoice_id", "SKD/2026/0457"),
        entity("invoice_date", "12/10/2026", dateValue={"year": 2026, "month": 10, "day": 12}),
        entity("purchase_order", "PO-1188"),
        entity("supplier_name", "SREE KRISHNA\nDISTRIBUTORS"),
        entity(
            "total_amount",
            "11387.26",
            moneyValue={"currencyCode": "INR", "units": "11387", "nanos": 260000000},
        ),
        item(description="Toor Dal 30kg bag", quantity="2", amount="4950.00", unit="bag"),
        item(description="Sugar 50kg bag", quantity="1", unit_price="2,275.00"),
    ]
}
MERGED = {
    "entities": [
        entity("delivery_date", "11/10/2026", dateValue={"year": 2026, "month": 10, "day": 11}),
        item(description="Bread flour 25kg\nUnsalted butter 5kg", quantity="321", amount="96.00"),
    ]
}


def test_two_row_receipts_join_price_rows_and_split_counts() -> None:
    parsed = parse_document(TWO_ROW_RECEIPT, "receipt")
    assert parsed.date == "2026-10-14" and parsed.currency == "SGD" and parsed.total == 43.4
    assert [(line.item, line.quantity, line.amount) for line in parsed.lines] == [
        ("Kopi O", 3, 4.8),
        ("Egg Tart", 22, 33.0),
    ]
    assert parsed.complete()


def test_invoice_header_fields_and_unit_price_total() -> None:
    parsed = parse_document(INVOICE, "invoice")
    assert (parsed.number, parsed.ref, parsed.date, parsed.currency) == (
        "SKD/2026/0457",
        "PO-1188",
        "2026-10-12",
        "INR",
    )
    assert parsed.supplier == "SREE KRISHNA DISTRIBUTORS"
    assert parsed.lines[1].amount == 2275.0  # unit price × quantity
    assert parsed.complete()
    reading = supply_reading(parsed)
    assert reading["kind"] == "invoice" and reading["ref"] == "PO-1188"
    assert [line["line"] for line in reading["lines"]] == [10, 20]
    assert reading["lines"][0]["unit"] == "bag" and reading["lines"][1]["unit"] == "piece"


def test_incomplete_readings_are_not_used() -> None:
    merged = parse_document(MERGED, "invoice")
    assert merged.merged_rows and not merged.complete()
    assert merged.date == "2026-10-11"  # delivery date when there is no invoice date
    no_price = parse_document(
        {"entities": [item(description="Curry Puff", quantity="5")]}, "receipt"
    )
    assert not no_price.complete()  # a till line without money goes to Gemini
    assert parse_document(
        {"entities": [item(description="Curry Puff", quantity="5")]}, "invoice"
    ).complete()
    assert not ParsedDocument(processor="receipt").complete()


def settings(**overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "google_cloud_project": "demo",
        "document_ai_enabled": True,
        "document_ai_receipt_processor": "abc123",
        "document_ai_invoice_processor": "def456",
    }
    return Settings(_env_file=None, **{**values, **overrides})  # type: ignore[call-arg]


async def test_reader_calls_the_right_processor_once_per_photo() -> None:
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(200, json={"document": INVOICE})

    reader = DocumentAIReader(settings(), transport=httpx.MockTransport(handler))
    first = await reader.read(b"\xff\xd8photo", "invoice")
    again = await reader.read(b"\xff\xd8photo", "invoice")
    assert first is not None and again is first and len(calls) == 1  # cached by image hash
    assert str(calls[0].url) == (
        "https://us-documentai.googleapis.com/v1/projects/demo/locations/us/processors/def456:process"
    )
    body = json.loads(calls[0].content)
    assert body["rawDocument"]["mimeType"] == "image/jpeg" and body["fieldMask"] == "entities"


async def test_reader_failures_and_switch_off_return_none() -> None:
    failing = DocumentAIReader(
        settings(), transport=httpx.MockTransport(lambda _: httpx.Response(500, text="boom"))
    )
    assert await failing.read(b"x", "receipt") is None
    off = DocumentAIReader(settings(document_ai_enabled=False))
    assert not off.enabled and await off.read(b"x", "receipt") is None
    unconfigured = DocumentAIReader(settings(document_ai_invoice_processor=""))
    assert not unconfigured.enabled


class FakeReader:
    def __init__(self, document: dict[str, Any], processor: Any) -> None:
        self.parsed = parse_document(document, processor)
        self.calls: list[str] = []

    async def read(self, data: bytes, processor: Any) -> ParsedDocument:
        self.calls.append(processor)
        return self.parsed


def test_close_the_day_uses_document_ai_when_its_reading_is_complete(app) -> None:  # noqa: F811
    with TestClient(app) as client:
        join(client)
        first = upload(client, located_jpeg(None)).json()["proposal"]
        bid = client.post(
            f"/api/v1/proposals/{first['id']}/approve", json={"digest": first["digest"]}
        ).json()["business_id"]

        app.state.document_ai = FakeReader(TWO_ROW_RECEIPT, "receipt")
        till = photo(client, bid, "sales").json()
        assert till["reader"] == "document_ai" and till["fixture"] is False
        assert till["date"] == "2026-10-14"
        assert [(line["read_as"], line["quantity"], line["amount"]) for line in till["lines"]] == [
            ("Kopi O", 3, 4.8),
            ("Egg Tart", 22, 33.0),
        ]
        assert app.state.document_ai.calls == ["receipt"]

        # Supplier receipts go to the Invoice parser; their money is not a sale.
        app.state.document_ai = FakeReader(INVOICE, "invoice")
        delivery = photo(client, bid, "delivery").json()
        assert delivery["reader"] == "document_ai"
        assert all(line["amount"] is None for line in delivery["lines"])
        assert app.state.document_ai.calls == ["invoice"]

        # Stock counts never go to Document AI; an incomplete reading falls back.
        count = photo(client, bid, "stock_count").json()
        assert count["reader"] == "fixture" and app.state.document_ai.calls == ["invoice"]
        app.state.document_ai = FakeReader(MERGED, "invoice")
        fallback = photo(client, bid, "delivery").json()
        assert fallback["reader"] == "fixture" and fallback["fixture"] is True


def test_each_photo_costs_one_processor_call_never_both_ob182(app) -> None:  # noqa: F811
    """OB-182 / #542: the type is decided by the upload (sales or delivery), so one photo is one
    HTTP call to one processor, even when that reading is incomplete (Gemini takes over, the
    other parser is not tried)."""
    urls: list[str] = []
    document: dict[str, Any] = {"entities": []}

    def handler(request: httpx.Request) -> httpx.Response:
        urls.append(str(request.url).split("/processors/")[1])
        return httpx.Response(200, json={"document": document})

    with TestClient(app) as client:
        join(client)
        first = upload(client, located_jpeg(None)).json()["proposal"]
        bid = client.post(
            f"/api/v1/proposals/{first['id']}/approve", json={"digest": first["digest"]}
        ).json()["business_id"]
        app.state.document_ai = DocumentAIReader(settings(), transport=httpx.MockTransport(handler))

        document.update(TWO_ROW_RECEIPT)
        assert photo(client, bid, "sales").json()["reader"] == "document_ai"
        assert urls == ["abc123:process"]  # Expense parser only

        document.update(INVOICE)
        assert photo(client, bid, "delivery").json()["reader"] == "document_ai"
        assert urls == ["abc123:process", "def456:process"]  # Invoice parser only

        # An unreadable delivery note falls to Gemini/fixture, not to the Expense parser.
        app.state.document_ai = DocumentAIReader(settings(), transport=httpx.MockTransport(handler))
        document.clear()
        document["entities"] = []
        before = len(urls)
        assert photo(client, bid, "delivery").json()["reader"] == "fixture"
        assert urls[before:] == ["def456:process"]

        # A stock count sheet never reaches Document AI.
        before = len(urls)
        assert photo(client, bid, "stock_count").json()["reader"] == "fixture"
        assert len(urls) == before
