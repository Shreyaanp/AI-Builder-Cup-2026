"""Customer accounts: sign-in gate, owned threads, demo replies, follows, feed, tips, ranking."""

import os
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from google.adk.sessions import InMemorySessionService

from app.community import (
    Community,
    FirestoreDocuments,
    SqliteDocuments,
    basic_filter,
    stated_preferences,
)
from app.main import create_app
from app.settings import Settings
from scripts.seed_demo_shops import SHOPS, seed

DEMO = "demo-tiong-bahru-bakery"
EMULATOR = (os.getenv("FIRESTORE_EMULATOR_HOST") or "").split(":")[0] in {"127.0.0.1", "localhost"}
PROJECT = "demo-ogoogle-local"


def requires_emulator() -> None:
    if not EMULATOR:
        pytest.skip("Requires the explicitly local Firestore emulator; never a cloud database.")


@pytest.fixture(params=["sqlite", "firestore"])
def app(request: pytest.FixtureRequest, tmp_path: Path):
    """Every customer-account test runs on SQLite (local) and Firestore (hosted)."""
    hosted: dict = {}
    if request.param == "firestore":
        requires_emulator()
        hosted = {
            "merchant_backend": "firestore",
            "google_cloud_project": PROJECT,
            "firestore_namespace": "ogoogle_ai_test_" + uuid4().hex,
        }
    return create_app(
        Settings(
            app_env="test",
            coach_mode="offline",
            v1_enabled=True,
            merchant_database=str(tmp_path / "merchant.sqlite3"),
            recall_path=str(tmp_path / "recall"),
            rate_limits_enabled=False,
            _env_file=None,
            **hosted,
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


@pytest.fixture(params=["sqlite", "firestore"])
def docs(request: pytest.FixtureRequest, tmp_path: Path):
    if request.param == "sqlite":
        yield SqliteDocuments(str(tmp_path / "c.sqlite3"))
        return
    requires_emulator()
    from google.auth.credentials import AnonymousCredentials
    from google.cloud import firestore

    client = firestore.Client(project=PROJECT, credentials=AnonymousCredentials())
    yield FirestoreDocuments(client, "ogoogle_ai_test_" + uuid4().hex)
    client.close()


def test_documents_scope(docs) -> None:
    docs.put("k", "a", "s", 1, {"n": 1})
    docs.put("k", "b", "s", 2, {"n": 2})
    assert [d["n"] for d in docs.scoped("k", "s")] == [2, 1]
    docs.delete("k", "a")
    assert docs.get("k", "a") is None


def test_scoped_lists_are_newest_first_past_the_fallback_cap(docs) -> None:
    # More than the 500 an equality-only Firestore query reads: newest must still come first.
    if isinstance(docs, FirestoreDocuments):
        batch = docs.client.batch()
        for n in range(520):
            ref = docs.ref("update", f"u{n}")
            batch.set(ref, {"scope": "shop", "created": float(n), "data": {"n": n}})
            if n % 400 == 399:
                batch.commit()
                batch = docs.client.batch()
        batch.commit()
    else:
        for n in range(520):
            docs.put("update", f"u{n}", "shop", float(n), {"n": n})
    docs.put("update", "other", "elsewhere", 9_999, {"n": -1})
    assert [d["n"] for d in docs.scoped("update", "shop", 3)] == [519, 518, 517]


def test_missing_firestore_index_falls_back_to_sorted_equality_query(docs, monkeypatch) -> None:
    if not isinstance(docs, FirestoreDocuments):
        pytest.skip("Firestore only: SQLite has its own index.")
    from google.api_core.exceptions import FailedPrecondition

    for n, created in enumerate([5.0, 1.0, 9.0]):
        docs.put("tip", f"t{n}", "shop", created, {"n": n})

    def missing(*_):
        raise FailedPrecondition("The query requires an index.")

    monkeypatch.setattr(docs, "ordered", missing)
    assert [d["n"] for d in docs.scoped("tip", "shop", 2)] == [2, 0]


def test_profile_edits_from_two_instances_are_never_lost(docs) -> None:
    # Two server instances share one database; a process lock cannot serialise them. Each round,
    # the person's two devices edit at the same instant (one request per instance).
    first, second = Community(docs), Community(docs)
    start = Barrier(2)

    def edit(instance: Community, action) -> None:
        start.wait()
        action(instance)

    rounds = [
        (lambda c: c.follow("asha", "shop-1", True), lambda c: c.follow("asha", "shop-2", True)),
        (lambda c: c.follow("asha", "shop-3", True), lambda c: c.remember_search("asha", "kopi")),
        (
            lambda c: c.set_preferences("asha", {"vegetarian": True}),
            lambda c: c.follow("asha", "shop-4", True),
        ),
    ]
    with ThreadPoolExecutor(max_workers=2) as pool:
        for one, two in rounds:
            for future in [pool.submit(edit, first, one), pool.submit(edit, second, two)]:
                future.result()
    profile = first.profile("asha")
    assert sorted(profile.follows) == ["shop-1", "shop-2", "shop-3", "shop-4"]
    assert profile.preferences.vegetarian and profile.searches[0].q == "kopi"


def test_snapshots_accept_any_product_name_and_older_snapshots(docs) -> None:
    community = Community(docs)

    def shop(price: int) -> dict:
        products = [
            {"name": name, "price": price, "available": True, "unit": "cup"}
            for name in ("__x__", "Kopi O. (large)", "a`b/c")
        ]
        return {"products": products, "currency": "SGD"}

    assert community.observe("bid", shop(100)) == []
    events = community.observe("bid", shop(120))
    assert sorted(e.item for e in events) == ["Kopi O. (large)", "__x__", "a`b/c"]
    assert community.observe("bid", shop(120)) == []
    # A snapshot written before products were stored as a list still compares.
    docs.put(
        "snapshot",
        "old",
        "old",
        1,
        {"products": {"Kopi": {"price": 100, "available": False, "unit": "cup"}}},
    )
    events = community.observe(
        "old",
        {"products": [{"name": "Kopi", "price": 100, "available": True, "unit": "cup"}]},
    )
    assert [e.kind for e in events] == ["back_in_stock"]
    feed = community.updates(["bid", "old"])
    assert len(feed) == 4 and feed[0].shop_id in {"bid", "old"}


def test_concurrent_first_looks_report_a_change_and_seed_demo_once(docs) -> None:
    community = Community(docs)
    base = {"demo": True, "currency": "SGD", "products": []}
    base["products"] = [
        {"name": "Kopi", "price": 180, "available": True, "unit": "cup"},
        {"name": "Kaya toast", "price": 240, "available": False, "unit": "set"},
    ]
    community.observe("demo-shop", base)
    changed = {**base, "products": [{**base["products"][0], "price": 200}, base["products"][1]]}
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda _: community.observe("demo-shop", changed), range(4)))
        list(pool.map(lambda _: community.seed_demo_updates("demo-shop", base), range(4)))
    assert sum(len(events) for events in results) == 1
    feed = community.updates(["demo-shop"])
    assert len([u for u in feed if u.demo]) == 4
    assert len([u for u in feed if not u.demo]) == 1
    community.seed_demo_updates("other-demo-shop", {**base})
    assert len(community.updates(["demo-shop"])) == 5  # Fixed demo IDs stay per shop.


