import numpy as np
import pytest
from fastapi import Request
from fastapi.testclient import TestClient
from starlette.requests import ClientDisconnect

import face_worker


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("FACE_WORKER_TOKEN", "fixture-only")
    monkeypatch.delenv("FACE_REQUIRE_MODELS", raising=False)

    class FixtureModels:
        def __init__(self, directory):
            pass

        def analyze(self, capture, prompts):
            assert prompts == ["turn_left"]
            if capture == b"offline-capture":
                return {"status": "live", "reason": "ok", "liveness": "passed"}, (
                    face_worker.template(np.ones(256))
                )
            raise face_worker.CaptureRejected("several_faces")

    monkeypatch.setattr(face_worker, "CpuModels", FixtureModels)
    with TestClient(face_worker.app) as test_client:
        yield test_client


def headers(owner="owner-a"):
    return {
        "Authorization": "Bearer fixture-only",
        "X-Owner": owner,
        "X-Prompts": "turn_left",
    }


def test_authentication_and_owner_scope(client):
    assert client.post("/evaluate", content=b"offline-capture").status_code == 401
    assert client.delete("/template").status_code == 401
    assert (
        client.delete("/template", headers={"Authorization": "Bearer fixture-only"}).status_code
        == 400
    )


def test_evaluate_returns_a_template_only_for_a_live_capture_and_stores_nothing(client):
    assert client.get("/health", headers=headers()).json() == {
        "models_ready": True,
        "model": face_worker.MODEL_ID,
        "stores_templates": False,
    }
    live = client.post("/evaluate", headers=headers(), content=b"offline-capture").json()
    assert live["status"] == "live" and live["liveness"] == "passed"
    assert len(live["template"]) == 256
    assert abs(float(np.linalg.norm(live["template"])) - 1) < 1e-5
    # A rejected capture says why (the app shows a tip) and carries no template.
    rejected = client.post("/evaluate", headers=headers(), content=b"two-people").json()
    assert rejected == {"status": "retry", "reason": "several_faces", "liveness": "not_evaluated"}
    # Kept for older app revisions: nothing is stored, so deletion is a confirmation.
    assert client.delete("/template", headers=headers()).json() == {"status": "deleted"}


def test_movement_needs_each_prompt_in_order_and_opposite_turns():
    left_then_right = [(0.0, 0.0), (22.0, 0.0), (0.0, 0.0), (-20.0, 0.0)]
    assert face_worker.movement_seen(["turn_left", "turn_right"], left_then_right)
    # Two turns to the same side are not a left-then-right challenge.
    assert not face_worker.movement_seen(
        ["turn_left", "turn_right"], [(22.0, 0.0), (0.0, 0.0), (25.0, 0.0)]
    )
    assert face_worker.movement_seen(["turn_left", "look_up"], [(18.0, 0.0), (0.0, -14.0)])
    # Order matters: looking up first does not satisfy a turn-then-look-up challenge.
    assert not face_worker.movement_seen(["turn_left", "look_up"], [(0.0, -14.0), (18.0, 0.0)])
    assert not face_worker.movement_seen(["look_up"], [(3.0, 2.0)] * 8)


def test_capture_limit(client):
    assert (
        client.post(
            "/evaluate", headers=headers(), content=b"x" * (face_worker.MAX_BYTES + 1)
        ).status_code
        == 413
    )


@pytest.mark.asyncio
async def test_disconnect_releases_worker_lock(client):
    events = iter(
        [
            {"type": "http.request", "body": b"partial", "more_body": True},
            {"type": "http.disconnect"},
        ]
    )

    async def receive():
        return next(events)

    request = Request(
        {
            "type": "http",
            "app": face_worker.app,
            "headers": [(key.lower().encode(), value.encode()) for key, value in headers().items()],
        },
        receive,
    )
    with pytest.raises(ClientDisconnect):
        await face_worker.evaluate(request)
    assert not face_worker.app.state.busy.locked()


def test_required_models_fail_startup(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("FACE_REQUIRE_MODELS", "true")

    def missing(directory):
        raise OSError("offline missing model")

    monkeypatch.setattr(face_worker, "CpuModels", missing)
    with pytest.raises(RuntimeError, match="Required face models"):
        with TestClient(face_worker.app):
            pass


def test_realistic_phone_angles_and_prompt_tracking():
    # 12 degrees yaw and 8 degrees pitch are accepted (relaxed phone angles)
    ok, passed, failed = face_worker.movement_evaluation(
        ["turn_left", "turn_right"], [(12.0, 0.0), (0.0, 0.0), (-11.0, 0.0)]
    )
    assert ok is True
    assert passed == ["turn_left", "turn_right"]
    assert failed is None

    # Partial pass: turn_left passed, look_up not reached
    ok, passed, failed = face_worker.movement_evaluation(
        ["turn_left", "look_up"], [(12.0, 0.0), (0.0, 0.0)]
    )
    assert ok is False
    assert passed == ["turn_left"]
    assert failed == "look_up"

    # Head turned up past 7 degrees
    ok, passed, failed = face_worker.movement_evaluation(["look_up"], [(0.0, -8.0)])
    assert ok is True
    assert passed == ["look_up"]


def test_evaluate_handles_json_sampled_frames(client):
    import json

    payload = json.dumps(
        {
            "frames": [
                {"timestamp": 0.0, "data": "base64mock"},
                {"timestamp": 0.5, "data": "base64mock"},
            ]
        }
    ).encode()
    # Offline fixture returns rejected several_faces for unknown capture
    res = client.post("/evaluate", headers=headers(), content=payload).json()
    assert res["status"] == "retry"
    assert res["reason"] == "several_faces"
