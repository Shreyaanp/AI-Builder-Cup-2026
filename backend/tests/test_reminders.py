import asyncio
import json
import struct
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock

import httpx
import pytest
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi.testclient import TestClient
from google.adk.sessions import InMemorySessionService

from app import reminders, web_push
from app.main import create_app
from app.merchant import BusinessFields, MerchantStore, ProductFields, ProposalRequest
from app.settings import Settings
from tests.test_photos import join


@pytest.fixture
def push_settings(tmp_path: Path) -> Settings:
    # Ephemeral fixture material only: never read environment files or real signing keys.
    key = ec.generate_private_key(ec.SECP256R1())
    return Settings(
        _env_file=None,
        app_env="test",
        v1_enabled=True,
        rate_limits_enabled=False,
        merchant_database=str(tmp_path / "merchant.sqlite3"),
        recall_path=str(tmp_path / "recall"),
        web_push_enabled=True,
        web_push_public_key=web_push.encode(web_push.public_bytes(key.public_key())),
        web_push_private_key=web_push.encode(key.private_numbers().private_value.to_bytes(32)),
        web_push_subject="mailto:fixture@example.invalid",
        reminders_caller="scheduler@example.invalid",
        reminders_audience="https://app.example.invalid",
    )


def valid_body(bid: str, locale: str = "en") -> dict[str, Any]:
    peer = ec.generate_private_key(ec.SECP256R1())
    return {
        "business_id": bid,
        "locale": locale,
        "subscription": {
            "endpoint": "https://fcm.googleapis.com/fcm/send/fixture-only",
            "expirationTime": None,
            "keys": {
                "p256dh": web_push.encode(web_push.public_bytes(peer.public_key())),
                "auth": web_push.encode(b"0123456789abcdef"),
            },
        },
    }


def seed(repository: Any, uid: str = "owner", stock: int | None = 2) -> str:
    proposal = repository.propose(
        uid,
        ProposalRequest(
            kind="business",
            business=BusinessFields(name="Tea", timezone="Asia/Kolkata", hours="09:00-18:00"),
        ),
    )
    bid = repository.commit(uid, proposal["id"], proposal["digest"])["business_id"]
    if stock is not None:
        p = repository.propose(
            uid,
            ProposalRequest(
                kind="inventory",
                business_id=bid,
                revision=1,
                products=[ProductFields(name="Tea", price=100, unit="cup", stock=stock)],
            ),
        )
        repository.commit(uid, p["id"], p["digest"])
    return str(bid)


@pytest.mark.parametrize(
    "local,expected",
    [
        ("2026-10-12T03:29:00+00:00", None),
        ("2026-10-12T03:30:00+00:00", ("morning", "2026-10-12")),
        ("2026-10-12T03:44:59+00:00", ("morning", "2026-10-12")),
        ("2026-10-12T03:45:00+00:00", None),
        ("2026-10-12T12:30:00+00:00", ("evening", "2026-10-12")),
    ],
)
def test_shop_timezone_and_scheduler_window(local: str, expected: Any) -> None:
    assert (
        reminders.due(
            {"timezone": "Asia/Kolkata", "hours": "09:00-18:00"}, datetime.fromisoformat(local)
        )
        == expected
    )


def test_weekly_closed_overnight_unknown_and_dst() -> None:
    assert (
        reminders.due({"timezone": "invalid-zone", "hours": "09:00-18:00"}, datetime.now(UTC))
        is None
    )
    fields = {
        "timezone": "UTC",
        "weekly_hours": [
            {"day": "mon", "open": "22:00", "close": "02:00", "closed": False},
            {"day": "tue", "open": None, "close": None, "closed": True},
        ],
    }
    assert reminders.due(fields, datetime(2026, 10, 12, 22, tzinfo=UTC)) == (
        "morning",
        "2026-10-12",
    )
    assert reminders.due(fields, datetime(2026, 10, 13, 2, tzinfo=UTC)) == ("evening", "2026-10-13")
    assert reminders.due(fields, datetime(2026, 10, 13, 22, tzinfo=UTC)) is None
    assert reminders.due({"hours": "Ask us"}, datetime.now(UTC)) is None
    assert (
        reminders.due(
            {"timezone": "UTC", "hours": "09:00-18:00", "closed_on": "2026-10-12"},
            datetime(2026, 10, 12, 9, tzinfo=UTC),
        )
        is None
    )
    assert reminders.due(
        {"timezone": "America/New_York", "hours": "09:00-18:00"},
        datetime(2026, 11, 1, 14, tzinfo=UTC),
    ) == ("morning", "2026-11-01")