def test_ob133_weekly_demo_refresh_replaces_the_four_cards_not_adds_four(docs, monkeypatch) -> None:
    """OB-133 / #429: the feed length must not depend on when the demo set was last refreshed."""
    community = Community(docs)
    shop = {
        "demo": True,
        "currency": "SGD",
        "products": [
            {"name": "Kopi", "price": 180, "available": True, "unit": "cup"},
            {"name": "Kaya toast", "price": 240, "available": True, "unit": "set"},
        ],
    }
    start = 1_760_000_000.0
    for offset in (0, 8 * 86_400, 16 * 86_400, 40 * 86_400):
        monkeypatch.setattr("app.community.time.time", lambda offset=offset: start + offset)
        community.seed_demo_updates("demo-shop", shop)
        feed = community.updates(["demo-shop"])
        assert [u.kind for u in feed if u.demo].count("menu_confirmed") == 1
        assert len(feed) == 4, f"refresh at +{offset // 86_400}d left {len(feed)} cards"


def test_marking_a_deleted_thread_seen_does_not_bring_it_back(docs) -> None:
    from fastapi import HTTPException

    community = Community(docs)
    community.add_thread("asha", "bid", "iid", "token", "m1")
    community.mark_seen("asha", "bid", "iid", "m2")
    assert community.thread("asha", "bid", "iid")["seen"] == "m2"
    with pytest.raises(HTTPException):
        community.mark_seen("asha", "other-bid", "iid", "m3")
    community.drop_thread("asha", "bid", "iid")
    with pytest.raises(HTTPException) as missing:
        community.mark_seen("asha", "bid", "iid", "m3")
    assert missing.value.status_code == 404
    assert community.threads("asha") == []


