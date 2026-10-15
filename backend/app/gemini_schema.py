"""Response schemas Gemini accepts.

Gemini on Vertex rejects some JSON Schema keywords in a response schema with a bare
`400 INVALID_ARGUMENT` (found 15 Oct 2026: list-length limits `minItems`/`maxItems`; Pydantic
`gt=` also fails client-side as `exclusiveMinimum`). Send the model's schema without them and
validate the reply with the full Pydantic model, so the limits still apply on our side.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ValidationError

UNSUPPORTED = {"minItems", "maxItems", "exclusiveMinimum", "exclusiveMaximum"}


def _strip(node: Any) -> Any:
    if isinstance(node, dict):
        return {key: _strip(value) for key, value in node.items() if key not in UNSUPPORTED}
    if isinstance(node, list):
        return [_strip(value) for value in node]
    return node


def gemini_schema(model: type[BaseModel]) -> dict[str, Any]:
    """The model's JSON schema without keywords Gemini refuses (use as response_json_schema)."""
    return _strip(model.model_json_schema())


def parse_reply[Model: BaseModel](model: type[Model], response: Any) -> Model | None:
    """The reply as the full model (all limits applied), or None when it does not fit."""
    parsed = getattr(response, "parsed", None)
    if isinstance(parsed, model):
        return parsed
    try:
        return model.model_validate_json(getattr(response, "text", None) or "")
    except (ValidationError, ValueError):
        return None
