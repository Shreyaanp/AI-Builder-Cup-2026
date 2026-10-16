"""Business rules per buyer–supplier relationship, and the checks that enforce them.

Stored per pair (the shop and one supplier): credit terms (cash, 7 or 30 days) with a credit
limit, an approval limit (orders above it, and any order to a new supplier, need the owner's
tap), whether orders under the limit may go out automatically, the supplier's system format,
and per item: minimum order quantity (MOQ), pack size, lead time, price tiers by quantity,
allowed substitutes, and whether partial deliveries and back-orders are accepted.

Every check returns plain codes with numbers (never sentences), so the coach and every screen
word them in the owner's language and offer the same one-tap fixes.
"""

from __future__ import annotations

import math
from datetime import date, timedelta
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .supply_docs import FORMATS, Format

Terms = Literal[0, 7, 30]


class PriceTier(BaseModel):
    model_config = ConfigDict(extra="forbid")
    min_quantity: float = Field(ge=0, le=1_000_000)
    price: int = Field(ge=0, le=10**12, description="Minor units per unit")


class ItemRule(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    item: str = Field(min_length=1, max_length=80)
    unit: str = Field(default="kg", max_length=20)
    supplier_code: str = Field(default="", max_length=40)
    moq: float = Field(default=0, ge=0, le=1_000_000)
    pack: float = Field(default=0, ge=0, le=100_000, description="Sold in multiples of this")
    lead_days: int = Field(default=1, ge=0, le=60)
    tiers: list[PriceTier] = Field(default_factory=list, max_length=6)
    substitutes: list[str] = Field(default_factory=list, max_length=6)
    partial_ok: bool = True
    backorder_ok: bool = True

    @field_validator("tiers")
    @classmethod
    def sorted_tiers(cls, tiers: list[PriceTier]) -> list[PriceTier]:
        return sorted(tiers, key=lambda tier: tier.min_quantity)

    @field_validator("substitutes")
    @classmethod
    def clean_substitutes(cls, names: list[str]) -> list[str]:
        return [name.strip()[:80] for name in names if name.strip()]


class RuleSet(BaseModel):
    """What the owner edits (screen or coach). Money is in minor units of the shop currency."""

    model_config = ConfigDict(extra="forbid")
    terms_days: Terms = 7
    credit_limit: int = Field(default=0, ge=0, le=10**13, description="0 = no credit limit")
    approval_over: int = Field(default=0, ge=0, le=10**13, description="0 = approve every order")
    new_supplier_approval: bool = True
    auto_send: bool = False
    system_format: Format = "json"
    items: list[ItemRule] = Field(default_factory=list, max_length=40)

    @model_validator(mode="after")
    def unique_items(self) -> RuleSet:
        seen = set()
        for rule in self.items:
            key = rule.item.casefold()
            if key in seen:
                raise ValueError(f"items: {rule.item} is listed twice")
            seen.add(key)
        if self.system_format not in FORMATS:
            raise ValueError("system_format: idoc, csv, text or json")
        return self


def item_rule(rules: RuleSet, item: str) -> ItemRule | None:
    from .sourcing import matches

    for rule in rules.items:
        if rule.item.casefold() == item.casefold():
            return rule
    for rule in rules.items:
        if matches(rule.item, item) or matches(item, rule.item):
            return rule
    return None


def tier_price(rule: ItemRule | None, quantity: float, list_price: int | None) -> int | None:
    """The unit price at this quantity: the highest tier reached, else the list price."""
    price = list_price
    for tier in rule.tiers if rule else []:
        if quantity >= tier.min_quantity:
            price = tier.price
    return price


def next_tier(rule: ItemRule | None, quantity: float) -> PriceTier | None:
    for tier in rule.tiers if rule else []:
        if quantity < tier.min_quantity:
            return tier
    return None


def round_quantity(rule: ItemRule | None, quantity: float) -> float:
    """Up to the MOQ, then up to whole packs."""
    if rule is None:
        return quantity
    amount = max(quantity, rule.moq)
    if rule.pack:
        amount = math.ceil(round(amount / rule.pack, 6)) * rule.pack
    return round(amount, 3)


def arrival(today: date, lead_days: int) -> date:
    """Suppliers do not deliver on Sunday; a Sunday arrival moves to Monday."""
    day = today + timedelta(days=lead_days)
    return day + timedelta(days=1) if day.weekday() == 6 else day


class Check(BaseModel):
    """One broken rule (or a reason the owner must approve), with its one-tap fix."""

    code: Literal[
        "below_moq",
        "not_pack_multiple",
        "over_credit",
        "late",
        "over_approval",
        "new_supplier",
        "no_price",
    ]
    line: int | None = None
    item: str = ""
    values: dict[str, Any] = Field(default_factory=dict)
    fix: dict[str, Any] | None = None
    blocking: bool = True


def evaluate(
    po: dict[str, Any],
    rules: RuleSet,
    open_balance: int,
    known_supplier: bool,
    today: date,
) -> list[Check]:
    """Every rule the order breaks (blocking) and every reason it needs the owner's tap."""
    checks: list[Check] = []
    need = po.get("need_by") or ""
    for line in po["lines"]:
        rule = item_rule(rules, line["item"])
        if line["price"] is None:
            checks.append(Check(code="no_price", line=line["line"], item=line["item"]))
        if rule is None:
            continue
        if rule.moq and line["quantity"] < rule.moq:
            checks.append(
                Check(
                    code="below_moq",
                    line=line["line"],
                    item=line["item"],
                    values={"moq": rule.moq, "unit": rule.unit, "quantity": line["quantity"]},
                    fix={"kind": "quantity", "line": line["line"], "value": rule.moq},
                )
            )
        elif (
            rule.pack
            and abs(line["quantity"] / rule.pack - round(line["quantity"] / rule.pack)) > 1e-6
        ):
            checks.append(
                Check(
                    code="not_pack_multiple",
                    line=line["line"],
                    item=line["item"],
                    values={"pack": rule.pack, "unit": rule.unit},
                    fix={
                        "kind": "quantity",
                        "line": line["line"],
                        "value": round_quantity(rule, line["quantity"]),
                    },
                )
            )
        if need:
            arrives = arrival(today, rule.lead_days)
            if arrives.isoformat() > need:
                checks.append(
                    Check(
                        code="late",
                        line=line["line"],
                        item=line["item"],
                        values={
                            "arrives": arrives.isoformat(),
                            "need_by": need,
                            "lead_days": rule.lead_days,
                        },
                        fix={"kind": "supplier", "value": po.get("faster_supplier")}
                        if po.get("faster_supplier")
                        else None,
                    )
                )
    total = po["total"]
    if rules.terms_days and rules.credit_limit and open_balance + total > rules.credit_limit:
        headroom = max(0, rules.credit_limit - open_balance)
        checks.append(
            Check(
                code="over_credit",
                values={
                    "limit": rules.credit_limit,
                    "open": open_balance,
                    "headroom": headroom,
                    "total": total,
                },
                fix=fit_to_credit(po, rules, headroom),
            )
        )
    if rules.approval_over and total > rules.approval_over:
        checks.append(
            Check(code="over_approval", values={"limit": rules.approval_over}, blocking=False)
        )
    if not rules.approval_over:
        checks.append(Check(code="over_approval", values={"limit": 0}, blocking=False))
    if rules.new_supplier_approval and not known_supplier:
        checks.append(Check(code="new_supplier", blocking=False))
    return checks


def fit_to_credit(po: dict[str, Any], rules: RuleSet, headroom: int) -> dict[str, Any]:
    """Shrink the largest line so the order fits the credit left; else pay cash for this one."""
    lines = [line for line in po["lines"] if line["price"]]
    if not lines:
        return {"kind": "cash"}
    largest = max(lines, key=lambda line: line["total"] or 0)
    others = sum(line["total"] or 0 for line in lines if line is not largest)
    room = headroom - others
    rule = item_rule(rules, largest["item"])
    if room > 0 and largest["price"]:
        quantity = math.floor(room / largest["price"])
        if rule and rule.pack:
            quantity = math.floor(quantity / rule.pack) * rule.pack
        if quantity > 0 and (not rule or quantity >= rule.moq):
            return {"kind": "quantity", "line": largest["line"], "value": quantity}
    return {"kind": "cash"}


def needs_approval(checks: list[Check]) -> bool:
    return any(not check.blocking for check in checks)


def blocking(checks: list[Check]) -> list[Check]:
    return [check for check in checks if check.blocking]


def default_rules(
    supplier: dict[str, Any], currency: str, index: int, minor_per_major: int
) -> RuleSet:
    """Sensible starting rules for a supplier the shop has not set up yet (the owner edits
    them). Demo suppliers each run a different system, so the translator has work to do."""
    from .sourcing import fact

    lead = int(fact(supplier, "lead_days", "1") or 1)
    items = []
    for product in (supplier.get("products") or [])[:12]:
        unit = product["unit"]
        bulk = unit in {"kg", "litre"}
        price = int(product["price"])
        items.append(
            ItemRule(
                item=product["name"][:80],
                unit=unit,
                supplier_code=f"MAT-{100000 + (abs(hash_text(product['name'])) % 899999)}",
                moq=10 if bulk else 2,
                pack=5 if bulk else 1,
                lead_days=lead,
                tiers=[
                    PriceTier(min_quantity=25 if bulk else 10, price=round(price * 0.96)),
                    PriceTier(min_quantity=50 if bulk else 25, price=round(price * 0.92)),
                ],
            )
        )
    formats: list[Format] = ["idoc", "csv", "text", "json"]
    return RuleSet(
        terms_days=(7, 30, 0, 7)[index % 4],
        credit_limit=(5000, 15000, 0, 8000)[index % 4] * minor_per_major,
        approval_over=2000 * minor_per_major,
        new_supplier_approval=True,
        auto_send=False,
        system_format=formats[index % 4] if supplier.get("demo") else "json",
        items=items,
    )


def hash_text(text: str) -> int:
    import hashlib

    return int(hashlib.sha256(text.casefold().encode()).hexdigest()[:8], 16)


class RuleChange(BaseModel):
    """What the coach may change in one call (voice or text); everything is optional."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    terms_days: Terms | None = Field(default=None, description="0 cash, 7 or 30 days credit")
    credit_limit: float | None = Field(default=None, ge=0, description="Major units; 0 = none")
    approval_over: float | None = Field(default=None, ge=0, description="Major units")
    auto_send: bool | None = None
    system_format: Format | None = None
    item: str = Field(default="", max_length=80, description="Item the item fields apply to")
    moq: float | None = Field(default=None, ge=0)
    pack: float | None = Field(default=None, ge=0)
    lead_days: int | None = Field(default=None, ge=0, le=60)
    tier_quantity: float | None = Field(default=None, ge=0, description="Tier starts here")
    tier_price: float | None = Field(default=None, ge=0, description="Major units per unit")
    substitutes: list[str] | None = Field(default=None, max_length=6)
    partial_ok: bool | None = None
    backorder_ok: bool | None = None


def apply_change(rules: RuleSet, change: RuleChange, currency: str) -> RuleSet:
    from .money import to_minor

    data = rules.model_copy(deep=True)
    if change.terms_days is not None:
        data.terms_days = change.terms_days
    if change.credit_limit is not None:
        data.credit_limit = to_minor(change.credit_limit, currency)
    if change.approval_over is not None:
        data.approval_over = to_minor(change.approval_over, currency)
    if change.auto_send is not None:
        data.auto_send = change.auto_send
    if change.system_format is not None:
        data.system_format = change.system_format
    item_fields = [
        change.moq,
        change.pack,
        change.lead_days,
        change.tier_quantity,
        change.substitutes,
        change.partial_ok,
        change.backorder_ok,
    ]
    if any(value is not None for value in item_fields):
        if not change.item:
            raise ValueError("item: name the item these rules apply to")
        rule = item_rule(data, change.item)
        if rule is None:
            rule = ItemRule(item=change.item)
            data.items.append(rule)
        if change.moq is not None:
            rule.moq = change.moq
        if change.pack is not None:
            rule.pack = change.pack
        if change.lead_days is not None:
            rule.lead_days = change.lead_days
        if change.tier_quantity is not None:
            if change.tier_price is None:
                raise ValueError("tier_price: give the price per unit at that quantity")
            tiers = [t for t in rule.tiers if t.min_quantity != change.tier_quantity]
            tiers.append(
                PriceTier(
                    min_quantity=change.tier_quantity, price=to_minor(change.tier_price, currency)
                )
            )
            rule.tiers = sorted(tiers, key=lambda tier: tier.min_quantity)[:6]
        if change.substitutes is not None:
            rule.substitutes = [name.strip()[:80] for name in change.substitutes if name.strip()]
        if change.partial_ok is not None:
            rule.partial_ok = change.partial_ok
        if change.backorder_ok is not None:
            rule.backorder_ok = change.backorder_ok
    return RuleSet.model_validate(data.model_dump())
