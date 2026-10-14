"""Deterministic fictional Google lifecycle. No provider, clock or network calls."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Scenario = Literal[
    "new-store-success",
    "service-area",
    "existing-managed",
    "claim-pending",
    "claim-rejected",
    "ambiguous-match",
    "video-required",
    "code-expired",
    "submit-unknown",
    "restricted",
    "reauthorization-required",
    "ineligible",
]
Phase = Literal[
    "goal",
    "type",
    "facts",
    "permission",
    "search",
    "claim",
    "review",
    "pending",
    "verify",
    "video",
    "result",
    "ineligible",
    "disconnect",
]
Method = Literal["sms", "email", "phone", "postcard", "pin", "automatic"]

CATEGORIES = {"IN": ["tea_shop", "bakery", "grocery"], "GB": ["bakery", "grocery"]}


class SimFacts(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(default="", max_length=180)
    location: str = Field(default="", max_length=300)
    hours: str = Field(default="", max_length=180)
    phone: str = Field(default="", max_length=40)
    website: str = Field(default="", max_length=300)
    service_area: str = Field(default="", max_length=300)
    category_id: str = Field(default="", max_length=40)
    region: Literal["IN", "GB"] = "IN"


class Match(BaseModel):
    id: str
    name: str
    address: str
    management: Literal["you", "other", "unclaimed"]


class SimState(BaseModel):
    model_config = ConfigDict(extra="forbid")
    scenario: Scenario = "new-store-success"
    business_id: str = "fixture"
    version: int = 0
    phase: Phase = "goal"
    facts: SimFacts
    business_type: Literal["store", "service", "online"] = "store"
    preview_revision: int = 1
    approved_revision: int | None = None
    account: Literal["none", "demo-owner"] = "none"
    authorization: Literal["none", "granted", "required"] = "none"
    matches: list[Match] = Field(default_factory=list)
    selected: str | None = None
    operation: Literal["create", "claim", "update"] = "create"
    ownership: Literal["none", "pending", "rejected", "granted"] = "none"
    submission: Literal["none", "accepted", "rejected", "unknown"] = "none"
    receipt: str | None = None
    submissions: int = 0
    methods: list[Method] = Field(default_factory=list)
    method: Method | None = None
    verification: Literal["unverified", "pending", "verified"] = "unverified"
    publication: Literal["not_submitted", "pending", "restricted"] = "not_submitted"
    removal: Literal["connected", "pending", "confirmed"] = "connected"
    error: Literal[
        "", "category", "missing", "account", "wrong_code", "expired_code", "field_hours"
    ] = ""
    attempt: int = 1
    reauthorized: bool = False
    needs_reverification: bool = False
    rehearsal_complete: bool = False


class SimAction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal[
        "start",
        "type",
        "facts",
        "authorize",
        "cancel",
        "select",
        "claim",
        "claim_result",
        "edit",
        "submit",
        "reconcile",
        "method",
        "code",
        "resend",
        "rehearse",
        "disconnect",
        "confirm_removal",
    ]
    version: int = Field(ge=0)
    value: str = Field(default="", max_length=80)
    facts: SimFacts | None = None
    revision: int | None = Field(default=None, ge=1)
    attempt: int | None = Field(default=None, ge=1)


class SimReset(BaseModel):
    model_config = ConfigDict(extra="forbid")
    scenario: Scenario = "new-store-success"
    version: int = Field(ge=0)


def initial(facts: SimFacts, scenario: Scenario = "new-store-success") -> SimState:
    return SimState(
        facts=facts.model_copy(deep=True),
        scenario=scenario,
        business_type="service" if scenario == "service-area" else "store",
    )


def fixture_matches(state: SimState) -> list[Match]:
    scenario = state.scenario
    if scenario not in {"existing-managed", "claim-pending", "claim-rejected", "ambiguous-match"}:
        return []
    management: Literal["you", "other", "unclaimed"] = (
        "you" if scenario == "existing-managed" else "other"
    )
    matches = [
        Match(
            id="SIM-location-1",
            name=state.facts.name,
            address="Demo Market Road",
            management=management,
        )
    ]
    if scenario == "ambiguous-match":
        matches.append(
            Match(
                id="SIM-location-2",
                name=state.facts.name,
                address="Demo Station Road",
                management="unclaimed",
            )
        )
    return matches


def step(state: SimState, action: SimAction, scenario: Scenario) -> SimState:
    """Reject stale/illegal transitions; never mutate the supplied state or merchant facts."""
    if scenario != state.scenario or action.version != state.version:
        raise ValueError("stale")
    s = state.model_copy(deep=True)
    kind, phase = action.kind, s.phase
    s.error = ""
    if s.removal != "connected" and kind != "confirm_removal":
        raise ValueError("disconnected")
    if kind == "start" and phase == "goal":
        s.phase = "type"
    elif kind == "type" and phase == "type" and action.value in {"store", "service", "online"}:
        s.business_type = action.value  # type: ignore[assignment]
        s.phase = "ineligible" if action.value == "online" or scenario == "ineligible" else "facts"
    elif kind == "facts" and phase in {"facts", "review"} and action.facts is not None:
        facts = action.facts
        if facts.category_id not in CATEGORIES[facts.region]:
            s.error = "category"
        elif s.submission == "rejected" and facts.hours == s.facts.hours:
            s.error = "field_hours"
        elif not all(
            [
                facts.name,
                facts.hours,
                facts.phone,
                facts.service_area if s.business_type == "service" else facts.location,
            ]
        ):
            s.error = "missing"
        else:
            if facts != s.facts:
                if (facts.location, facts.category_id) != (
                    s.facts.location,
                    s.facts.category_id,
                ) and s.verification == "verified":
                    s.needs_reverification = True
                    s.verification = "pending"
                s.preview_revision += 1
                s.approved_revision = None
                s.facts = facts.model_copy(deep=True)
                if s.submission == "rejected":
                    s.submission = "none"
            s.phase = "review" if s.authorization == "granted" else "permission"
    elif kind == "authorize" and phase == "permission":
        if action.value != "demo-owner":
            s.error = "account"
            s.account, s.authorization = "none", "none"
            s.phase = "facts"
        else:
            s.account, s.authorization = "demo-owner", "granted"
            if s.selected is not None or s.reauthorized:
                s.reauthorized = True
                s.phase = "review"
            else:
                s.matches = fixture_matches(s)
                s.phase = "search"
    elif kind == "cancel" and phase == "permission":
        s.account, s.authorization = "none", "none"
        s.phase = "facts"
    elif kind == "select" and phase == "search":
        match = next((m for m in s.matches if m.id == action.value), None)
        if match is None and (action.value != "new" or s.matches):
            raise ValueError("selection")
        s.selected = action.value
        s.operation = (
            "create" if match is None else "update" if match.management == "you" else "claim"
        )
        s.phase = "claim" if s.operation == "claim" else "review"
    elif kind == "claim" and phase == "claim" and s.ownership == "none":
        s.ownership = "rejected" if scenario == "claim-rejected" else "pending"
    elif (
        kind == "claim_result"
        and phase == "claim"
        and s.ownership == "pending"
        and action.value in {"granted", "rejected"}
    ):
        s.ownership = action.value  # type: ignore[assignment]
        if s.ownership == "granted":
            s.phase = "review"
    elif kind == "edit" and phase in {"review", "result"}:
        s.phase, s.approved_revision = "facts", None
    elif kind == "submit" and phase == "review":
        if action.revision != s.preview_revision or s.authorization != "granted":
            raise ValueError("approval")
        if scenario == "reauthorization-required" and not s.reauthorized:
            s.authorization, s.phase, s.reauthorized = "required", "permission", True
        elif action.value == "reject-hours":
            s.error, s.submission, s.approved_revision = "field_hours", "rejected", None
            s.phase = "facts"
        else:
            s.approved_revision = action.revision
            s.submissions += 1
            if s.method is not None:
                s.attempt += 1
            s.method = None
            s.receipt = f"SIM-{s.business_id}-{s.selected}-{s.preview_revision}"
            previously_verified = s.verification == "verified" and not s.needs_reverification
            s.publication = "pending"
            s.verification = "verified" if previously_verified else "pending"
            s.submission = "unknown" if scenario == "submit-unknown" else "accepted"
            if s.submission == "unknown":
                s.phase = "pending"
            elif previously_verified:
                s.verification, s.phase = "verified", "result"
            else:
                verification_step(s)
    elif kind == "reconcile" and phase == "pending" and s.submission == "unknown":
        s.submission = "accepted"
        verification_step(s)
    elif kind == "method" and phase == "verify" and action.value in s.methods:
        if s.method is not None and s.method != action.value:
            s.attempt += 1
        s.method = action.value
    elif kind == "code" and phase == "verify" and s.method is not None:
        if action.attempt != s.attempt:
            raise ValueError("attempt")
        if scenario == "code-expired" and s.attempt == 1:
            s.error = "expired_code"
        elif action.value != "123456":
            s.error = "wrong_code"
        else:
            s.verification, s.phase = "verified", "result"
            s.needs_reverification = False
            s.publication = "restricted" if scenario == "restricted" else "pending"
    elif kind == "resend" and phase == "verify" and s.method is not None:
        s.attempt += 1
    elif kind == "rehearse" and phase == "video":
        s.rehearsal_complete = action.value == "complete"
    elif kind == "disconnect" and phase not in {"goal", "disconnect"}:
        s.removal, s.phase, s.authorization = "pending", "disconnect", "none"
    elif kind == "confirm_removal" and phase == "disconnect" and s.removal == "pending":
        s.removal = "confirmed"
    else:
        raise ValueError("transition")
    s.version += 1
    return s


def verification_step(s: SimState) -> None:
    if s.verification == "verified" and not s.needs_reverification:
        s.phase = "result"
    elif s.scenario == "video-required":
        s.methods, s.phase = [], "video"
    elif s.scenario == "existing-managed" and not s.needs_reverification:
        s.methods, s.verification, s.phase = ["automatic"], "verified", "result"
    elif s.scenario == "reauthorization-required":
        s.methods, s.phase = [], "verify"
    else:
        s.methods, s.phase = ["sms", "email", "phone", "postcard", "pin"], "verify"