@pytest.mark.parametrize(
    "endpoint",
    [
        "http://fcm.googleapis.com/a",
        "https://127.0.0.1/a",
        "https://fcm.googleapis.com.evil.invalid/a",
        "https://fcm.googleapis.com:8443/a",
        "https://user@fcm.googleapis.com/a",
        "https://web.push.apple.com/a#b",
    ],
)
def test_no_ssrf(endpoint: str) -> None:
    assert not web_push.valid_endpoint(endpoint)


def test_encryption_roundtrip() -> None:
    peer = ec.generate_private_key(ec.SECP256R1())
    public = web_push.public_bytes(peer.public_key())
    auth = b"0123456789abcdef"
    payload = {
        "title": "\u0926\u093f\u0928 \u092a\u0942\u0930\u093e \u0915\u0930\u0947\u0902",
        "kind": "evening",
    }
    encrypted = web_push.encrypt(payload, public, auth)
    salt, record_size, key_size = encrypted[:16], *struct.unpack("!IB", encrypted[16:21])
    assert record_size == 4096 and key_size == 65
    server = encrypted[21:86]
    shared = peer.exchange(
        ec.ECDH(), ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), server)
    )
    ikm = web_push.derive(shared, auth, b"WebPush: info\x00" + public + server, 32)
    cek = web_push.derive(ikm, salt, b"Content-Encoding: aes128gcm\x00", 16)
    nonce = web_push.derive(ikm, salt, b"Content-Encoding: nonce\x00", 12)
    decoded = AESGCM(cek).decrypt(nonce, encrypted[86:], None)
    assert decoded[-1] == 2 and json.loads(decoded[:-1]) == payload


async def test_vapid_request_without_network(push_settings: Settings, monkeypatch: Any) -> None:
    real_client = httpx.AsyncClient

    def transport(request: httpx.Request) -> httpx.Response:
        assert request.headers["content-encoding"] == "aes128gcm"
        assert request.headers["ttl"] == "900"
        token = request.headers["authorization"].split("t=", 1)[1].split(",")[0]
        head, claims, signature = token.split(".")
        data = json.loads(web_push.decode(claims))
        assert data["aud"] == "https://fcm.googleapis.com"
        assert data["sub"] == push_settings.web_push_subject
        raw = web_push.decode(signature)
        der = encode_dss_signature(int.from_bytes(raw[:32]), int.from_bytes(raw[32:]))
        key = ec.EllipticCurvePublicKey.from_encoded_point(
            ec.SECP256R1(), web_push.decode(push_settings.web_push_public_key)
        )
        key.verify(der, (head + "." + claims).encode(), ec.ECDSA(hashes.SHA256()))
        return httpx.Response(201)

    monkeypatch.setattr(
        web_push.httpx,
        "AsyncClient",
        lambda **kwargs: real_client(**kwargs, transport=httpx.MockTransport(transport)),
    )
    assert (
        await web_push.send(push_settings, valid_body("shop")["subscription"], {"kind": "evening"})
        == 201
    )


def test_routes_disabled_isolation_unsubscribe_erasure(push_settings: Settings) -> None:
    app = create_app(push_settings, InMemorySessionService())
    with TestClient(app) as client:
        assert client.get("/api/v1/reminders").status_code == 401
        join(client)
        proposal = client.post(
            "/api/v1/proposals", json={"kind": "business", "business": {"name": "Tea"}}
        ).json()
        bid = client.post(
            f"/api/v1/proposals/{proposal['id']}/approve", json={"digest": proposal["digest"]}
        ).json()["business_id"]
        value = valid_body(bid)
        assert client.put("/api/v1/reminders", json=value).status_code == 200
        sid = reminders.subscription_id(value["subscription"]["endpoint"])
        assert client.get("/api/v1/reminders").json()["subscriptions"] == [sid]
        cookies = dict(client.cookies)
        client.cookies.clear()
        join(client)
        assert client.get("/api/v1/reminders").json()["subscriptions"] == []
        assert client.put("/api/v1/reminders", json=value).status_code == 404
        assert client.delete("/api/v1/reminders/" + sid).status_code == 200
        client.cookies.clear()
        client.cookies.update(cookies)
        assert client.get("/api/v1/reminders").json()["subscriptions"] == [sid]
        assert client.delete("/api/v1/reminders/" + sid).status_code == 200
        assert client.get("/api/v1/reminders").json()["subscriptions"] == []
        assert client.put("/api/v1/reminders", json=value).status_code == 200
        push_settings.web_push_enabled = False
        assert client.get("/api/v1/reminders").json()["enabled"] is False
        assert client.put("/api/v1/reminders", json=value).status_code == 503
        assert client.post("/api/v1/internal/reminders/send").status_code == 404
        assert client.delete("/api/v1/me/data").status_code == 200
        assert client.get("/api/v1/reminders").json()["subscriptions"] == []


