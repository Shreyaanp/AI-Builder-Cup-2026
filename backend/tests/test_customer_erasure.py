"""OB-96 (#396): a customer's "Delete my data" erases everything kept for them, and only that."""

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
    assert body["erased"] == ["passport", "tips", "profile"]
    assert "Zoya" in inbox(client)
    monkeypatch.setattr(store, "thread_action", real)
    again = client.delete("/api/v1/customer/data").json()
    assert again["status"] == "erased" and again["chats"] == 1
    assert "Zoya" not in inbox(client)
    assert stored(client, uid_of(client)) == []


def test_ob96_delete_my_data_needs_a_customer(client: TestClient) -> None:  # noqa: F811
    assert client.delete("/api/v1/customer/data").status_code == 401
