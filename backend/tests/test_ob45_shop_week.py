# ruff: noqa: F811  (route fixtures are imported and requested by name)
"""OB-45: stamps, area boards and co-op goals share the shop's Monday boundary."""

from datetime import datetime
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

import app.passport_routes as routes
from app.games import CoopStore
from app.passport import PassportStore
from tests.test_passport import (  # noqa: F401
    DEMO,
    SG,
    app,
    at_shop,
    client,
    demo_key,
    sign_in,
)


@pytest.mark.parametrize("app", ["sqlite"], indirect=True)
@pytest.mark.parametrize(
    ("local_time", "week"),
    [
        ("2026-10-18T23:59:59", "2026-W42"),
        ("2026-10-19T00:00:00", "2026-W43"),
        ("2026-10-19T07:59:59", "2026-W43"),
        ("2026-10-19T08:00:00", "2026-W43"),
        ("2027-01-04T00:00:00", "2027-W01"),
    ],
)
def test_ob45_singapore_stamp_board_and_coop_share_week(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, local_time: str, week: str
) -> None:
    instant = datetime.fromisoformat(local_time).replace(tzinfo=SG).timestamp()
    monkeypatch.setattr(routes, "time", SimpleNamespace(time=lambda: instant))
    sign_in(client)
    assert client.put("/api/v1/customer/passport/leaderboard", json={"on": True}).status_code == 200
    response = client.post(
        "/api/v1/customer/passport/stamps",
        json={"shop_id": DEMO, "key": demo_key(client), **at_shop(client)},
    )
    assert response.status_code == 200
    stamped = response.json()
    assert stamped["outcome"]["verdict"] == "stamped"
    assert stamped["outcome"]["stamp"]["week"] == week
    coop = stamped["passport"]["games"]["coop"]
    area = coop["area"]
    assert coop["week"] == week and coop["you"] == 1

    board = client.get("/api/v1/customer/passport/board").json()
    assert board["week"] == week
    assert board["you"]["points"] == 50 and board["you"]["stamps"] == 1
    boards: PassportStore = client.app.state.passport
    assert len(boards.board(area, week)) == 1  # Check the shared row, not just the view fallback.

    # A phone timezone (or its absence) must not change the area's shared goal.
    for params in ({}, {"tz": "America/Los_Angeles"}):
        reloaded = client.get("/api/v1/customer/passport", params=params).json()["games"]["coop"]
        assert reloaded["week"] == week and reloaded["you"] == 1

    coops: CoopStore = client.app.state.coop
    data = coops.get(area, week)
    coops.docs.update(
        "coop", f"{area}|{week}", area, lambda _: (instant, {**data, "visits": coop["goal"]})
    )
    claimed = client.post("/api/v1/customer/games/coop/claim", json={"area": area, "week": week})
    assert claimed.status_code == 200
    assert claimed.json()["games"]["coop"]["claimed"] is True

    left = client.put("/api/v1/customer/passport/leaderboard", json={"on": False})
    assert left.status_code == 200
    assert boards.board(area, week) == {}
    assert client.put("/api/v1/customer/passport/leaderboard", json={"on": True}).status_code == 200
    assert len(boards.board(area, week)) == 1
    assert client.delete("/api/v1/customer/passport").status_code == 200
    assert boards.board(area, week) == {}


@pytest.mark.parametrize("app", ["sqlite"], indirect=True)
def test_ob45_nearby_area_uses_shop_week_before_first_stamp(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    instant = datetime(2026, 10, 19, 1, tzinfo=SG).timestamp()
    monkeypatch.setattr(routes, "time", SimpleNamespace(time=lambda: instant))
    sign_in(client)
    location = at_shop(client)
    params = {"lat": location["lat"], "lng": location["lng"]}
    board = client.get("/api/v1/customer/passport/board", params=params)
    assert board.status_code == 200 and board.json()["week"] == "2026-W43"
    view = client.get("/api/v1/customer/passport", params=params)
    assert view.status_code == 200
    assert view.json()["games"]["coop"]["week"] == "2026-W43"
    direct = client.get("/api/v1/customer/passport/board", params={"area": board.json()["area"]})
    assert direct.status_code == 200 and direct.json()["week"] == "2026-W43"
