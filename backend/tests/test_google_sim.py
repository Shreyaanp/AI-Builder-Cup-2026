"""Section E acceptance: deterministic fixture paths and illegal/stale boundaries."""

from typing import Any, get_args

import pytest

from app.google_sim import Scenario, SimAction, SimFacts, SimState, initial, step

FACTS = SimFacts(
    name="Ram Tea",
    location="Private home",
    hours="09–18",
    phone="Demo contact",
    category_id="tea_shop",
    service_area="Demo Pune",
)


def act(s: SimState, kind: str, **kwargs: Any) -> SimState:
    return step(s, SimAction(kind=kind, version=s.version, **kwargs), s.scenario)


def review(scenario: Scenario = "new-store-success") -> SimState:
    s = initial(FACTS, scenario)
    s = act(s, "start")
    s = act(s, "type", value="service" if scenario == "service-area" else "store")
    if s.phase == "ineligible":
        return s
    s = act(s, "facts", facts=FACTS)
    s = act(s, "authorize", value="demo-owner")
    return act(s, "select", value=s.matches[0].id if s.matches else "new")


@pytest.mark.parametrize("scenario", get_args(Scenario))
def test_all_named_scenarios(scenario: Scenario) -> None:
    """E01–10, E17, E20: each named fixture has an explicit outcome."""
    s = review(scenario)
    if scenario == "ineligible":
        assert s.phase == "ineligible" and s.receipt is None
        return
    if s.phase == "claim":
        s = act(s, "claim")
        assert s.ownership == ("rejected" if scenario == "claim-rejected" else "pending")
        assert s.submissions == 0 and s.verification == "unverified"
        if scenario != "ambiguous-match":
            return
        s = act(s, "claim_result", value="granted")
    s = act(s, "submit", revision=s.preview_revision)
    if scenario == "reauthorization-required":
        assert s.phase == "permission" and s.authorization == "required"
        s = act(s, "authorize", value="demo-owner")
        s = act(s, "submit", revision=s.preview_revision)
        assert s.methods == [] and s.verification == "pending"
        return
    if scenario == "submit-unknown":
        receipt = s.receipt
        assert s.phase == "pending" and s.submissions == 1
        with pytest.raises(ValueError):
            act(s, "submit", revision=s.preview_revision)
        s = act(s, "reconcile")
        assert s.receipt == receipt and s.submissions == 1
    if scenario == "video-required":
        s = act(s, "rehearse", value="complete")
        assert s.verification == "pending" and s.rehearsal_complete and s.methods == []
        s = act(s, "rehearse", value="cancel")
        assert not s.rehearsal_complete and s.phase == "video"
        return
    if scenario == "existing-managed":
        assert s.operation == "update" and s.verification == "verified"
        return
    s = act(s, "method", value="sms")
    s = act(s, "code", value="123456", attempt=s.attempt)
    if scenario == "code-expired":
        assert s.error == "expired_code"
        s = act(s, "resend")
        s = act(s, "code", value="123456", attempt=s.attempt)
    assert s.verification == "verified"
    assert s.publication == ("restricted" if scenario == "restricted" else "pending")


def test_saved_facts_category_region_account_and_service_privacy() -> None:
    """E11–14: no inferred category/account rights; private location remains separate."""
    s = initial(FACTS, "service-area")
    assert s.facts == FACTS and s.facts is not FACTS
    s = act(act(s, "start"), "type", value="service")
    unsupported = FACTS.model_copy(update={"region": "GB"})
    rejected = act(s, "facts", facts=unsupported)
    assert rejected.error == "category" and rejected.facts == FACTS
    for value in ("arbitrary category", ""):
        assert (
            act(s, "facts", facts=FACTS.model_copy(update={"category_id": value})).error
            == "category"
        )
    s = act(s, "facts", facts=FACTS)
    cancelled = act(s, "cancel")
    assert cancelled.phase == "facts" and cancelled.facts == FACTS
    wrong = act(s, "authorize", value="wrong")
    assert wrong.account == "none" and wrong.error == "account" and wrong.facts == FACTS
    correct = act(act(wrong, "facts", facts=FACTS), "authorize", value="demo-owner")
    assert correct.phase == "search"
    assert correct.facts.service_area == "Demo Pune" and correct.facts.location == "Private home"


def test_ambiguous_matches_require_explicit_selection_and_claim() -> None:
    """E03–04: similarity never auto-claims or creates a duplicate."""
    s = act(act(initial(FACTS, "ambiguous-match"), "start"), "type", value="store")
    s = act(act(s, "facts", facts=FACTS), "authorize", value="demo-owner")
    assert len(s.matches) == 2 and s.selected is None and s.ownership == "none"
    assert s.matches[0].address != s.matches[1].address
    with pytest.raises(ValueError):
        act(s, "select", value="new")
    selected = act(s, "select", value=s.matches[1].id)
    assert selected.selected == "SIM-location-2" and selected.phase == "claim"