def test_thread_slots_converge_and_hold_the_cap_across_instances(docs) -> None:
    from fastapi import HTTPException

    from app.community import MAX_THREADS

    first, second = Community(docs), Community(docs)
    # A customer from before slots: the existing thread is found, not duplicated.
    first.add_thread("asha", "old-shop", "old-iid", "token", "m1")
    assert first.reserve_thread("asha", "old-shop") == ("existing", "old-iid")
    for n in range(MAX_THREADS - 2):
        state, claim = first.reserve_thread("asha", f"shop-{n}")
        assert state == "mine"
        first.add_thread("asha", f"shop-{n}", f"iid-{n}", "token", "m1")
    start = Barrier(2)

    def reserve(instance: Community, bid: str):
        start.wait()
        try:
            return instance.reserve_thread("asha", bid)
        except HTTPException as error:
            return ("refused", str(error.status_code))

    with ThreadPoolExecutor(max_workers=2) as pool:
        # Two tabs, one shop: one creates, the other waits for it.
        same = sorted(r[0] for r in pool.map(reserve, [first, second], ["new-shop", "new-shop"]))
        assert same == ["mine", "wait"]
        # The 50th slot is now taken: two more shops at once can never reach 51.
        other = list(pool.map(reserve, [first, second], ["shop-a", "shop-b"]))
        assert [r[0] for r in other] == ["refused", "refused"]
    first.add_thread("asha", "new-shop", "new-iid", "token", "m1")
    assert second.reserve_thread("asha", "new-shop") == ("existing", "new-iid")
    # Deleting a chat frees its slot; a failed start gives its claim back.
    second.drop_thread("asha", "shop-0", "iid-0")
    state, claim = first.reserve_thread("asha", "shop-a")
    assert state == "mine"
    first.release_thread("asha", "shop-a", claim)
    assert second.reserve_thread("asha", "shop-a")[0] == "mine"


def test_shop_erasure_removes_its_community_copies(docs) -> None:
    community = Community(docs)
    shop = {"products": [{"name": "Tea", "price": 100, "available": True, "unit": "cup"}]}
    for bid in ["gone", "kept"]:
        community.observe(bid, shop)
        community.observe(bid, {"products": [{**shop["products"][0], "price": 90}]})
        docs.put("tip", f"{bid}\0asha", bid, time.time(), {"id": "t", "text": "Nice"})
    community.erase_shop("gone")
    assert docs.get("snapshot", "gone") is None
    assert community.updates(["gone"]) == [] and community.tips("gone") == []
    assert docs.get("snapshot", "kept") is not None
    assert len(community.updates(["kept"])) == 1 and len(docs.scoped("tip", "kept")) == 1


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
    assert "Butter croissant is on today (S$4.50 per" in demo_reply_text(
        shop, "Any croissants this afternoon?"
    )
    assert "sold out" in demo_reply_text(shop, "Do you have kaya buns?")
    assert "08:00–18:00" in demo_reply_text(shop, "Are you open on Sunday?")


@pytest.mark.parametrize(
    ("currency", "price", "expected"), [("INR", 54000, "₹540"), ("SGD", 54050, "S$540.50")]
)
def test_customer_reply_uses_the_shop_currency_symbol(
    currency: str, price: int, expected: str
) -> None:
    from app.community_routes import demo_reply_text

    shop = {
        "currency": currency,
        "products": [{"name": "Flour", "available": True, "price": price, "unit": "kg"}],
    }
    assert expected in demo_reply_text(shop, "Do you have flour?")
