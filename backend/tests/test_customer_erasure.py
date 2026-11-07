"""OB-96 (#396): a customer's "Delete my data" erases everything kept for them, and only that."""

import time

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import erasure
from app.auth import CUSTOMER_COOKIE
from tests.test_community import DEMO, app, client, sign_in  # noqa: F401 - shared fixtures
from tests.test_passport import at_shop, demo_key

KINDS = ("profile", "threadslots", "tipped", "passport", "guest_identity")


def uid_of(who: TestClient) -> str:
    signer = who.app.state.services.identity.customer_signer()
    return str(signer.loads(who.cookies.get(CUSTOMER_COOKIE))[0])


def stored(who: TestClient, uid: str) -> list[str]:
    docs = who.app.state.community.docs
    return [kind for kind in KINDS if docs.get(kind, uid) is not None]


def inbox(who: TestClient) -> list[str]:
    return [i.name for i in who.app.state.merchant.inquiries("demo-owner", DEMO)]


def busy_customer(who: TestClient, name: str) -> None:
    """Chats, follows, preferences, a tip and a passport stamp."""
    sign_in(who, name)
    assert who.put(f"/api/v1/customer/follows/{DEMO}").is_success
    assert who.put("/api/v1/customer/preferences", json={"vegetarian": True}).is_success
    started = who.post(f"/api/v1/customer/shops/{DEMO}/threads", json={"text": "Open today?"})
    assert started.is_success, started.text
    tip = who.post(
        f"/api/v1/customer/shops/{DEMO}/tips", json={"text": f"{name} likes the sourdough"}
    )
    assert tip.is_success, tip.text
    stamp = who.post(
        "/api/v1/customer/passport/stamps",
        json={"shop_id": DEMO, "key": demo_key(who), **at_shop(who)},
    )
    assert stamp.is_success, stamp.text


def test_ob96_delete_my_data_erases_every_kind_and_only_mine(app) -> None:  # noqa: F811
    with TestClient(app) as zoya:
        from scripts.seed_demo_shops import seed

        seed(zoya.app.state.merchant, "demo-owner", city="singapore")
        zoya.app.state.demo_reply_delay = 60
        bob = TestClient(app)  # Same running app, separate browser cookies.
        busy_customer(bob, "Bob")
        busy_customer(zoya, "Zoya")
        mine, theirs = uid_of(zoya), uid_of(bob)
        assert set(stored(zoya, mine)) >= {"profile", "threadslots", "tipped", "passport"}
        assert {"Zoya", "Bob"} <= set(inbox(zoya))

        body = zoya.delete("/api/v1/customer/data").json()

        assert body == {
            "status": "erased",
            "erased": list(erasure.CUSTOMER_STEPS),
            "pending": [],
            "chats": 1,
        }
        assert stored(zoya, mine) == []
        # The shop's copy of the chat is gone too; the shop and other customers' chats stay.
        assert "Zoya" not in inbox(zoya) and "Bob" in inbox(zoya)
        tips = [t.text for t in zoya.app.state.community.tips(DEMO)]
        assert not any(t.startswith("Zoya") for t in tips) and "Bob likes the sourdough" in tips
        assert zoya.get("/api/v1/customer/threads").json() == []
        assert zoya.get("/api/v1/customer/passport").json()["total"] == 0
        assert zoya.get("/api/v1/public/shops/" + DEMO).is_success
        # Bob keeps everything.
        assert set(stored(bob, theirs)) >= {"profile", "threadslots", "tipped", "passport"}
        assert bob.get("/api/v1/customer/me").json()["profile"]["follows"] == [DEMO]
        assert len(bob.get("/api/v1/customer/threads").json()) == 1


def test_ob96_a_failing_chat_delete_is_reported_and_try_again_finishes(
    client: TestClient,  # noqa: F811
    monkeypatch,
) -> None:
    busy_customer(client, "Zoya")
    store = client.app.state.merchant
    real = store.thread_action

    def down(uid, bid, iid, token, action, text=""):
        if action == "delete":
            raise RuntimeError("inbox unavailable")
        return real(uid, bid, iid, token, action, text)

    monkeypatch.setattr(store, "thread_action", down)
    body = client.delete("/api/v1/customer/data").json()
    assert body["status"] == "partial" and body["pending"] == ["chats"]
    assert body["erased"] == ["tips", "passport", "profile"]
    assert "Zoya" in inbox(client)
    monkeypatch.setattr(store, "thread_action", real)
    again = client.delete("/api/v1/customer/data").json()
    assert again["status"] == "erased" and again["chats"] == 1
    assert "Zoya" not in inbox(client)
    assert stored(client, uid_of(client)) == []


def test_ob96_delete_my_data_needs_a_customer(client: TestClient) -> None:  # noqa: F811
    assert client.delete("/api/v1/customer/data").status_code == 401


def chat_of(who: TestClient) -> tuple[str, str]:
    entry = who.app.state.community.threads(uid_of(who))[0]
    return entry["bid"], entry["iid"]


