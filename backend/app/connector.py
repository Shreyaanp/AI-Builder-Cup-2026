"""Connect any POS, ERP or billing system to Chalkboard.

Owners upload whatever their external system exports – CSV, XLSX, JSON (Shopify, Square) or
XML (Tally, SAP IDoc).  Gemini maps source fields to the Chalkboard schema; offline mode falls
back to header heuristics.  A confirmed mapping can be saved and re-applied on future imports.
"""

from __future__ import annotations

import json
import xml.etree.ElementTree as ET
from typing import Any, Literal

import structlog
from pydantic import BaseModel, Field

from .gemini_schema import gemini_schema, parse_reply
from .imports import (
    SAMPLE_ROWS,
    MAX_BYTES,
    MAX_ROWS,
    ColumnMap,
    ColumnMapper,
    ImportRejected,
    heuristic_map,
    parse_table,
)
from .settings import Settings  # noqa: F401 – re-exported for convenience

log = structlog.get_logger()

# ── Content-type sets ────────────────────────────────────────────────────────
JSON_TYPES = {"application/json", "text/json"}
XML_TYPES = {"application/xml", "text/xml"}

# ── Target schema roles ─────────────────────────────────────────────────────
TARGET_FIELDS = ("name", "price", "unit", "stock", "quantity", "date", "total", "category")


# ── Pydantic models ─────────────────────────────────────────────────────────
class FieldMapping(BaseModel):
    """One source → target column mapping produced by Gemini or confirmed by the owner."""

    source_field: str = Field(description="Original column/field name from the export")
    target_field: str = Field(description="Our schema field: " + ", ".join(TARGET_FIELDS))
    confidence: float = Field(ge=0, le=1, description="Mapping confidence 0–1")
    sample_values: list[str] = Field(
        max_length=3, description="Up to 3 sample values from that column"
    )


class ConnectorMapping(BaseModel):
    """Complete mapping from an external system export to the Chalkboard schema."""

    source_label: str = Field(
        description="E.g. Petpooja, Tally, Square, Shopify, SAP, Other"
    )
    kind: Literal["menu", "sales"]
    fields: list[FieldMapping]
    confirmed: bool = False


class ConnectorResult(BaseModel):
    """What we return to the frontend after parsing + AI mapping."""

    mapping: ConnectorMapping
    preview_rows: list[dict[str, Any]] = Field(description="First 5 rows mapped to our schema")
    total_rows: int
    warnings: list[str]


# ── JSON parser ──────────────────────────────────────────────────────────────
def _flatten(obj: Any, prefix: str = "") -> dict[str, str]:
    """Flatten a nested dict into dot-notation keys with string values."""
    out: dict[str, str] = {}
    if isinstance(obj, dict):
        for key, value in obj.items():
            full = f"{prefix}{key}" if not prefix else f"{prefix}.{key}"
            if isinstance(value, dict):
                out.update(_flatten(value, full + "."))
            elif isinstance(value, list):
                out[full] = str(value)
            else:
                out[full] = "" if value is None else str(value)
    else:
        out[prefix.rstrip(".")] = str(obj)
    return out


def parse_json_export(data: bytes) -> tuple[list[str], list[list[str]]]:
    """Flatten a JSON array-of-objects or single-object-with-array into tabular rows."""
    if len(data) > MAX_BYTES:
        raise ImportRejected(413, "FILE_TOO_LARGE")
    try:
        parsed = json.loads(data)
    except (json.JSONDecodeError, ValueError):
        raise ImportRejected(415, "UNREADABLE_FILE") from None

    # Normalise to a list of dicts.
    records: list[dict[str, Any]]
    if isinstance(parsed, list):
        records = [r for r in parsed if isinstance(r, dict)]
    elif isinstance(parsed, dict):
        # Find the first key whose value is a list of dicts (e.g. {"items": [...]}).
        records = []
        for value in parsed.values():
            if isinstance(value, list) and value and isinstance(value[0], dict):
                records = [r for r in value if isinstance(r, dict)]
                break
        if not records:
            records = [parsed]
    else:
        raise ImportRejected(422, "EMPTY_FILE")

    if not records:
        raise ImportRejected(422, "EMPTY_FILE")
    if len(records) > MAX_ROWS:
        raise ImportRejected(413, "TOO_MANY_ROWS")

    flat_rows = [_flatten(r) for r in records]
    all_keys: list[str] = []
    seen: set[str] = set()
    for row in flat_rows:
        for key in row:
            if key not in seen:
                all_keys.append(key)
                seen.add(key)
    rows = [[row.get(k, "") for k in all_keys] for row in flat_rows]
    return all_keys, rows


