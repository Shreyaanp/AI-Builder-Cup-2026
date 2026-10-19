"""Optional duplicate-owner check end to end: capture → verified / in review → badge → erase."""

from pathlib import Path
from typing import Any

import httpx
import numpy as np
import pytest
import structlog.testing
from cryptography.exceptions import InvalidTag
from fastapi.testclient import TestClient
from google.adk.sessions import InMemorySessionService

from app import trust
from app.main import create_app
from app.settings import Settings
from tests.test_photos import join

VIDEO = b"\x1a\x45\xdf\xa3" + b"\x00" * 4096


def settings(tmp_path: Path, **overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "app_env": "test",
        "v1_enabled": True,
        "merchant_database": str(tmp_path / "merchant.sqlite3"),
        "recall_path": str(tmp_path / "recall"),
        "face_mode": "fixture",
        "trust_admins": ["*"],
        "_env_file": None,
    }
    return Settings(**{**values, **overrides})


def new_owner(client: TestClient, name: str, phone: str = "", products=None) -> str:
    """A fresh local owner with one shared shop; returns the shop ID."""
    client.cookies.clear()
    join(client)
    prepared = client.post(
        "/api/v1/proposals",
        json={
            "kind": "business",
            "revision": 0,
            "geocode_confirmed": True,
            "business": {
                "name": name,
                "category": "Cafe",
                "location": "Indiranagar, Bengaluru",
                "currency": "INR",
                "phone": phone,
            },
            "products": products or [{"name": "Masala chai", "price": 2000, "unit": "cup"}],
        },
    ).json()
    bid = client.post(
        f"/api/v1/proposals/{prepared['id']}/approve", json={"digest": prepared["digest"]}
    ).json()["business_id"]
    assert client.post(f"/api/v1/businesses/{bid}/share", json={"public": True}).status_code == 200
    return bid


