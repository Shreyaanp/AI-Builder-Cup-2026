"""Document AI for till receipts and supplier invoices, with Gemini vision as the fallback.

Close the day sends a till receipt to the Expense parser and a supplier invoice or delivery note
to the Invoice parser. Both are pretrained processors in ``DOCUMENT_AI_LOCATION`` (``us``: the
Expense parser is not offered in asia-south1). Any failure, an empty reading or a switched-off
feature returns ``None`` and the caller reads the photo with Gemini instead, so the owner never
sees a provider error. Readings are remembered by image hash: a retry of the same photo is free.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import re
import time
from collections import OrderedDict
from typing import Any, Literal

import anyio
import httpx
import structlog
from pydantic import BaseModel, Field

from .settings import Settings

log = structlog.get_logger()

Processor = Literal["receipt", "invoice"]
TIMEOUT_SECONDS = 20
CACHE_SIZE = 64
# "22 x Egg Tart": the count printed inside the description.
COUNTED = re.compile(r"^(\d{1,5}(?:\.\d+)?)\s*[xX×*]\s+(.+)$")


class ParsedLine(BaseModel):
    item: str = Field(min_length=1, max_length=180)
    quantity: float | None = Field(default=None, ge=0, le=1_000_000, allow_inf_nan=False)
    amount: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    unit: str = Field(default="", max_length=20)
    unit_price: float | None = Field(default=None, ge=0, allow_inf_nan=False)
    code: str = Field(default="", max_length=40)
    cell_confidence: dict[str, float] = Field(default_factory=dict)


class ParsedDocument(BaseModel):
    """What a processor found, in the same plain shape for receipts and invoices."""

    processor: Processor
    date: str = ""
    date_confidence: float = Field(default=0, ge=0, le=1)
    currency: str = ""
    number: str = ""
    supplier: str = ""
    ref: str = ""
    total: float | None = None
    lines: list[ParsedLine] = Field(default_factory=list, max_length=200)
    # Several printed rows came back as one line item (seen on a column-less delivery note).
    merged_rows: bool = False

    def complete(self) -> bool:
        """Every line has what Close the day needs: a count, and money on a till receipt.
        Anything less goes to Gemini rather than to the owner as a half-read photo."""
        return (
            bool(self.lines)
            and not self.merged_rows
            and all(
                line.quantity is not None
                and (self.processor == "invoice" or line.amount is not None)
                for line in self.lines
            )
        )


def _number(entity: dict[str, Any]) -> float | None:
    """Money and quantities: the normalised value when the processor gives one, else the text."""
    normalized = entity.get("normalizedValue") or {}
    money = normalized.get("moneyValue")
    if money:
        return round(int(money.get("units") or 0) + int(money.get("nanos") or 0) / 1e9, 4)
    for text in (normalized.get("text"), entity.get("mentionText")):
        if not text:
            continue
        cleaned = "".join(c for c in str(text) if c.isdigit() or c in ".-")
        try:
            value = float(cleaned)
        except ValueError:
            continue
        if value >= 0:
            return value
    return None


def _date(entity: dict[str, Any]) -> str:
    value = (entity.get("normalizedValue") or {}).get("dateValue") or {}
    if value.get("year") and value.get("month") and value.get("day"):
        return f"{value['year']:04d}-{value['month']:02d}-{value['day']:02d}"
    return ""


def _text(entity: dict[str, Any]) -> str:
    return " ".join(str(entity.get("mentionText") or "").split())


def parse_document(document: dict[str, Any], processor: Processor) -> ParsedDocument:
    """Map a Document AI ``Document`` (REST JSON) to plain lines. Totals/tax rows never become
    lines: the parsers put them in their own entities."""
    parsed = ParsedDocument(processor=processor)
    for entity in document.get("entities") or []:
        kind = entity.get("type", "")
        if kind == "line_item":
            fields: dict[str, dict[str, Any]] = {}
            for prop in entity.get("properties") or []:
                fields.setdefault(prop.get("type", "").removeprefix("line_item/"), prop)
            raw = str(fields.get("description", {}).get("mentionText") or "").strip()
            description = _text(fields.get("description", {})) or _text(entity)
            if not description:
                continue
            parsed.merged_rows = parsed.merged_rows or "\n" in raw
            quantity = _number(fields["quantity"]) if "quantity" in fields else None
            counted = COUNTED.match(description)
            if quantity is None and counted:
                quantity, description = float(counted[1]), counted[2]
            amount = _number(fields["amount"]) if "amount" in fields else None
            unit_price = _number(fields["unit_price"]) if "unit_price" in fields else None
            if amount is None and unit_price is not None and quantity is not None:
                amount = round(unit_price * quantity, 2)
            try:
                parsed.lines.append(
                    ParsedLine(
                        item=description[:180],
                        quantity=quantity,
                        amount=amount,
                        unit=_text(fields.get("unit", {}))[:20],
                        unit_price=unit_price,
                        code=_text(fields.get("product_code", {}))[:40],
                        cell_confidence={
                            key: float(prop.get("confidence") or 0) for key, prop in fields.items()
                        },
                    )
                )
            except ValueError:
                continue  # a negative or nonsense number: skip the line, keep the rest
        elif kind in ("receipt_date", "invoice_date", "purchase_date") and not parsed.date:
            parsed.date = _date(entity)
            parsed.date_confidence = float(entity.get("confidence") or 0)
        elif kind == "currency" and not parsed.currency:
            code = (entity.get("normalizedValue") or {}).get("text") or _text(entity)
            parsed.currency = code.upper()[:3] if len(code) == 3 else ""
        elif kind == "invoice_id":
            parsed.number = _text(entity)[:40]
        elif kind == "supplier_name" and not parsed.supplier:
            parsed.supplier = _text(entity)[:120]
        elif kind == "purchase_order":
            parsed.ref = _text(entity)[:40]
        elif kind == "total_amount":
            parsed.total = _number(entity)
            money = ((entity.get("normalizedValue") or {}).get("moneyValue")) or {}
            if not parsed.currency and money.get("currencyCode"):
                parsed.currency = str(money["currencyCode"])[:3]
    if not parsed.date:
        # A delivery note may carry only its delivery date.
        parsed.date = next(
            (_date(e) for e in document.get("entities") or [] if e.get("type") == "delivery_date"),
            "",
        )
    parsed.lines = _join_price_rows(parsed.lines)[:200]
    return parsed


def _is_price(text: str) -> bool:
    return bool(text) and all(c.isdigit() or c in ".,- " for c in text)


def _join_price_rows(lines: list[ParsedLine]) -> list[ParsedLine]:
    """Two-row receipts ("3 x Kopi O" then "4.80" under it) come back as two line items:
    the price-only row belongs to the item above it."""
    joined: list[ParsedLine] = []
    for line in lines:
        if _is_price(line.item):
            if joined and joined[-1].amount is None and line.amount is not None:
                joined[-1] = joined[-1].model_copy(update={"amount": line.amount})
            continue  # a bare number is never an item name
        joined.append(line)
    return joined


def supply_reading(parsed: ParsedDocument) -> dict[str, Any]:
    """The supply chain's canonical invoice reading (``supply_docs.Reading`` fields), so a
    photographed supplier invoice joins the same review as a typed or IDoc one."""
    return {
        "kind": "invoice",
        "number": parsed.number or "photo",
        "ref": parsed.ref,
        "issued": parsed.date,
        "delivery": "",
        "currency": parsed.currency or "XXX",
        "terms_days": None,
        "total": parsed.total,
        "lines": [
            {
                "line": (index + 1) * 10,
                "item": line.item[:120],
                "supplier_code": line.code,
                "buyer_code": "",
                "quantity": line.quantity or 0,
                "unit": line.unit or "piece",
                "unit_price": line.unit_price,
                "line_total": line.amount,
                "status": "accepted",
            }
            for index, line in enumerate(parsed.lines[:60])
        ],
        "flags": [],
    }


class DocumentAIReader:
    """REST adapter for ``processors:process`` using the runtime's Google credentials."""

    def __init__(self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None):
        self.settings = settings
        self.transport = transport
        self._credentials: Any = None
        self._cache: OrderedDict[str, ParsedDocument] = OrderedDict()

    @property
    def enabled(self) -> bool:
        return bool(
            self.settings.document_ai_enabled
            and self.settings.google_cloud_project
            and self.settings.document_ai_receipt_processor
            and self.settings.document_ai_invoice_processor
        )

    def processor_id(self, processor: Processor) -> str:
        return (
            self.settings.document_ai_receipt_processor
            if processor == "receipt"
            else self.settings.document_ai_invoice_processor
        )

    async def _token(self) -> str:
        if self.transport is not None:
            return "test-token"

        def refresh() -> str:
            from google.auth import default
            from google.auth.transport.requests import Request

            if self._credentials is None:
                self._credentials, _ = default(
                    scopes=["https://www.googleapis.com/auth/cloud-platform"]
                )
            if not self._credentials.valid:
                self._credentials.refresh(Request())
            return str(self._credentials.token)

        return await anyio.to_thread.run_sync(refresh)

    async def read(
        self, data: bytes, processor: Processor, mime_type: str = "image/jpeg"
    ) -> ParsedDocument | None:
        """The parsed document, or ``None`` when Document AI is off or failed. The caller uses
        it only when ``complete()``; otherwise Gemini reads the photo."""
        if not self.enabled:
            return None
        key = f"{processor}:{hashlib.sha256(data).hexdigest()}"
        if key in self._cache:
            self._cache.move_to_end(key)
            return self._cache[key]
        location = self.settings.document_ai_location
        url = (
            f"https://{location}-documentai.googleapis.com/v1/projects/"
            f"{self.settings.google_cloud_project}/locations/{location}/processors/"
            f"{self.processor_id(processor)}:process"
        )
        started = time.monotonic()
        try:
            async with asyncio.timeout(TIMEOUT_SECONDS):
                token = await self._token()
                async with httpx.AsyncClient(
                    timeout=TIMEOUT_SECONDS, transport=self.transport
                ) as client:
                    response = await client.post(
                        url,
                        headers={"Authorization": f"Bearer {token}"},
                        json={
                            "rawDocument": {
                                "content": base64.b64encode(data).decode(),
                                "mimeType": mime_type,
                            },
                            # Only the entities are used; skip the per-page layout payload.
                            "fieldMask": "entities",
                        },
                    )
                    response.raise_for_status()
                    document = response.json().get("document") or {}
        except Exception as error:
            # Provider text never reaches the owner; Gemini reads the photo instead.
            log.warning("document_ai_failed", processor=processor, error=type(error).__name__)
            return None
        parsed = parse_document(document, processor)
        log.info(
            "document_ai_read",
            processor=processor,
            lines=len(parsed.lines),
            complete=parsed.complete(),
            ms=round((time.monotonic() - started) * 1000),
        )
        # Incomplete readings are remembered too, so a retry goes straight to Gemini.
        self._cache[key] = parsed
        if len(self._cache) > CACHE_SIZE:
            self._cache.popitem(last=False)
        return parsed