# ── XML parser ───────────────────────────────────────────────────────────────
_TALLY_PATHS = (
    ".//STOCKITEM",
    ".//VOUCHER",
    ".//TALLYMESSAGE/STOCKITEM",
    ".//TALLYMESSAGE/VOUCHER",
)


def parse_xml_export(data: bytes) -> tuple[list[str], list[list[str]]]:
    """Parse XML (SAP IDoc, Tally, generic) into tabular rows."""
    if len(data) > MAX_BYTES:
        raise ImportRejected(413, "FILE_TOO_LARGE")
    try:
        root = ET.fromstring(data)  # noqa: S314 – trusted owner uploads only
    except ET.ParseError:
        raise ImportRejected(415, "UNREADABLE_FILE") from None

    # Try well-known Tally paths first, then fall back to the most repeated child tag.
    elements: list[ET.Element] = []
    for xpath in _TALLY_PATHS:
        elements = root.findall(xpath)
        if elements:
            break

    if not elements:
        # Generic: find the tag name that appears most often among grandchildren.
        tag_counts: dict[str, int] = {}
        for child in root:
            for grandchild in child:
                tag_counts[grandchild.tag] = tag_counts.get(grandchild.tag, 0) + 1
            # Also count direct children as potential row elements.
            tag_counts[child.tag] = tag_counts.get(child.tag, 0) + 1
        if tag_counts:
            row_tag = max(tag_counts, key=lambda t: tag_counts[t])
            elements = root.findall(f".//{row_tag}")

    if not elements:
        raise ImportRejected(422, "EMPTY_FILE")
    if len(elements) > MAX_ROWS:
        raise ImportRejected(413, "TOO_MANY_ROWS")

    # Extract child-element text as columns.
    all_keys: list[str] = []
    seen: set[str] = set()
    for elem in elements:
        for child in elem:
            if child.tag not in seen:
                all_keys.append(child.tag)
                seen.add(child.tag)
        # Include attributes as columns.
        for attr in elem.attrib:
            if attr not in seen:
                all_keys.append(attr)
                seen.add(attr)

    if not all_keys:
        raise ImportRejected(422, "EMPTY_FILE")

    rows: list[list[str]] = []
    for elem in elements:
        child_map = {ch.tag: (ch.text or "").strip() for ch in elem}
        row = [child_map.get(k, elem.attrib.get(k, "")) for k in all_keys]
        rows.append(row)

    return all_keys, rows


# ── Unified parser ───────────────────────────────────────────────────────────
def parse_any(data: bytes, content_type: str) -> tuple[list[str], list[list[str]]]:
    """Route to the right parser based on content type."""
    if content_type in JSON_TYPES:
        return parse_json_export(data)
    if content_type in XML_TYPES:
        return parse_xml_export(data)
    # CSV and XLSX handled by the existing import pipeline.
    return parse_table(data, content_type)


# ── AI mapping ───────────────────────────────────────────────────────────────
CONNECTOR_PROMPT = (
    "You map columns from an external system export to the Chalkboard inventory schema. "
    "The source system is '{source_label}'. Given the column names and sample rows, decide "
    "whether the data is a menu/price list (kind \"menu\") or a sales/transactions export "
    "(kind \"sales\"), and map each source column to the best target field. Target fields: "
    + ", ".join(TARGET_FIELDS)
    + ". Set confidence 0–1 for each mapping. Omit columns that don't match any target field."
)


class _AIMappingResponse(BaseModel):
    """Schema sent to Gemini for structured output."""

    source_label: str
    kind: Literal["menu", "sales"]
    fields: list[FieldMapping]