async def test_dispatch_dedup_retry_expiry_and_hindi(
    push_settings: Settings, monkeypatch: Any
) -> None:
    repository = MerchantStore(push_settings.merchant_database)
    bid = seed(repository)
    value = reminders.ReminderInput.model_validate(valid_body(bid, "hi"))
    reminders.save(repository.feature_docs, "owner", value)
    sender = AsyncMock(return_value=503)
    monkeypatch.setattr(web_push, "send", sender)
    now = datetime(2026, 10, 12, 3, 30, tzinfo=UTC)
    assert (await reminders.dispatch(repository, push_settings, now)).failed == 1
    sender.return_value = 201
    results = await asyncio.gather(
        *[reminders.dispatch(repository, push_settings, now) for _ in range(3)]
    )
    assert sum(r.sent for r in results) == 1
    assert "\u0915\u093e\u092e\u094b\u0902" in sender.call_args.args[2]["title"]
    assert (await reminders.dispatch(repository, push_settings, now)).sent == 0
    sender.return_value = 410
    evening = datetime(2026, 10, 12, 12, 30, tzinfo=UTC)
    assert (await reminders.dispatch(repository, push_settings, evening)).expired == 1
    assert not repository.feature_docs.get(reminders.KIND, "owner")["entries"]


def test_atomic_lease_and_no_resurrection(push_settings: Settings) -> None:
    repository = MerchantStore(push_settings.merchant_database)
    bid = seed(repository)
    value = reminders.ReminderInput.model_validate(valid_body(bid))
    docs = repository.feature_docs
    reminders.save(docs, "owner", value)
    sid = reminders.subscription_id(value.subscription.endpoint)
    with ThreadPoolExecutor(max_workers=4) as pool:
        claimed = list(
            pool.map(
                lambda _: reminders.claim(docs, "owner", sid, "morning", "2026-10-12", 1000),
                range(8),
            )
        )
    assert sum(claimed) == 1
    assert reminders.claim(docs, "owner", sid, "morning", "2026-10-12", 1121)
    reminders.remove(docs, "owner", sid)
    reminders.finish(docs, "owner", sid, "morning", "2026-10-12", True)
    assert not docs.get(reminders.KIND, "owner")["entries"]


def test_scheduler_auth_and_missing_keys(push_settings: Settings, monkeypatch: Any) -> None:
    app = create_app(push_settings, InMemorySessionService())
    with TestClient(app) as client:
        assert client.post("/api/v1/internal/reminders/send").status_code == 401
        from google.oauth2 import id_token

        monkeypatch.setattr(
            id_token,
            "verify_oauth2_token",
            lambda *a, **kw: {"email": "other", "email_verified": True},
        )
        assert (
            client.post(
                "/api/v1/internal/reminders/send", headers={"authorization": "Bearer fixture"}
            ).status_code
            == 403
        )
        monkeypatch.setattr(
            id_token,
            "verify_oauth2_token",
            lambda *a, **kw: {"email": push_settings.reminders_caller, "email_verified": True},
        )
        assert (
            client.post(
                "/api/v1/internal/reminders/send", headers={"authorization": "Bearer fixture"}
            ).json()["sent"]
            == 0
        )
        push_settings.web_push_public_key = ""
        assert client.post("/api/v1/internal/reminders/send").status_code == 404


async def test_cancelled_send_releases_work_and_lease_recovers(
    push_settings: Settings, monkeypatch: Any
) -> None:
    repository = MerchantStore(push_settings.merchant_database)
    bid = seed(repository)
    value = reminders.ReminderInput.model_validate(valid_body(bid))
    docs = repository.feature_docs
    reminders.save(docs, "owner", value)
    sid = reminders.subscription_id(value.subscription.endpoint)
    sender = AsyncMock(side_effect=asyncio.CancelledError)
    monkeypatch.setattr(web_push, "send", sender)
    now = datetime(2026, 10, 12, 3, 30, tzinfo=UTC)
    with pytest.raises(asyncio.CancelledError):
        await reminders.dispatch(repository, push_settings, now)
    # No detached producer survives the caller. A new scheduler invocation can reclaim.
    assert not reminders.claim(docs, "owner", sid, "morning", "2026-10-12", now.timestamp() + 60)
    assert reminders.claim(docs, "owner", sid, "morning", "2026-10-12", now.timestamp() + 121)


async def test_no_work_no_morning_push(push_settings: Settings, monkeypatch: Any) -> None:
    repository = MerchantStore(push_settings.merchant_database)
    bid = seed(repository, stock=None)
    reminders.save(
        repository.feature_docs, "owner", reminders.ReminderInput.model_validate(valid_body(bid))
    )
    sender = AsyncMock(return_value=201)
    monkeypatch.setattr(web_push, "send", sender)
    assert (
        await reminders.dispatch(
            repository, push_settings, datetime(2026, 10, 12, 3, 30, tzinfo=UTC)
        )
    ).sent == 0
    sender.assert_not_called()
