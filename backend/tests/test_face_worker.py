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
            assert capture == b"offline-capture"
            assert prompts == ["turn_left"]
            return {
                "status": "review_pending",
                "reason": "calibration_required",
                "liveness": "scored_uncalibrated",
            }, face_worker.FaceGallery.vector(np.ones(256))

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


def test_evaluate_enroll_owner_isolation_and_delete(client):
    def evaluate(owner):
        response = client.post("/evaluate", headers=headers(owner), content=b"offline-capture")
        assert response.status_code == 200
        return response.json()

    assert client.get("/health", headers=headers()).json()["models_ready"] is True
    assert evaluate("owner-a")["one_to_one"] == "no_reference"
    assert evaluate("owner-b")["one_to_one"] == "no_reference"
    assert evaluate("owner-a")["one_to_one"] == "scored_uncalibrated"
    assert client.delete("/template", headers=headers()).json() == {"status": "deleted"}
    assert evaluate("owner-a")["one_to_one"] == "no_reference"


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
