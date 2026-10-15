"""Response schemas Gemini accepts.

Gemini on Vertex rejects some JSON Schema keywords in a response schema with a bare
`400 INVALID_ARGUMENT` (found 15 Oct 2026: list-length limits `minItems`/`maxItems`; Pydantic
`gt=` also fails client-side as `exclusiveMinimum`). Send the model's schema without them and
validate the reply with the full Pydantic model, so the limits still apply on our side.
"""

from __future__ import annotations

import re
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


NUMBER = re.compile(r"-?\d+(?:[.,]\d+)*")


def to_number(value: object) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int | float):
        return float(value)
    match = NUMBER.search(str(value or ""))
    if not match:
        return None
    digits = match.group(0)
    # "1,200" is a thousands separator; "12,50" is a decimal comma.
    if "," in digits and "." not in digits:
        head, _, tail = digits.rpartition(",")
        digits = f"{head.replace(',', '')}.{tail}" if len(tail) != 3 else digits.replace(",", "")
    try:
        return float(digits.replace(",", ""))
    except ValueError:
        return None
