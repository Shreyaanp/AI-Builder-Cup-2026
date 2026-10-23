"""OB-194: the menu sheet's photo and PDF import survives one model hiccup, says why it gave up,
and keeps the model's thinking bounded so a read fits inside the app's wait.

#520 hardened only the chat photo pipeline; this import path still failed on the first error
with no log line.
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from structlog.testing import capture_logs

from app.imports import ImportRejected
from app.ingestion import ExtractedRow, Extraction, extract
from app.photos import READ_THINKING_BUDGET, PhotoPipeline
from app.settings import Settings

PDF = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"
MENU = Extraction(kind="menu", rows=[ExtractedRow(name="Masala Dosa", price=60, confidence=0.9)])


def mapper(*replies: object) -> SimpleNamespace:
    client = Mock()
    client.aio.models.generate_content = AsyncMock(side_effect=list(replies))
    return SimpleNamespace(
        settings=SimpleNamespace(coach_mode="gemini", google_text_model="fixture-model"),
        client=lambda: client,
        calls=client.aio.models.generate_content,
    )


def reply(parsed: object, finish: str = "STOP") -> SimpleNamespace:
    return SimpleNamespace(
        parsed=parsed,
        text="",
        prompt_feedback=None,
        candidates=[SimpleNamespace(finish_reason=finish)],
    )


def photos() -> PhotoPipeline:
    return PhotoPipeline(Settings(_env_file=None, media_dir="unused"))


async def test_menu_pdf_read_retries_a_failed_call_once_and_bounds_thinking() -> None:
    reader = mapper(RuntimeError("503 UNAVAILABLE"), reply(MENU))
    with capture_logs() as logs:
        found = await extract(reader, photos(), PDF, "application/pdf")
    assert found.rows[0].name == "Masala Dosa"
    assert [entry["event"] for entry in logs] == ["import_extraction_failed"]
    config = reader.calls.call_args.kwargs["config"]
    assert config.thinking_config.thinking_budget == READ_THINKING_BUDGET <= 1024


async def test_menu_read_retries_a_cut_off_reply_then_gives_up_with_reasons() -> None:
    reader = mapper(reply(None, "MAX_TOKENS"), reply(MENU))
    assert (await extract(reader, photos(), PDF, "application/pdf")).kind == "menu"

    reader = mapper(reply(None, "MAX_TOKENS"), RuntimeError("deadline"))
    with capture_logs() as logs, pytest.raises(ImportRejected) as rejected:
        await extract(reader, photos(), PDF, "application/pdf")
    assert (rejected.value.status, rejected.value.code) == (503, "EXTRACTION_UNAVAILABLE")
    assert [entry["event"] for entry in logs] == [
        "import_extraction_unreadable",
        "import_extraction_failed",
    ]


async def test_a_blocked_document_is_never_retried() -> None:
    reader = mapper(reply(None, "SAFETY"), reply(MENU))
    with pytest.raises(ImportRejected) as rejected:
        await extract(reader, photos(), PDF, "application/pdf")
    assert rejected.value.code == "DOCUMENT_BLOCKED"
    assert reader.calls.await_count == 1


async def test_chat_photo_sorting_skips_thinking_and_reading_bounds_it() -> None:
    from app.photos import _KindSpec, _PhotoSpec

    pipeline = photos()
    pipeline.settings = SimpleNamespace(
        coach_mode="gemini", moderation_mode="vision", google_text_model="fixture-model"
    )
    spec = _PhotoSpec.model_validate({"photo_kind": "menu", "products": []})
    client = Mock()
    client.aio.models.generate_content = AsyncMock(
        side_effect=[reply(_KindSpec(kind="menu")), reply(spec)]
    )
    pipeline._genai = client
    assert await pipeline.classify(b"jpeg") == "menu"
    assert (await pipeline.extract(b"jpeg")).photo_kind == "menu"
    calls = client.aio.models.generate_content.call_args_list
    sort, read = (call.kwargs["config"] for call in calls)
    # Production 22 Oct: sorting one photo took 39.5 s while the model thought about it.
    assert sort.thinking_config.thinking_budget == 0
    assert read.thinking_config.thinking_budget == READ_THINKING_BUDGET