async def ai_map_fields(
    mapper: ColumnMapper,
    headers: list[str],
    sample: list[list[str]],
    source_label: str,
) -> ConnectorMapping:
    """Use Gemini to map source columns to the Chalkboard schema, with heuristic fallback."""
    if mapper.settings.coach_mode != "gemini":
        return _heuristic_connector_mapping(headers, sample, source_label)
    try:
        from google.genai import types

        table = "\n".join(" | ".join(row) for row in [headers, *sample[:SAMPLE_ROWS]])
        response = await mapper.client().aio.models.generate_content(
            model=mapper.settings.google_text_model,
            contents=table[:8000],
            config=types.GenerateContentConfig(
                system_instruction=CONNECTOR_PROMPT.format(source_label=source_label),
                response_mime_type="application/json",
                response_json_schema=gemini_schema(_AIMappingResponse),
                temperature=0,
                max_output_tokens=1000,
            ),
        )
        parsed = parse_reply(_AIMappingResponse, response)
        if isinstance(parsed, _AIMappingResponse) and parsed.fields:
            return ConnectorMapping(
                source_label=parsed.source_label or source_label,
                kind=parsed.kind,
                fields=parsed.fields,
            )
    except Exception:
        log.warning("connector_ai_map_failed", source_label=source_label)
    return _heuristic_connector_mapping(headers, sample, source_label)


def _heuristic_connector_mapping(
    headers: list[str], sample: list[list[str]], source_label: str
) -> ConnectorMapping:
    """Build a ConnectorMapping from the heuristic ColumnMap."""
    col_map = heuristic_map(headers)
    fields: list[FieldMapping] = []
    for role in TARGET_FIELDS:
        idx: int | None = getattr(col_map, role, None)
        if idx is not None and 0 <= idx < len(headers):
            samples = [row[idx] for row in sample[:3] if idx < len(row) and row[idx]]
            fields.append(
                FieldMapping(
                    source_field=headers[idx],
                    target_field=role,
                    confidence=0.6,
                    sample_values=samples[:3],
                )
            )
    return ConnectorMapping(
        source_label=source_label, kind=col_map.kind, fields=fields
    )


# ── Apply mapping ───────────────────────────────────────────────────────────
def apply_mapping(
    mapping: ConnectorMapping,
    headers: list[str],
    rows: list[list[str]],
) -> tuple[list[str], list[list[str]], ColumnMap]:
    """Convert a ConnectorMapping into the ColumnMap format used by the import pipeline."""
    header_index = {h: i for i, h in enumerate(headers)}
    col_kwargs: dict[str, int | None] = {role: None for role in TARGET_FIELDS}
    for fm in mapping.fields:
        idx = header_index.get(fm.source_field)
        if idx is not None and fm.target_field in col_kwargs:
            col_kwargs[fm.target_field] = idx
    col_map = ColumnMap(kind=mapping.kind, **col_kwargs)
    return headers, rows, col_map


# ── Diff ─────────────────────────────────────────────────────────────────────
def compute_diff(
    current_items: list[dict[str, Any]], new_items: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Compare current inventory with newly mapped items; return a list of changes.

    Each change dict has ``action`` (added | updated | removed), ``name``, and for updates
    ``old`` / ``new`` dicts with the changed fields.
    """
    current_by_name: dict[str, dict[str, Any]] = {
        (item.get("name", "") or "").casefold(): item for item in current_items if item.get("name")
    }
    new_by_name: dict[str, dict[str, Any]] = {
        (item.get("name", "") or "").casefold(): item for item in new_items if item.get("name")
    }
    changes: list[dict[str, Any]] = []

    for key, new_item in new_by_name.items():
        if key not in current_by_name:
            changes.append({"action": "added", "name": new_item["name"], "new": new_item})
        else:
            old_item = current_by_name[key]
            diffs: dict[str, Any] = {}
            for field in ("price", "unit", "stock", "category"):
                old_val = old_item.get(field)
                new_val = new_item.get(field)
                if old_val != new_val:
                    diffs[field] = {"old": old_val, "new": new_val}
            if diffs:
                changes.append({
                    "action": "updated",
                    "name": new_item["name"],
                    "old": old_item,
                    "new": new_item,
                    "fields": diffs,
                })

    for key, old_item in current_by_name.items():
        if key not in new_by_name:
            changes.append({"action": "removed", "name": old_item["name"], "old": old_item})

    return changes