def test_ob96_a_chat_still_stored_at_a_sealed_shop_is_never_counted_erased(
    client: TestClient,  # noqa: F811
    monkeypatch,
) -> None:
    """Review HOLD #1 on #580: a sealed (deleting) shop answered 404 and the chat was counted
    erased while the shop still kept it, and the pointer that Try again needs was dropped."""
    busy_customer(client, "Zoya")
    store = client.app.state.merchant
    bid, iid = chat_of(client)
    real = store.thread_action

    def sealed(uid, bid, iid, token, action, text=""):
        # How a sealed shop answered customers before the fix, whatever the chat's state.
        if uid is None:
            raise HTTPException(404, "Conversation not found.")
        return real(uid, bid, iid, token, action, text)

    monkeypatch.setattr(store, "thread_action", sealed)
    body = client.delete("/api/v1/customer/data").json()
    assert body["status"] == "partial" and body["pending"] == ["chats"] and body["chats"] == 0
    assert store.thread_exists(bid, iid)
    assert chat_of(client) == (bid, iid)  # Kept, so Try again can still reach it.
    monkeypatch.setattr(store, "thread_action", real)
    again = client.delete("/api/v1/customer/data").json()
    assert again["status"] == "erased" and again["chats"] == 1
    assert not store.thread_exists(bid, iid)


def test_ob96_a_chat_already_gone_counts_as_erased(client: TestClient) -> None:  # noqa: F811
    busy_customer(client, "Zoya")
    store = client.app.state.merchant
    bid, iid = chat_of(client)
    assert store.thread_exists(bid, iid)
    # The owner deleted it first.
    store.thread_action("demo-owner", bid, iid, "", "delete")
    body = client.delete("/api/v1/customer/data").json()
    assert body["status"] == "erased" and body["chats"] == 1
    assert client.app.state.community.threads(uid_of(client)) == []


def test_ob96_firestore_customer_delete_reaches_a_sealed_shop(client: TestClient) -> None:  # noqa: F811
    """The customer's own delete is the erasure itself, so a sealed shop no longer refuses it."""
    store = client.app.state.merchant
    if not hasattr(store, "businesses"):
        pytest.skip("Only Firestore keeps half-deleted (sealed) shops.")
    busy_customer(client, "Zoya")
    bid, iid = chat_of(client)
    store.businesses.document(bid).update({"deleting": True})
    body = client.delete("/api/v1/customer/data").json()
    assert body["status"] == "erased" and body["chats"] == 1
    assert not store.thread_exists(bid, iid)


def pre_index_tip(who: TestClient, name: str) -> str:
    """A customer whose tip was filed before tips were indexed per customer."""
    busy_customer(who, name)
    uid = uid_of(who)
    who.app.state.community.docs.delete("tipped", uid)
    return uid


def their_tips(who: TestClient, name: str) -> list[str]:
    return [t.text for t in who.app.state.community.tips(DEMO) if t.text.startswith(name)]


def test_ob96_a_pre_index_tip_is_still_erased_on_try_again(
    client: TestClient,  # noqa: F811
    monkeypatch,
) -> None:
    """Review HOLD #2 on #580: the follows, chats and stamps that named a pre-index tip's shop
    were erased while the tips step failed, so Try again said "erased" and the tip stayed."""
    pre_index_tip(client, "Zoya")
    service = client.app.state.community
    real = service.erase_tips
    calls = []

    def once(*args):
        calls.append(args)
        if len(calls) == 1:
            raise RuntimeError("Firestore unavailable")
        return real(*args)

    monkeypatch.setattr(service, "erase_tips", once)
    body = client.delete("/api/v1/customer/data").json()
    assert body["status"] == "partial" and body["pending"] == ["tips"]
    assert their_tips(client, "Zoya") == ["Zoya likes the sourdough"]
    again = client.delete("/api/v1/customer/data").json()
    assert again["status"] == "erased"
    assert their_tips(client, "Zoya") == []
    assert stored(client, uid_of(client)) == []


def test_ob96_a_failed_tip_listing_is_pending_and_keeps_what_it_needs(
    client: TestClient,  # noqa: F811
    monkeypatch,
) -> None:
    uid = pre_index_tip(client, "Zoya")
    service = client.app.state.community
    real = service.profile

    def down(_uid):
        raise RuntimeError("Firestore unavailable")

    monkeypatch.setattr(service, "profile", down)
    body = client.delete("/api/v1/customer/data").json()
    # Never "erased" with an empty list: tips pending, and their sources held back.
    assert body["status"] == "partial" and body["erased"] == []
    assert body["pending"] == list(erasure.CUSTOMER_STEPS)
    assert their_tips(client, "Zoya") and {"profile", "threadslots"} <= set(stored(client, uid))
    monkeypatch.setattr(service, "profile", real)
    again = client.delete("/api/v1/customer/data").json()
    assert again["status"] == "erased" and their_tips(client, "Zoya") == []
    assert stored(client, uid) == []


def test_ob96_delete_my_data_has_a_generous_per_customer_limit(
    client: TestClient,  # noqa: F811
    monkeypatch,
) -> None:
    fixed = time.time()
    monkeypatch.setattr("app.limits.time.time", lambda: fixed)
    client.app.state.v1_settings.rate_limits_enabled = True
    busy_customer(client, "Zoya")
    for _ in range(5):
        assert client.delete("/api/v1/customer/data").json()["status"] == "erased"
    denied = client.delete("/api/v1/customer/data")
    assert denied.status_code == 429 and int(denied.headers["retry-after"]) > 0
