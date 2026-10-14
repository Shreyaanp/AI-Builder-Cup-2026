from datetime import UTC, datetime

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.coordinator import MerchantContext, current, propose_business
from app.discover import open_now
from app.merchant import BusinessFields, DayHours, MerchantRepository, ProposalRequest

pytest_plugins = ("tests.test_merchant_store",)

WEEK = [
    {
        "day": day,
        "closed": day != "mon",
        "open": "22:00" if day == "mon" else None,
        "close": "02:00" if day == "mon" else None,
    }
    for day in ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
]


def test_weekly_hours_are_sealed_owned_and_public_on_both_adapters(store: MerchantRepository):
    fields = BusinessFields(name="Katong Kopi", hours="Ask us on holidays", weekly_hours=WEEK)
    proposal = store.propose("owner", ProposalRequest(kind="business", business=fields))
    assert not store.list_businesses("owner")
    assert proposal["snapshot"]["business"]["weekly_hours"] == WEEK
    receipt = store.commit("owner", proposal["id"], proposal["digest"])
    bid = receipt["business_id"]
    assert store.context("owner", bid)["business"]["fields"]["weekly_hours"] == WEEK
    with pytest.raises(HTTPException):
        store.context("another-owner", bid)
    store.share("owner", bid, True)
    public = store.public_shop(bid)
    assert public and public["weekly_hours"] == WEEK
    assert public["hours"] == "Ask us on holidays"
    fields.weekly_hours = []
    edit = store.propose(
        "owner",
        ProposalRequest(
            kind="business", business_id=bid, revision=receipt["revision"], business=fields
        ),
    )
    store.commit("owner", edit["id"], edit["digest"])
    assert "weekly_hours" not in store.context("owner", bid)["business"]["fields"]


def test_coach_prepares_weekly_hours_without_saving(store: MerchantRepository):
    ctx = MerchantContext(store, "owner", None, [])
    token = current.set(ctx)
    try:
        result = propose_business(name="Katong Kopi", weekly_hours=WEEK)
        assert result["status"] == "needs_review"
        assert not store.list_businesses("owner")
        assert ctx.proposals[result["proposal_id"]]["snapshot"]["business"]["weekly_hours"] == WEEK
    finally:
        current.reset(token)


@pytest.mark.parametrize(
    "instant, expected",
    [
        ("2026-10-12T13:59:00", False),  # Monday 21:59 Singapore
        ("2026-10-12T14:00:00", True),
        ("2026-10-12T17:59:00", True),  # Tuesday, closed day with overnight tail
        ("2026-10-12T18:00:00", False),
        ("2026-10-13T14:00:00", False),  # Tuesday evening must not reuse Monday's opening
    ],
)
def test_open_now_across_midnight(instant: str, expected: bool):
    assert (
        open_now(
            "09:00–18:00",
            "Asia/Singapore",
            datetime.fromisoformat(instant).replace(tzinfo=UTC),
            WEEK,
        )
        is expected
    )


def test_sunday_tail_and_missing_day():
    sunday = [{"day": "sun", "closed": False, "open": "23:00", "close": "03:00"}]
    assert open_now("", "UTC", datetime(2026, 10, 12, 2, tzinfo=UTC), sunday) is True
    assert open_now("", "UTC", datetime(2026, 10, 12, 3, tzinfo=UTC), sunday) is None


def test_daily_range_and_closed_day_fallback():
    assert open_now("09:00–18:00", "UTC", datetime(2026, 10, 12, 10, tzinfo=UTC)) is True
    assert open_now("Mon–Fri", "UTC") is None
    assert open_now("09:00–18:00", "UTC", datetime(2026, 10, 13, 10, tzinfo=UTC), WEEK) is False


@pytest.mark.parametrize(
    "open_time,close_time",
    [("25:00", "18:00"), ("09:60", "18:00"), ("09:00", "09:00"), (None, "18:00")],
)
def test_invalid_hours_rejected(open_time, close_time):
    with pytest.raises(ValidationError):
        DayHours(day="mon", open=open_time, close=close_time)


def test_duplicate_days_rejected():
    with pytest.raises(ValidationError):
        BusinessFields(name="Kopi", weekly_hours=[DayHours(day="mon", closed=True)] * 2)
