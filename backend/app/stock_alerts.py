"""Seven-day anonymous reminders. Delivery is in-page; no push provider is configured."""

import hashlib
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field

ALERT_SECONDS = 7 * 86_400
MAX_ALERTS = 300


class StockAlertInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    device_id: UUID
    name: str = Field(min_length=1, max_length=180)
    unit: str = Field(min_length=1, max_length=40)


class StockAlertReceipt(BaseModel):
    expires: float
    delivery: str = "in_page"


def alert_key(body: StockAlertInput) -> str:
    return hashlib.sha256(f"{body.device_id}\0{body.name}\0{body.unit}".encode()).hexdigest()


def check_item(shop: dict[str, Any] | None, body: StockAlertInput) -> None:
    if shop is None:
        raise HTTPException(404, "Shop not available.")
    item = next(
        (p for p in shop["products"] if p["name"] == body.name and p["unit"] == body.unit), None
    )
    if item is None:
        raise HTTPException(404, "Item not found.")
    if item.get("available", True):
        raise HTTPException(409, "Item is already available.")
