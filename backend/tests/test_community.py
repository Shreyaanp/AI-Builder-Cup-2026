"""Customer accounts: sign-in gate, owned threads, demo replies, follows, feed, tips, ranking."""

import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from google.adk.sessions import InMemorySessionService

from app.community import Community, SqliteDocuments, basic_filter, stated_preferences
from app.main import create_app
from app.settings import Settings
from scripts.seed_demo_shops import SHOPS, seed

DEMO = "demo-tiong-bahru-bakery"


@pytest.fixture
def app(tmp_path: Path):
    return create_app(
        Settings(
            app_env="test",
            coach_mode="offline",
            v1_enabled=True,
            merchant_database=str(tmp_path / "merchant.sqlite3"),
            recall_path=str(tmp_path / "recall"),
            rate_limits_enabled=False,
            _env_file=None,
        ),
        InMemorySessionService(),
    )


@pytest.fixture
def client(app):
    with TestClient(app) as client:
        seed(client.app.state.merchant, "demo-owner", city="singapore")
        client.app.state.demo_reply_delay = 0.05
        yield client


def sign_in(client: TestClient, name: str = "Asha") -> dict:
    response = client.post("/api/v1/customer/session", json={"name": name})
    assert response.status_code == 200
    return response.json()


def test_demo_seed_has_the_story_shop() -> None:
    assert DEMO in {s.id for s in SHOPS}


def test_browsing_is_anonymous_but_chat_needs_sign_in(client: TestClient) -> None:
    assert client.get("/api/v1/customer/me").json()["signed_in"] is False
    assert client.post(f"/api/v1/public/shops/{DEMO}/ask", json={"question": "hours?"}).is_success
    assert client.get("/api/v1/public/updates", params={"shops": DEMO}).is_success
    denied = client.post(f"/api/v1/customer/shops/{DEMO}/threads", json={"text": "Hello"})
    assert denied.status_code == 401 and denied.json()["detail"] == "SIGN_IN_REQUIRED"
    assert client.put(f"/api/v1/customer/follows/{DEMO}").status_code == 401
    assert (
        client.post(f"/api/v1/customer/shops/{DEMO}/tips", json={"text": "Lovely"}).status_code
        == 401
    )


def test_owned_thread_ai_answer_and_labelled_demo_reply(client: TestClient) -> None:
    sign_in(client)
    shop = client.get(f"/api/v1/public/shops/{DEMO}").json()
    item = next(p for p in shop["products"] if p["available"])["name"]
    started = client.post(
        f"/api/v1/customer/shops/{DEMO}/threads", json={"text": f"Do you have {item} today?"}
    ).json()
    iid = started["thread"]["id"]
    kinds = [(m["author"], m["kind"]) for m in started["thread"]["messages"]]
    assert kinds == [("customer", ""), ("owner", "ai")]
    deadline = time.time() + 5
    while time.time() < deadline:
        thread = client.get(f"/api/v1/customer/shops/{DEMO}/threads/{iid}").json()["thread"]
        if thread["messages"][-1]["kind"] == "demo":
            break
        time.sleep(0.05)
    assert thread["messages"][-1]["author"] == "owner"
    assert thread["messages"][-1]["kind"] == "demo"
    assert item in thread["messages"][-1]["text"]
    chats = client.get("/api/v1/customer/threads").json()
    assert [c["thread"]["id"] for c in chats] == [iid]
    assert chats[0]["unread"] == 2 and chats[0]["shop"]["demo"] is True
    last = thread["messages"][-1]["id"]
    client.post(f"/api/v1/customer/shops/{DEMO}/threads/{iid}/seen", json={"message_id": last})
    assert client.get("/api/v1/customer/threads").json()[0]["unread"] == 0
    # The owner sees the signed-in customer's thread, labelled with their name.
    inbox = client.app.state.merchant.inquiries("demo-owner", DEMO)
    assert any(i.id == iid and i.name == "Asha" for i in inbox)
    # A second "start" continues the same thread.
    again = client.post(f"/api/v1/customer/shops/{DEMO}/threads", json={"text": "Thanks!"})
    assert again.json()["thread"]["id"] == iid


def test_threads_are_owned_by_the_signed_in_customer(app) -> None:
    with TestClient(app) as alice:
        bob = TestClient(app)  # Same running app, separate browser cookies.
        seed(alice.app.state.merchant, "demo-owner", city="singapore")
        alice.app.state.demo_reply_delay = 60
        sign_in(alice, "Alice")
        sign_in(bob, "Bob")
        iid = alice.post(f"/api/v1/customer/shops/{DEMO}/threads", json={"text": "Hi"}).json()[
            "thread"
        ]["id"]
        for response in (
            bob.get(f"/api/v1/customer/shops/{DEMO}/threads/{iid}"),
            bob.post(f"/api/v1/customer/shops/{DEMO}/threads/{iid}/messages", json={"text": "x"}),
            bob.delete(f"/api/v1/customer/shops/{DEMO}/threads/{iid}"),
        ):
            assert response.status_code == 404
        assert bob.get("/api/v1/customer/threads").json() == []
        bob.delete("/api/v1/customer/session")
        assert bob.get("/api/v1/customer/threads").status_code == 401


