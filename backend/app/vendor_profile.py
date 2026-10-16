"""Versioned vendor profiles and shared relevance rules, independent of storage/provider."""

from __future__ import annotations

import re
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

ShortText = Annotated[str, Field(min_length=1, max_length=80)]
Offerings = Annotated[list[ShortText], Field(max_length=20)]


class Attributes(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class FoodAttributes(Attributes):
    cuisine: list[ShortText] = Field(default_factory=list, max_length=8)
    diet: Literal["unknown", "veg_only", "vegan", "non_veg", "both"] = "unknown"
    serves_meat: bool | None = None
    # Explicit regional relevance, never inferred from the owner's name or religion.
    halal_relevant: bool = False

    @model_validator(mode="after")
    def consistent_diet(self) -> FoodAttributes:
        if self.diet in {"veg_only", "vegan"}:
            if self.serves_meat is True:
                raise ValueError("A vegetarian or vegan business cannot serve meat.")
            self.serves_meat = False
            self.halal_relevant = False
        return self


class TailorAttributes(Attributes):
    services: Offerings = Field(default_factory=list)
    turnaround: str = Field(default="", max_length=200)
    measurements: str = Field(default="", max_length=200)


class SalonAttributes(Attributes):
    services: Offerings = Field(default_factory=list)
    booking: str = Field(default="", max_length=200)
    walk_ins: bool | None = None


class RetailAttributes(Attributes):
    categories: Offerings = Field(default_factory=list)
    delivery: str = Field(default="", max_length=40)


class ServiceAttributes(Attributes):
    services: Offerings = Field(default_factory=list)
    service_area: str = Field(default="", max_length=200)
    appointment: bool | None = None


class BusinessTypeProfile(Attributes):
    """Gemini proposes this from owner words/menu/photos; approval still belongs to the owner.

    A single envelope keeps the ADK tool schema simple; only the matching typed block is valid.
    Missing profiles are version 1 generic, without guessing anything about existing records.
    """

    version: Literal[1] = 1
    kind: Literal["generic", "food", "tailor", "salon", "retail", "grocer", "service"] = "generic"
    subtype: str = Field(default="", max_length=80)
    food: FoodAttributes | None = None
    tailor: TailorAttributes | None = None
    salon: SalonAttributes | None = None
    retail: RetailAttributes | None = None
    service: ServiceAttributes | None = None

    @model_validator(mode="after")
    def matching_attributes(self) -> BusinessTypeProfile:
        block = "retail" if self.kind == "grocer" else self.kind
        for key in ("food", "tailor", "salon", "retail", "service"):
            if getattr(self, key) is not None and key != block:
                raise ValueError(f"{key} attributes do not belong to a {self.kind} profile.")
        return self


def profile_for(fields: dict[str, Any]) -> BusinessTypeProfile:
    return BusinessTypeProfile.model_validate(fields.get("profile") or {})


def migrate_profile(fields: dict[str, Any]) -> dict[str, Any]:
    """Lazy, additive migration shared by both stores. Never rewrite proposal snapshots/digests.

    Reads expose the generic default; the next approved business write persists it. No bulk
    backfill, invented customer facts, revision bump, or data loss for an older app instance.
    """
    return {**fields, "profile": profile_for(fields).model_dump(exclude_none=True)}


def infer_profile(category: str, description: str = "") -> BusinessTypeProfile:
    """Conservative offline fallback. Live Gemini can supply richer multilingual attributes.

    Deliberately exclude business names: 'Tea Tree Tailors' must not become a food business.
    """
    from .business_profile import FOOD

    text = f"{category} {description}".casefold()
    if re.search(r"tailor|alteration|dressmak|seamstress", text):
        return BusinessTypeProfile(kind="tailor", tailor=TailorAttributes())
    if re.search(r"salon|barber|hair|nail|beauty|spa|lash|brow", text):
        return BusinessTypeProfile(kind="salon", salon=SalonAttributes())
    if re.search(r"grocer|supermarket|minimart|provision|vegetable market", text):
        return BusinessTypeProfile(kind="grocer", retail=RetailAttributes())
    if re.search(r"hardware|retail|store|pharmacy|clothing", text):
        return BusinessTypeProfile(kind="retail", retail=RetailAttributes())
    if re.search(FOOD[0], text) or re.search(r"butcher|meat shop", text):
        food = FoodAttributes()
        if re.search(r"\bvegan\b", text):
            food.diet, food.serves_meat = "vegan", False
        elif re.search(r"\b(?:vegetarian|veg)[ -]?only\b|\bpure veg\b|vegetarian restaurant", text):
            food.diet, food.serves_meat = "veg_only", False
        elif re.search(r"butcher|\b(?:chicken|mutton|beef|pork|meat)\b", text):
            food.serves_meat = True
        return BusinessTypeProfile(kind="food", food=food)
    if re.search(r"service|repair|plumb|electric|tuition|tutor|cleaning|consult", text):
        return BusinessTypeProfile(kind="service", service=ServiceAttributes())
    return BusinessTypeProfile()


def halal_allowed(fields: dict[str, Any]) -> bool:
    profile = profile_for(fields)
    food = profile.food
    if profile.kind == "generic":
        # Legacy food records remain readable, but unknown meat/relevance is never a question.
        return False
    return bool(
        profile.kind == "food"
        and food
        and food.diet not in {"veg_only", "vegan"}
        and food.serves_meat is True
        and food.halal_relevant
    )


def allowed_facts(fields: dict[str, Any]) -> set[str]:
    profile = profile_for(fields)
    legacy_food = (
        infer_profile(fields.get("category", "")).food if profile.kind == "generic" else None
    )
    food = profile.food or legacy_food
    keys = {"payment_methods", "busy_hours"}
    if profile.kind not in {"salon", "service"}:
        keys.add("locally_made")
    if profile.kind == "generic" and not (food and food.diet in {"veg_only", "vegan"}):
        # Preserve explicitly confirmed legacy facts; the question policy is stricter.
        keys.add("halal")
    if profile.kind in {"generic", "food", "retail", "grocer"}:
        keys |= {"delivery", "delivery_note", "preorders", "preorder_lead_time"}
    if profile.kind == "food" or (
        profile.kind == "generic" and infer_profile(fields.get("category", "")).kind == "food"
    ):
        if not food or food.diet not in {"veg_only", "vegan"}:
            keys.add("vegetarian_options")
    if halal_allowed(fields):
        keys.add("halal")
    return keys


def vocabulary(profile: BusinessTypeProfile) -> dict[str, Any]:
    if profile.kind in {"tailor", "salon", "service"}:
        return {"catalogue": "services", "entry": "service", "units": ["service", "hour", "piece"]}
    if profile.kind == "food":
        return {"catalogue": "menu", "entry": "item", "units": ["piece", "cup", "plate", "kg"]}
    return {"catalogue": "items", "entry": "item", "units": ["item", "piece", "kg", "pack"]}


def apply_answers(profile: BusinessTypeProfile, facts: list[dict[str, Any]]) -> BusinessTypeProfile:
    """Keep typed attributes in step with reviewed answers. No free-text boolean guessing."""
    from .business_profile import typed_plan

    if profile.kind == "generic":
        return profile
    # All known keys, including already answered attributes, are valid for corrections.
    empty = BusinessTypeProfile(kind=profile.kind, subtype=profile.subtype)
    allowed = {q.key for q in typed_plan(empty).questions}
    # A meat answer is possible when food's typed block is absent too.
    if profile.kind == "food":
        allowed.add("serves_meat")
    data = profile.model_dump(exclude_none=True)
    block_key = "retail" if profile.kind == "grocer" else profile.kind
    block = data.setdefault(block_key, {})
    block_models: dict[str, type[BaseModel]] = {
        "food": FoodAttributes,
        "tailor": TailorAttributes,
        "salon": SalonAttributes,
        "retail": RetailAttributes,
        "service": ServiceAttributes,
    }
    for fact in facts:
        key, value = fact["key"], fact["value"].strip()
        if key not in allowed:
            raise ValueError(f"{key} is not a question for this business profile.")
        if key not in block_models[block_key].model_fields:
            continue
        if key in {"serves_meat", "walk_ins", "appointment"}:
            booleans = {"yes": True, "true": True, "no": False, "false": False}
            if value.casefold() not in booleans:
                # Preserve the owner's words in custom_facts without claiming a boolean.
                block[key] = None
            else:
                block[key] = booleans[value.casefold()]
        elif key == "diet":
            diets = {
                "vegetarian only": "veg_only",
                "vegetarian": "veg_only",
                "veg only": "veg_only",
                "vegan": "vegan",
                "non-vegetarian": "non_veg",
                "both": "both",
                "unknown": "unknown",
                "veg_only": "veg_only",
                "non_veg": "non_veg",
            }
            if value.casefold() not in diets:
                raise ValueError("Use veg_only, vegan, non_veg, both or unknown for diet.")
            block[key] = diets[value.casefold()]
            if block[key] in {"veg_only", "vegan"}:
                block["serves_meat"] = False
                block["halal_relevant"] = False
        elif key in {"services", "categories", "cuisine"}:
            block[key] = [value]
        else:
            block[key] = value
    return BusinessTypeProfile.model_validate(data)


def custom_keys(profile: BusinessTypeProfile) -> set[str]:
    from .business_profile import typed_plan

    return {
        q.key
        for q in typed_plan(
            BusinessTypeProfile(kind=profile.kind, subtype=profile.subtype)
        ).questions
    }