def check(client: TestClient, bid: str, face: str | None = None) -> dict[str, Any]:
    started = client.post("/api/v1/face/challenges", json={"business_id": bid, "consent": True})
    assert started.status_code == 200, started.text
    headers = {"content-type": "video/webm", **({"x-face-fixture": face} if face else {})}
    response = client.post(
        f"/api/v1/face/challenges/{started.json()['id']}/capture", content=VIDEO, headers=headers
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_template_vault_binds_each_template_to_its_owner(tmp_path: Path):
    vault = trust.TemplateVault(settings(tmp_path, face_template_key="k" * 32))
    vector = trust.fixture_template("alice")
    sealed = vault.seal("owner-a", vector)
    assert "0." not in sealed  # Ciphertext only, never the numbers.
    assert np.allclose(vault.open("owner-a", sealed), vector)
    with pytest.raises(InvalidTag):
        vault.open("owner-b", sealed)  # Moved to another owner, it no longer decrypts.


def test_same_face_on_another_account_opens_a_review_not_an_accusation(tmp_path: Path):
    with TestClient(create_app(settings(tmp_path), InMemorySessionService())) as client:
        first = new_owner(client, "Courtyard Chai")
        assert check(client, first, "alice")["result"] == "verified"
        mine = client.get("/api/v1/trust").json()
        assert mine["face"] == "verified" and mine["notices"] == []
        assert client.get(f"/api/v1/public/shops/{first}").json()["verified_owner"]["checked"]

        second = new_owner(client, "Corner Chai")
        answer = check(client, second, "alice")
        assert answer["result"] == "in_review" and answer["reason"] == "ok"
        status = client.get("/api/v1/trust").json()
        assert status["face"] == "in_review"
        assert status["notices"] == [{"id": status["notices"][0]["id"], "kind": "duplicate_owner"}]
        # No badge while a person looks; the shop itself stays exactly as it was.
        public = client.get(f"/api/v1/public/shops/{second}").json()
        assert "verified_owner" not in public and public["name"] == "Corner Chai"
        review = next(item for item in status["queue"] if item["kind"] == "duplicate_owner")
        assert review["shops"] == [["Corner Chai"], ["Courtyard Chai"]]
        assert review["similarity"] >= trust.DUPLICATE_SIMILARITY
        assert "uid" not in str(review) and "owners" not in review

        # A person decides: different people (say, a family business). Badge follows.
        decided = client.post(f"/api/v1/trust/reviews/{review['id']}", json={"decision": "cleared"})
        assert decided.json()["status"] == "cleared"
        assert client.get("/api/v1/trust").json()["face"] == "verified"
        assert client.get(f"/api/v1/public/shops/{second}").json()["verified_owner"]
        # A later check of the same pair keeps that decision.
        assert check(client, second, "alice")["result"] == "verified"


def test_a_different_face_is_verified_and_the_first_owner_is_never_told(tmp_path: Path):
    with TestClient(create_app(settings(tmp_path), InMemorySessionService())) as client:
        first = new_owner(client, "Courtyard Chai")
        check(client, first, "alice")
        first_cookies = dict(client.cookies)
        second = new_owner(client, "Corner Chai")
        assert check(client, second, "bob")["result"] == "verified"
        check(client, second, "alice")  # Now matches the first owner.
        client.cookies.clear()
        client.cookies.update(first_cookies)
        assert client.get("/api/v1/trust").json()["notices"] == []


def test_erase_removes_template_status_reviews_and_badge(tmp_path: Path):
    with TestClient(create_app(settings(tmp_path), InMemorySessionService())) as client:
        first = new_owner(client, "Courtyard Chai")
        check(client, first, "alice")
        second = new_owner(client, "Corner Chai")
        check(client, second, "alice")
        assert client.delete("/api/v1/face/template").json() == {"status": "deleted"}
        status = client.get("/api/v1/trust").json()
        assert status["face"] == "not_started" and status["notices"] == []
        assert not [item for item in status["queue"] if item["kind"] == "duplicate_owner"]
        store = client.app.state.community.docs  # type: ignore[attr-defined]
        assert len(store.scoped(trust.TEMPLATE_KIND, trust.GALLERY)) == 1
        # "Delete all my data" erases face data the same way (first owner, via the erase step).
        client.cookies.clear()
        join(client)
        assert client.delete("/api/v1/me/data").json()["status"] == "erased"


def test_ob26_74_stored_face_record_is_the_embedding_only_and_erasure_deletes_it(tmp_path: Path):
    with TestClient(create_app(settings(tmp_path), InMemorySessionService())) as client:
        bid = new_owner(client, "Courtyard Chai")
        assert check(client, bid, "alice")["result"] == "verified"
        store = client.app.state.community.docs  # type: ignore[attr-defined]
        records = store.scoped(trust.TEMPLATE_KIND, trust.GALLERY)
        assert len(records) == 1
        # An encrypted vector plus the minimum metadata: no frame, image, video or base64 payload.
        assert set(records[0]) >= {"uid", "sealed", "created", "version"}
        assert not {"frames", "image", "video", "capture", "data"} & set(records[0])
        assert len(str(records[0])) < 2000
        assert client.delete("/api/v1/face/template").json() == {"status": "deleted"}
        assert store.scoped(trust.TEMPLATE_KIND, trust.GALLERY) == []


def test_worker_capture_reaches_the_private_worker_and_never_returns_the_template(
    tmp_path: Path, monkeypatch
):
    """Regression: a bytearray body made httpx's AsyncClient fail every capture with a 500."""
    seen: list[httpx.Request] = []

    def worker(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        template = trust.fixture_template("worker-face").tolist()
        return httpx.Response(
            200, json={"status": "live", "reason": "ok", "liveness": "passed", "template": template}
        )

    real = httpx.AsyncClient

    def with_worker(*args, **kwargs):
        return real(*args, **{**kwargs, "transport": httpx.MockTransport(worker)})

    monkeypatch.setattr(trust.httpx, "AsyncClient", with_worker)
    config = settings(tmp_path, face_mode="worker", face_worker_token="fixture-only")
    with TestClient(create_app(config, InMemorySessionService())) as client:
        bid = new_owner(client, "Courtyard Chai")
        answer = check(client, bid)
        assert answer["result"] == "verified"
        assert "template" not in str(answer)
        assert seen[0].content == VIDEO
        assert seen[0].headers["authorization"] == "Bearer fixture-only"
        assert set(seen[0].headers["x-prompts"].split(",")) <= {
            "turn_left",
            "turn_right",
            "look_up",
        }


@pytest.mark.parametrize(
    ("reply", "expected"),
    [
        (
            httpx.Response(200, json={"status": "retry", "reason": "several_faces"}),
            {"result": "retry", "reason": "several_faces"},
        ),
        (httpx.Response(429), {"result": "unavailable", "reason": "busy"}),
        (httpx.Response(500), {"result": "unavailable", "reason": "worker_unavailable"}),
    ],
)
def test_a_capture_that_does_not_work_asks_to_retry_and_changes_nothing(
    tmp_path: Path, monkeypatch, reply, expected
):
    real = httpx.AsyncClient

    def with_worker(*args, **kwargs):
        transport = httpx.MockTransport(lambda request: reply)
        return real(*args, **{**kwargs, "transport": transport})

    monkeypatch.setattr(trust.httpx, "AsyncClient", with_worker)
    config = settings(tmp_path, face_mode="worker", face_worker_token="fixture-only")
    with TestClient(create_app(config, InMemorySessionService())) as client:
        bid = new_owner(client, "Courtyard Chai")
        assert check(client, bid) == expected
        assert client.get("/api/v1/trust").json()["face"] == "not_started"


def test_a_rejected_capture_logs_why_and_the_trace_stays_on_the_server(tmp_path: Path, monkeypatch):
    trace = {
        "container": "webm",
        "codec": "vp8",
        "decoded": 96,
        "sampled": 23,
        "faces": "00000001000000000000000",
        "face_frames": 1,
        "stage": "thresholds",
        "failed": "face_frames 1 < MIN_FRAMES 6",
        "first_request": True,
    }
    reply = {"status": "retry", "reason": "no_face", "liveness": "not_evaluated", "trace": trace}
    real = httpx.AsyncClient

    def with_worker(*args, **kwargs):
        transport = httpx.MockTransport(lambda request: httpx.Response(200, json=reply))
        return real(*args, **{**kwargs, "transport": transport})

    monkeypatch.setattr(trust.httpx, "AsyncClient", with_worker)
    config = settings(tmp_path, face_mode="worker", face_worker_token="fixture-only")
    with TestClient(create_app(config, InMemorySessionService())) as client:
        bid = new_owner(client, "Courtyard Chai")
        with structlog.testing.capture_logs() as logs:
            answer = check(client, bid)
    assert answer == {"result": "retry", "reason": "no_face"}
    line = next(entry for entry in logs if entry["event"] == "face_evaluated")
    assert line["stage"] == "worker_verdict" and line["worker_stage"] == "thresholds"
    assert line["reason"] == "no_face" and line["failed"] == "face_frames 1 < MIN_FRAMES 6"
    assert line["codec"] == "vp8" and line["sampled"] == 23 and line["first_request"] is True
    assert line["capture_bytes"] == len(VIDEO) and line["content_type"] == "video/webm"
    assert line["worker_trace"] is True


def test_without_a_worker_the_check_says_unavailable(tmp_path: Path):
    config = settings(tmp_path, face_mode="worker")
    with TestClient(create_app(config, InMemorySessionService())) as client:
        bid = new_owner(client, "Courtyard Chai")
        assert check(client, bid)["result"] == "unavailable"


def test_reviews_are_for_reviewers_only(tmp_path: Path):
    with TestClient(
        create_app(settings(tmp_path, trust_admins=[]), InMemorySessionService())
    ) as client:
        new_owner(client, "Courtyard Chai")
        status = client.get("/api/v1/trust").json()
        assert status["reviewer"] is False and "queue" not in status
        assert client.post("/api/v1/trust/scan").status_code == 403
        denied = client.post("/api/v1/trust/reviews/listing:x", json={"decision": "cleared"})
        assert denied.status_code == 403


def test_production_refuses_the_fixture_and_open_reviews(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("FIRESTORE_EMULATOR_HOST", raising=False)
    monkeypatch.delenv("FIREBASE_AUTH_EMULATOR_HOST", raising=False)
    production = {
        "app_env": "production",
        "auth_mode": "firebase",
        "session_backend": "firestore",
        "google_cloud_project": "p",
        "firebase_web_api_key": "k",
        "firebase_web_app_id": "a",
        "firebase_auth_domain": "d",
        "allowed_origins": ["https://example.com"],
        "_env_file": None,
    }
    for unsafe in ({"face_mode": "fixture"}, {"trust_admins": ["*"]}):
        with pytest.raises(ValueError, match="face fixture"):
            Settings(**production, **unsafe)


def test_capture_needs_consent_and_an_owned_shop(tmp_path: Path):
    with TestClient(create_app(settings(tmp_path), InMemorySessionService())) as client:
        bid = new_owner(client, "Courtyard Chai")
        refused = client.post(
            "/api/v1/face/challenges", json={"business_id": bid, "consent": False}
        )
        assert refused.status_code == 422
        new_owner(client, "Corner Chai")
        stranger = client.post(
            "/api/v1/face/challenges", json={"business_id": bid, "consent": True}
        )
        assert stranger.status_code == 404


def test_an_unsure_liveness_score_goes_to_a_person_not_back_to_retry(tmp_path: Path, monkeypatch):
    """Sev 1, 17 Oct: a live owner in a dim room scored 0.092 and was told to try again."""
    verdict = {"status": "review", "reason": "liveness_unsure", "liveness": "unsure"}

    def worker(request: httpx.Request) -> httpx.Response:
        template = trust.fixture_template("dim-room").tolist()
        return httpx.Response(
            200,
            json={
                **verdict,
                "score": 0.092,
                "template": template,
                "passed_prompts": ["turn_left", "look_up"],
            },
        )

    real = httpx.AsyncClient

    def with_worker(*args, **kwargs):
        return real(*args, **{**kwargs, "transport": httpx.MockTransport(worker)})

    monkeypatch.setattr(trust.httpx, "AsyncClient", with_worker)
    config = settings(tmp_path, face_mode="worker", face_worker_token="fixture-only")
    with TestClient(create_app(config, InMemorySessionService())) as client:
        bid = new_owner(client, "Courtyard Chai")
        answer = check(client, bid)
        assert answer["result"] == "in_review" and answer["reason"] == "liveness_unsure"
        assert "template" not in str(answer)
        status = client.get("/api/v1/trust").json()
        assert status["face"] == "in_review" and status["review"] == "liveness"
        assert "verified_owner" not in client.get(f"/api/v1/public/shops/{bid}").json()
        review = next(item for item in status["queue"] if item["kind"] == "liveness")
        assert review["score"] == 0.092 and review["shops"] == [["Courtyard Chai"]]
        assert "owners" not in review

        # A clear pass later resolves the review; another unsure capture opens it again.
        verdict.update(status="live", reason="ok", liveness="passed")
        assert check(client, bid)["result"] == "verified"
        status = client.get("/api/v1/trust").json()
        assert next(i for i in status["queue"] if i["kind"] == "liveness")["status"] == "resolved"
        verdict.update(status="review", reason="liveness_unsure", liveness="unsure")
        assert check(client, bid)["result"] == "in_review"

        decided = client.post(f"/api/v1/trust/reviews/{review['id']}", json={"decision": "cleared"})
        assert decided.json()["status"] == "cleared"
        status = client.get("/api/v1/trust").json()
        assert status["face"] == "verified" and "review" not in status
        assert client.get(f"/api/v1/public/shops/{bid}").json()["verified_owner"]
        # A person already said this owner is live: the next unsure capture is verified.
        assert check(client, bid)["result"] == "verified"