def test_follow_feed_detects_real_changes_and_labels_demo(client: TestClient) -> None:
    sign_in(client)
    profile = client.put(f"/api/v1/customer/follows/{DEMO}").json()
    assert profile["follows"] == [DEMO]
    feed = client.get("/api/v1/public/updates", params={"shops": DEMO}).json()
    assert feed["shops"][0]["id"] == DEMO
    assert feed["updates"] and all(u["demo"] for u in feed["updates"])
    assert {u["kind"] for u in feed["updates"]} >= {"price_change", "back_in_stock", "new_item"}
    # A real change is noticed against the snapshot and is not labelled demo.
    community: Community = client.app.state.community
    shop = client.get(f"/api/v1/public/shops/{DEMO}").json()
    shop["products"][0]["price"] += 50
    events = community.observe(DEMO, shop)
    assert [(e.kind, e.demo) for e in events] == [("price_change", False)]
    assert client.delete(f"/api/v1/customer/follows/{DEMO}").json()["follows"] == []


def test_tips_are_moderated_seeded_and_owner_visible(client: TestClient) -> None:
    tips = client.get(f"/api/v1/public/shops/{DEMO}/tips").json()
    assert len(tips["tips"]) == 2 and all(t["demo"] for t in tips["tips"])
    sign_in(client)
    for text in ("Call me on 98765 43210", "Visit www.spam.com", "THIS PLACE IS AMAZING!!!!"):
        rejected = client.post(f"/api/v1/customer/shops/{DEMO}/tips", json={"text": text})
        assert rejected.status_code == 422
    added = client.post(
        f"/api/v1/customer/shops/{DEMO}/tips",
        json={"text": "Try the sourdough, still warm", "rating": 5},
    ).json()
    assert added["mine"] and added["name"] == "Asha"
    listed = client.get(f"/api/v1/public/shops/{DEMO}/tips").json()
    assert listed["tips"][0]["text"] == "Try the sourdough, still warm"
    assert listed["tips"][0]["mine"]
    owner_view = client.app.state.community.tips(DEMO)
    assert any(t.text.startswith("Try the sourdough") for t in owner_view)


def test_stated_preferences_and_filter() -> None:
    assert stated_preferences("I'm vegetarian, cheap lunch") == {"vegetarian": True}
    assert stated_preferences("veg biryani near me") == {}
    assert stated_preferences("my budget is under ₹100")["budget"] == 100
    assert stated_preferences("reply in Hindi please")["language"] == "hi"
    assert basic_filter("Great kopi and kind staff") is None


def test_personalised_ask(client: TestClient) -> None:
    shop = client.get(f"/api/v1/public/shops/{DEMO}").json()
    body = {"q": shop["products"][0]["name"], "lat": shop["lat"], "lng": shop["lng"]}
    anonymous = client.post("/api/v1/discover/ask", json=body).json()
    assert anonymous["personal"] is None
    assert all(g["id"] != "for_you" for g in anonymous["groups"])
    sign_in(client)
    client.put(f"/api/v1/customer/follows/{DEMO}")
    stated = client.post(
        "/api/v1/discover/ask", json={**body, "q": "I'm vegetarian " + body["q"]}
    ).json()
    assert stated["personal"]["saved"] == ["vegetarian"]
    for_you = next(g for g in stated["groups"] if g["id"] == "for_you")
    assert for_you["places"][0]["id"] == DEMO and "followed" in for_you["places"][0]["reasons"]
    me = client.get("/api/v1/customer/me").json()
    assert me["profile"]["preferences"]["vegetarian"] is True
    assert me["profile"]["searches"][0]["q"].startswith("I'm vegetarian")
    cleared = client.delete("/api/v1/customer/preferences").json()
    assert cleared["preferences"]["vegetarian"] is False and cleared["searches"] == []


def test_sqlite_documents_scope(tmp_path: Path) -> None:
    docs = SqliteDocuments(str(tmp_path / "c.sqlite3"))
    docs.put("k", "a", "s", 1, {"n": 1})
    docs.put("k", "b", "s", 2, {"n": 2})
    assert [d["n"] for d in docs.scoped("k", "s")] == [2, 1]
    docs.delete("k", "a")
    assert docs.get("k", "a") is None


def test_demo_reply_understands_plurals_and_sold_out() -> None:
    from app.community_routes import demo_reply_text

    shop = {
        "currency": "SGD",
        "hours": "08:00–18:00",
        "products": [
            {"name": "Butter croissant", "available": True, "price": 450, "unit": "piece"},
            {"name": "Kaya bun", "available": False, "price": 220, "unit": "piece"},
        ],
    }
    assert "Butter croissant is on today (SGD 4.50 per" in demo_reply_text(
        shop, "Any croissants this afternoon?"
    )
    assert "sold out" in demo_reply_text(shop, "Do you have kaya buns?")
    assert "08:00–18:00" in demo_reply_text(shop, "Are you open on Sunday?")