def test_preview_approval_and_rejected_field_recovery() -> None:
    """E15–16, E21: edits invalidate approval; rejection preserves unaffected fields."""
    s = review()
    with pytest.raises(ValueError):
        act(s, "submit", revision=s.preview_revision + 1)
    rejected = act(s, "submit", revision=s.preview_revision, value="reject-hours")
    assert rejected.error == "field_hours" and rejected.facts == FACTS
    assert rejected.submissions == 0 and rejected.approved_revision is None
    unchanged = act(rejected, "facts", facts=FACTS)
    assert unchanged.phase == "facts" and unchanged.error == "field_hours"
    updated = act(rejected, "facts", facts=FACTS.model_copy(update={"hours": "10–18"}))
    assert updated.preview_revision == s.preview_revision + 1
    with pytest.raises(ValueError):
        act(updated, "submit", revision=s.preview_revision)
    assert act(updated, "submit", revision=updated.preview_revision).submission == "accepted"


@pytest.mark.parametrize("method", ["sms", "email", "phone", "postcard", "pin"])
def test_offered_methods_wrong_code_and_attempt_isolation(method: str) -> None:
    """E06, E17–18: only returned methods, fictional code, attempt-bound recovery."""
    s = review()
    s = act(s, "submit", revision=s.preview_revision)
    with pytest.raises(ValueError):
        act(s, "method", value="invented")
    s = act(s, "method", value=method)
    wrong = act(s, "code", value="000000", attempt=s.attempt)
    assert wrong.error == "wrong_code" and wrong.facts == s.facts
    resent = act(wrong, "resend")
    with pytest.raises(ValueError):
        act(resent, "code", value="123456", attempt=s.attempt)
    assert act(resent, "code", value="123456", attempt=resent.attempt).verification == "verified"


def test_updates_reverification_and_disconnect_stop_queue() -> None:
    """E22, E25: hours-only updates versus category/address changes; pending removal."""
    s = review("existing-managed")
    s = act(s, "submit", revision=s.preview_revision)
    hours = act(act(s, "edit"), "facts", facts=FACTS.model_copy(update={"hours": "10–18"}))
    assert not hours.needs_reverification and hours.preview_revision > s.preview_revision
    assert act(hours, "submit", revision=hours.preview_revision).verification == "verified"
    for key, value in [("location", "New address"), ("category_id", "bakery")]:
        changed = act(act(s, "edit"), "facts", facts=FACTS.model_copy(update={key: value}))
        assert changed.needs_reverification and changed.verification == "pending"
    disconnected = act(s, "disconnect")
    assert disconnected.removal == "pending" and disconnected.authorization == "none"
    with pytest.raises(ValueError):
        act(disconnected, "edit")
    assert act(disconnected, "confirm_removal").removal == "confirmed"


def test_state_is_pure_and_stale_actions_are_rejected() -> None:
    s = initial(FACTS)
    snapshot = s.model_dump()
    changed = act(s, "start")
    assert s.model_dump() == snapshot
    with pytest.raises(ValueError):
        step(changed, SimAction(kind="type", value="store", version=0), changed.scenario)


def test_wrong_account_during_reauthorization_can_recover() -> None:
    s = review("reauthorization-required")
    s = act(s, "submit", revision=s.preview_revision)
    for kind, kwargs in [("cancel", {}), ("authorize", {"value": "wrong"})]:
        draft = act(s, kind, **kwargs)
        assert draft.authorization == "none" and draft.facts == s.facts
        permission = act(draft, "facts", facts=draft.facts)
        assert permission.phase == "permission"
        approved = act(permission, "authorize", value="demo-owner")
        assert approved.phase == "review"
        assert act(approved, "submit", revision=approved.preview_revision).phase == "verify"


def test_changing_method_invalidates_previous_attempt_and_new_revision_clears_method() -> None:
    """E18, E22: a code cannot verify another method or a later listing revision."""
    s = review()
    s = act(s, "submit", revision=s.preview_revision)
    with pytest.raises(ValueError):
        act(s, "resend")
    sms = act(s, "method", value="sms")
    email = act(sms, "method", value="email")
    with pytest.raises(ValueError):
        act(email, "code", value="123456", attempt=sms.attempt)
    verified = act(email, "code", value="123456", attempt=email.attempt)
    changed = act(
        act(verified, "edit"), "facts", facts=FACTS.model_copy(update={"location": "New road"})
    )
    submitted = act(changed, "submit", revision=changed.preview_revision)
    assert submitted.method is None and submitted.verification == "pending"
    with pytest.raises(ValueError):
        act(submitted, "code", value="123456", attempt=email.attempt)
