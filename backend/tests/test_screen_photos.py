from __future__ import annotations

import asyncio
import base64
import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.boundary import RequestBoundary
from app.document_ai import ParsedDocument, ParsedLine
from app.imports import ImportRejected
from app.screen_photos import (
    PHOTO_TYPE,
    Cell,
    PhotoReading,
    currency_code,
    merge_readings,
    read_photo,
)
from tests.test_imports import make_shop
from tests.test_photos import app, join  # noqa: F401

GOLDENS = Path(__file__).parent / "fixtures" / "screen-photos"


def reading(case: str) -> PhotoReading:
    return PhotoReading.model_validate_json((GOLDENS / case / "expected.json").read_text())


def test_merge_photos_drops_repeated_headers_but_preserves_identical_sales() -> None:
    first = reading("tally")
    second = first.model_copy(deep=True)
    header = second.tables[0].rows[0].model_copy(deep=True)
    header.name = Cell(value="Item Name", confidence=1, unreadable=False)
    header.price = Cell(value="Rate", confidence=1, unreadable=False)
    second.tables[0].rows.insert(0, header)
    headers, rows, flags, currency, source = merge_readings([first, second])
    assert len(rows) == 2  # repeated sale is not silently discarded
    assert rows[0] == rows[1]
    assert headers[0] == "name"
    assert flags == []
    assert (currency, source) == ("INR", "Tally")


def test_unreadable_and_low_confidence_cells_exclude_whole_rows() -> None:
    photo = reading("excel")
    headers, rows, flags, _, _ = merge_readings([photo])
    assert len(rows) == 1
    assert rows[0][headers.index("name")] == "Masala Dosa"
    assert flags[0].model_dump() == {
        "photo": 1,
        "table": 1,
        "row": 2,
        "field": "price",
        "confidence": 0.2,
    }
    photo.tables[0].rows[0].name.confidence = 0.84
    assert merge_readings([photo])[1] == []


@pytest.mark.parametrize(
    "raw,expected",
    [("₹", "INR"), ("Rs.", "INR"), ("usd", "USD"), ("€", "EUR"), ("$", None), (None, None)],
)
def test_currency_detection(raw: str | None, expected: str | None) -> None:
    assert currency_code(raw) == expected


def test_conflicting_currencies_and_extra_schema_keys_rejected() -> None:
    first, second = reading("tally"), reading("printed")
    second.currency = "USD"
    with pytest.raises(ImportRejected, match="PHOTO_CURRENCY_CONFLICT"):
        merge_readings([first, second])
    with pytest.raises(ValidationError):
        PhotoReading.model_validate({**first.model_dump(), "invented": True})


@pytest.mark.parametrize("case", ["tally", "excel", "petpooja", "printed"])
async def test_golden_offline_vision_fixture(case: str) -> None:
    mapper = Mock(settings=SimpleNamespace(coach_mode="offline"))
    mapper.client.side_effect = AssertionError("offline fixture must never contact Gemini")
    document = Mock(read=AsyncMock(side_effect=AssertionError("no external services")))
    result = await read_photo(mapper, document, (GOLDENS / case / "photo.png").read_bytes())
    assert result == reading(case)


async def test_unknown_offline_upload_does_not_invent_fixture_rows() -> None:
    with pytest.raises(ImportRejected, match="PHOTO_READER_OFFLINE"):
        await read_photo(Mock(settings=SimpleNamespace(coach_mode="offline")), Mock(), b"unknown")


async def test_vision_uses_strict_schema_and_document_ai_only_for_clean_print() -> None:
    blank = reading("printed").model_copy(update={"tables": []})
    generate = AsyncMock(return_value=SimpleNamespace(parsed=blank))
    mapper = Mock(settings=SimpleNamespace(coach_mode="gemini", google_text_model="fixture-model"))
    mapper.client.return_value.aio.models.generate_content = generate
    document = Mock(read=AsyncMock(return_value=None))
    image = (GOLDENS / "printed" / "photo.png").read_bytes()
    await read_photo(mapper, document, image)
    document.read.assert_awaited_once()
    config = generate.call_args.kwargs["config"]
    assert config.response_mime_type == "application/json"
    assert config.response_json_schema["additionalProperties"] is False
    document.read.reset_mock()
    blank.page_kind = "screen"
    await read_photo(mapper, document, image)
    document.read.assert_not_awaited()


