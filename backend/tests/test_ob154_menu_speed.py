"""OB-154: avoid serial photo reads and redundant AI column mapping, locally only."""

import asyncio
import base64
import json
from unittest.mock import AsyncMock, Mock

import pytest
from fastapi.testclient import TestClient

from app.imports import ImportRejected
from app.screen_photos import PHOTO_TYPE, read_batch
from tests.test_imports import make_shop
from tests.test_photos import app, join  # noqa: F401
from tests.test_screen_photos import GOLDENS, reading


async def test_ob154_photo_reads_overlap_with_bounded_work_and_keep_page_order(monkeypatch):
    active = 0
    peak = 0
    started = [asyncio.Event() for _ in range(8)]
    release = [asyncio.Event() for _ in range(8)]

    async def read(mapper, document, data):
        nonlocal active, peak
        index = int(data)
        active += 1
        peak = max(peak, active)
        started[index].set()
        try:
            await release[index].wait()
            return reading("excel").model_copy(update={"source_app": str(index)})
        finally:
            active -= 1

    monkeypatch.setattr("app.screen_photos.read_photo", read)
    payload = json.dumps({"photos": [base64.b64encode(str(i).encode()).decode() for i in range(8)]})
    task = asyncio.create_task(read_batch(Mock(), Mock(), payload.encode()))
    try:
        # A serial implementation cannot start page two while page one is held.
        await asyncio.wait_for(started[1].wait(), 2)
        assert active == 2
        assert not started[2].is_set()
        release[1].set()
        await asyncio.wait_for(started[2].wait(), 2)
        for event in release:
            event.set()
        results = await asyncio.wait_for(task, 2)
        assert [result.source_app for result in results] == list(map(str, range(8)))
        assert peak == 2
        assert active == 0
    finally:
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)


@pytest.mark.parametrize("failure", [False, True], ids=["disconnect", "rejected-page"])
async def test_ob154_batch_cleans_up_inflight_reads(monkeypatch, failure):
    started = [asyncio.Event(), asyncio.Event()]
    trigger = asyncio.Event()
    cleaned = []

    async def read(mapper, document, data):
        index = int(data)
        started[index].set()
        try:
            if index == 0 and failure:
                await trigger.wait()
                raise ImportRejected(422, "PHOTO_READ_FAILED")
            await asyncio.Future()
        finally:
            cleaned.append(index)

    monkeypatch.setattr("app.screen_photos.read_photo", read)
    payload = json.dumps({"photos": [base64.b64encode(str(i).encode()).decode() for i in range(2)]})
    task = asyncio.create_task(read_batch(Mock(), Mock(), payload.encode()))
    try:
        await asyncio.wait_for(started[1].wait(), 2)
        if failure:
            trigger.set()
            with pytest.raises(ImportRejected, match="PHOTO_READ_FAILED"):
                await asyncio.wait_for(task, 2)
        else:
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task
        assert sorted(cleaned) == [0, 1]
    finally:
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)


@pytest.mark.parametrize("case,kind", [("excel", "menu"), ("tally", "sales")])
def test_ob154_photo_columns_need_no_second_ai_call(app, monkeypatch, case, kind):  # noqa: F811
    map_fields = AsyncMock(side_effect=AssertionError("Canonical photo columns need no AI mapping"))
    monkeypatch.setattr("app.connector_routes.ai_map_fields", map_fields)
    analysis_log = Mock()
    monkeypatch.setattr("app.connector_routes.log", analysis_log)
    with TestClient(app) as client:
        join(client)
        bid = make_shop(client, currency="INR")
        photo = base64.b64encode((GOLDENS / case / "photo.png").read_bytes()).decode()
        response = client.post(
            f"/api/v1/businesses/{bid}/connect/analyze",
            content=json.dumps({"photos": [photo]}),
            headers={"content-type": PHOTO_TYPE},
        )
        assert response.status_code == 200, response.text
        result = response.json()
        assert result["mapping"]["kind"] == kind
        assert result["preview_rows"][0]["name"]
        assert len(result["cell_flags"]) == (1 if case == "excel" else 0)
        map_fields.assert_not_awaited()
        analysis_log.info.assert_called_once()
        args, timings = analysis_log.info.call_args
        assert args == ("menu_photo_analysis_ms",)
        assert timings["photos"] == 1
        assert timings["bytes_in"] > 0
        assert all(
            isinstance(timings[key], int) and timings[key] >= 0
            for key in ("receive", "read", "mapping", "total")
        )
        assert (
            abs(timings["total"] - sum(timings[key] for key in ("receive", "read", "mapping"))) <= 2
        )
        print(f"OB-154 local fixture {case}: {timings}")
        if kind == "sales":
            return
        synced = client.post(
            f"/api/v1/businesses/{bid}/connect/sync",
            json={
                "content": result["photo_content"],
                "content_type": "application/json",
                "mapping": result["mapping"],
            },
        )
        assert synced.status_code == 200, synced.text
        assert client.get(f"/api/v1/businesses/{bid}/inventory").json() == []
        proposal = synced.json()["proposal"]
        save_log = Mock()
        monkeypatch.setattr("app.merchant_routes.log", save_log)
        saved = client.post(
            f"/api/v1/proposals/{proposal['id']}/approve", json={"digest": proposal["digest"]}
        )
        assert saved.status_code == 200, saved.text
        save_log.info.assert_called_once()
        args, timings = save_log.info.call_args
        assert args == ("proposal_save_ms",)
        assert isinstance(timings["save"], int) and timings["save"] >= 0
        print(f"OB-154 local fixture save: {timings}")
        assert [
            item["name"] for item in client.get(f"/api/v1/businesses/{bid}/inventory").json()
        ] == ["Masala Dosa"]
        client.cookies.clear()
        join(client)
        assert client.post(
            f"/api/v1/proposals/{proposal['id']}/approve", json={"digest": proposal["digest"]}
        ).status_code in (403, 404)
