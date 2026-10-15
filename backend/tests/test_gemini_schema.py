"""Every schema we send to Gemini must avoid keywords it rejects with a bare 400.

On 15 Oct 2026 photo menus, Close the day photos and demo generation all failed in production
because response schemas carried list-length limits. This guards every call site offline.
"""

import json
import pathlib
from typing import Any

from app.day_close import DayRead
from app.demo_world import _WorldSpec
from app.gemini_schema import UNSUPPORTED, gemini_schema, parse_reply
from app.ingestion import Extraction
from app.photos import _PhotoSpec
from app.sourcing import DemoSuppliers

app_dir = pathlib.Path(__file__).resolve().parents[1] / "app"


def keywords(node: Any) -> set[str]:
    if isinstance(node, dict):
        return set(node) | {k for value in node.values() for k in keywords(value)}
    if isinstance(node, list):
        return {k for value in node for k in keywords(value)}
    return set()


def test_only_plain_schemas_are_sent_directly() -> None:
    # New Gemini calls must use response_json_schema=gemini_schema(Model) + parse_reply.
    direct = {
        path.name
        for path in pathlib.Path(app_dir).glob("*.py")
        if "response_schema=" in path.read_text(encoding="utf-8")
    }
    assert direct == {"photos.py", "demo_world.py"}
    for model in (_PhotoSpec, _WorldSpec):
        assert not keywords(model.model_json_schema()) & UNSUPPORTED, model.__name__


def test_strict_models_are_sent_through_the_helper() -> None:
    for model in (DayRead, Extraction, DemoSuppliers):
        assert keywords(model.model_json_schema()) & UNSUPPORTED  # the limits exist here…
        assert not keywords(gemini_schema(model)) & UNSUPPORTED  # …but never reach Gemini


def test_parse_reply_applies_the_full_model() -> None:
    class Reply:
        parsed = None
        text = json.dumps({"kind": "sales", "date": "", "lines": []})

    assert parse_reply(DayRead, Reply()) is not None

    class Broken:
        parsed = None
        text = "{not json"

    assert parse_reply(DayRead, Broken()) is None