async def test_printed_fallback_keeps_real_confidence_and_sales_date() -> None:
    mapper = Mock(settings=SimpleNamespace(coach_mode="gemini", google_text_model="fixture"))
    mapper.client.return_value.aio.models.generate_content = AsyncMock(
        return_value=SimpleNamespace(parsed=reading("printed").model_copy(update={"tables": []}))
    )
    parsed = ParsedDocument(
        processor="receipt",
        currency="INR",
        date="2026-10-17",
        date_confidence=0.97,
        lines=[
            ParsedLine(
                item="Idli",
                quantity=3,
                unit_price=40,
                amount=120,
                cell_confidence={
                    "description": 0.99,
                    "quantity": 0.97,
                    "unit_price": 0.96,
                    "amount": 0.98,
                },
            )
        ],
    )
    document = Mock(read=AsyncMock(return_value=parsed))
    result = await read_photo(mapper, document, (GOLDENS / "printed" / "photo.png").read_bytes())
    headers, rows, flags, _, _ = merge_readings([result])
    assert flags == []
    assert rows[0][headers.index("date")] == "2026-10-17"
    assert result.tables[0].rows[0].price.confidence == 0.96


async def test_cancelled_vision_call_cleans_up_without_document_fallback() -> None:
    started, cleaned = asyncio.Event(), asyncio.Event()

    async def wait_for_cancel(**kwargs):
        started.set()
        try:
            await asyncio.Future()
        finally:
            cleaned.set()

    mapper = Mock(settings=SimpleNamespace(coach_mode="gemini", google_text_model="fixture"))
    mapper.client.return_value.aio.models.generate_content = wait_for_cancel
    document = Mock(read=AsyncMock())
    task = asyncio.create_task(
        read_photo(mapper, document, (GOLDENS / "printed" / "photo.png").read_bytes())
    )
    await asyncio.wait_for(started.wait(), 2)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert cleaned.is_set()
    document.read.assert_not_awaited()


def test_api_photo_batch_review_confirm_and_owner_isolation(app) -> None:  # noqa: F811
    with TestClient(app) as client:
        join(client)
        bid = make_shop(client, currency="INR")
        photos = [
            base64.b64encode((GOLDENS / case / "photo.png").read_bytes()).decode()
            for case in ("excel", "petpooja")
        ]
        url = f"/api/v1/businesses/{bid}/connect/analyze"
        response = client.post(
            url, content=json.dumps({"photos": photos}), headers={"content-type": PHOTO_TYPE}
        )
        assert response.status_code == 200, response.text
        result = response.json()
        assert result["total_rows"] == 2
        assert len(result["cell_flags"]) == 1
        assert result["detected_currency"] == "INR"
        assert client.get(f"/api/v1/businesses/{bid}/inventory").json() == []
        assert client.get(f"/api/v1/businesses/{bid}/connect/mappings").json() == []
        synced = client.post(
            f"/api/v1/businesses/{bid}/connect/sync",
            json={
                "content": result["photo_content"],
                "content_type": "application/json",
                "mapping": result["mapping"],
            },
        )
        assert synced.status_code == 200, synced.text
        assert client.get(f"/api/v1/businesses/{bid}/inventory").json() == []
        proposal = synced.json()["proposal"]
        assert (
            client.post(
                f"/api/v1/proposals/{proposal['id']}/approve", json={"digest": proposal["digest"]}
            ).status_code
            == 200
        )
        items = client.get(f"/api/v1/businesses/{bid}/inventory").json()
        assert {item["name"] for item in items} == {"Masala Dosa", "Mango Lassi"}
        client.cookies.clear()
        join(client)
        assert client.post(
            url, content=json.dumps({"photos": photos}), headers={"content-type": PHOTO_TYPE}
        ).status_code in (403, 404)


def test_api_rejects_currency_mismatch_and_invalid_batches(app) -> None:  # noqa: F811
    with TestClient(app) as client:
        join(client)
        bid = make_shop(client, currency="USD")
        photo = base64.b64encode((GOLDENS / "tally" / "photo.png").read_bytes()).decode()
        url = f"/api/v1/businesses/{bid}/connect/analyze"
        for payload, code in [
            ({"photos": [photo]}, "PHOTO_CURRENCY_MISMATCH"),
            ({"photos": []}, "INVALID_PHOTOS"),
            ({"photos": ["!"]}, "INVALID_PHOTOS"),
            ({"photos": [photo] * 9}, "INVALID_PHOTOS"),
        ]:
            result = client.post(
                url, content=json.dumps(payload), headers={"content-type": PHOTO_TYPE}
            )
            assert result.status_code == 422
            assert result.json()["detail"] == code


async def test_large_connector_bodies_are_streamed_only_on_bounded_connector_routes() -> None:
    reached = []

    async def endpoint(scope, receive, send):
        reached.append(scope["path"])

    async def receive():
        return {"type": "http.request", "body": b""}

    async def send(message):
        pass

    boundary = RequestBoundary(endpoint, [])
    for suffix in ("analyze", "sync"):
        path = f"/api/v1/businesses/fixture/connect/{suffix}"
        await boundary(
            {
                "type": "http",
                "method": "POST",
                "path": path,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", b"2000000"),
                ],
            },
            receive,
            send,
        )
        assert path in reached
