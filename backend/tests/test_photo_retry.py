"""Photo calls survive one model or moderation hiccup and log why they gave up.

Production 21 Oct (and 20 Oct): /photos/classify returned a silent 503 on the first try and
worked on the next, so the owner's menu photo failed with nothing in the logs.
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
from structlog.testing import capture_logs

from app.photos import PhotoPipeline, PhotoRejected, _KindSpec, _PhotoSpec
from app.settings import Settings


def pipeline() -> PhotoPipeline:
    photos = PhotoPipeline(Settings(_env_file=None, media_dir="unused"))
    photos.settings = SimpleNamespace(
        coach_mode="gemini", moderation_mode="vision", google_text_model="fixture-model"
    )
    return photos


def gemini(*replies: object) -> Mock:
    client = Mock()
    client.aio.models.generate_content = AsyncMock(side_effect=list(replies))
    return client


def reply(parsed: object, finish: str = "STOP") -> SimpleNamespace:
    return SimpleNamespace(
        parsed=parsed, prompt_feedback=None, candidates=[SimpleNamespace(finish_reason=finish)]
    )


async def test_classify_retries_a_failed_call_once() -> None:
    photos = pipeline()
    photos._genai = gemini(RuntimeError("503 UNAVAILABLE"), reply(_KindSpec(kind="menu")))
    with capture_logs() as logs:
        assert await photos.classify(b"jpeg") == "menu"
    assert [entry["event"] for entry in logs] == ["photo_classify_failed"]


async def test_classify_retries_an_unreadable_reply_and_leaves_room_to_think() -> None:
    photos = pipeline()
    photos._genai = gemini(reply(None, "MAX_TOKENS"), reply(_KindSpec(kind="receipt")))
    assert await photos.classify(b"jpeg") == "receipt"
    config = photos._genai.aio.models.generate_content.call_args.kwargs["config"]
    assert config.max_output_tokens >= 1024


async def test_classify_gives_up_after_two_tries_with_a_logged_reason() -> None:
    photos = pipeline()
    photos._genai = gemini(reply(None, "MAX_TOKENS"), RuntimeError("deadline"))
    with capture_logs() as logs, pytest.raises(PhotoRejected) as rejected:
        await photos.classify(b"jpeg")
    assert (rejected.value.status, rejected.value.code) == (503, "EXTRACTION_UNAVAILABLE")
    assert [entry["event"] for entry in logs] == [
        "photo_classify_unreadable",
        "photo_classify_failed",
    ]


async def test_menu_reading_retries_once_but_never_retries_a_blocked_photo() -> None:
    photos = pipeline()
    spec = _PhotoSpec.model_validate({"photo_kind": "menu", "products": []})
    photos._genai = gemini(RuntimeError("503 UNAVAILABLE"), reply(spec))
    assert (await photos.extract(b"jpeg")).photo_kind == "menu"

    photos._genai = gemini(reply(None, "SAFETY"), reply(spec))
    with pytest.raises(PhotoRejected) as rejected:
        await photos.extract(b"jpeg")
    assert rejected.value.code == "PHOTO_BLOCKED"
    assert photos._genai.aio.models.generate_content.await_count == 1


def test_moderation_retries_once_and_turns_client_errors_into_503() -> None:
    scores = SimpleNamespace(adult=1, racy=1, violence=1)
    ok = SimpleNamespace(error=SimpleNamespace(message=""), safe_search_annotation=scores)
    photos = pipeline()
    photos._vision = Mock(safe_search_detection=Mock(side_effect=[RuntimeError("UNAVAILABLE"), ok]))
    assert photos.moderate_sync(b"jpeg") == {"adult": 1, "racy": 1, "violence": 1}

    failed = SimpleNamespace(error=SimpleNamespace(message="quota"), safe_search_annotation=None)
    photos._vision = Mock(safe_search_detection=Mock(side_effect=[RuntimeError("down"), failed]))
    with capture_logs() as logs, pytest.raises(PhotoRejected) as rejected:
        photos.moderate_sync(b"jpeg")
    assert (rejected.value.status, rejected.value.code) == (503, "MODERATION_UNAVAILABLE")
    assert [entry["error"] for entry in logs] == ["down", "quota"]
