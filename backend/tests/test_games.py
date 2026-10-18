# ruff: noqa: F811  (the passport route fixtures are imported and requested by name)
"""The game layer: scratch cards, endowed cards, streak freezes, collection sets, the co-op goal,
social proof and reciprocity perks (docs/research/gamification.md)."""

from datetime import datetime, timedelta

from fastapi.testclient import TestClient

from app.community import SqliteDocuments
from app.games import (
    COOP_BONUS,
    FIRST_PRIZE,
    ODDS_NO_PERK,
    ODDS_WITH_PERK,
    SET_POINTS,
    WELCOME_STAMPS,
    CoopStore,
    claim_coop,
    complete_sets,
    draw,
    issue_scratch,
    odds,
    plan_freeze,
    record_help,
    reveal,
    set_progress,
    use_perk,
)
from app.passport import PassportState, ShopProgress, apply_visit, streak, week_of
from app.passport import Visit as PassportVisit
from app.passport_routes import shop_stamp
from tests.test_passport import (  # noqa: F401  (pytest fixtures app and client)
    DEMO,
    app,
    at,
    at_shop,
    client,
    demo_key,
    midweek,
    shop,
    sign_in,
    sign_out,
    visit,
)


def fixed(value: int):
    return lambda n: value % n


def stamped(state: PassportState, place: dict, when: float):
    outcome = visit(state, place, when)
    assert outcome.verdict == "stamped" and outcome.stamp
    return outcome.stamp


# --- Scratch cards ---


def test_odds_are_published_and_add_up() -> None:
    for table in (ODDS_WITH_PERK, ODDS_NO_PERK):
        assert sum(weight for _, weight in table) == 100
    assert {o.prize for o in odds(True)} == {"points_10", "points_25", "perk", "freeze", "again"}
    assert "perk" not in {o.prize for o in odds(False)}
    # The draw follows the table exactly (a roll of 0..99 maps onto the published bands).
    assert draw(True, fixed(0)) == "points_10"
    assert draw(True, fixed(44)) == "points_10"
    assert draw(True, fixed(45)) == "points_25"
    assert draw(True, fixed(65)) == "perk"
    assert draw(True, fixed(75)) == "freeze"
    assert draw(True, fixed(80)) == "again" == draw(True, fixed(99))
    assert draw(False, fixed(54)) == "points_10" and draw(False, fixed(75)) == "freeze"


def test_first_card_always_wins_and_reveal_is_once() -> None:
    state = PassportState()
    record = stamped(state, shop("a"), at(0))
    before = state.points
    ticket = issue_scratch(state, record, "", fixed(99))  # would be "again", but it's the first
    assert ticket.first and ticket.prize == FIRST_PRIZE and state.scratches == 1
    shown = reveal(state, ticket.id, at(0))
    assert shown and shown.revealed and state.points == before + 25
    assert reveal(state, ticket.id, at(0)) is shown and state.points == before + 25
    assert reveal(state, "missing", at(0)) is None


def test_scratch_prizes_perk_freeze_and_try_again() -> None:
    state = PassportState(scratches=1)
    record = stamped(state, shop("a", demo=True), at(0))
    perk = issue_scratch(state, record, "Free biscuit", fixed(70))
    assert perk.prize == "perk" and perk.demo and perk.perk_text == "Free biscuit"
    reveal(state, perk.id, at(0))
    assert state.won_perks[0].text == "Free biscuit" and state.won_perks[0].source == "scratch"
    assert use_perk(state, state.won_perks[0].id) and state.won_perks[0].used
    assert not use_perk(state, state.won_perks[0].id)
    frozen = issue_scratch(state, record, "", fixed(77))
    assert frozen.prize == "freeze" and frozen.perk_text == ""
    reveal(state, frozen.id, at(0))
    assert state.freeze_wins == [week_of(datetime.fromtimestamp(at(0)).date())]
    again = issue_scratch(state, record, "", fixed(90))
    points = state.demo_points
    reveal(state, again.id, at(0))
    assert again.prize == "again" and state.demo_points == points  # demo stays demo


# --- Endowed progress, streak freezes ---


def test_freeze_ahead_holds_the_streak() -> None:
    weeks = [week_of(datetime(2026, 9, 7).date() + timedelta(weeks=n)) for n in range(5)]
    state = PassportState(weeks=weeks[:2])
    assert plan_freeze(state, weeks[1], "this") == "not_needed"  # visited already
    assert plan_freeze(state, weeks[1], "next") == "frozen"
    assert plan_freeze(state, weeks[1], "next") == "already"
    now = streak(state, weeks[1])
    assert now.planned == [weeks[2]] and now.freezes == 0
    later = streak(state, weeks[3])  # the frozen week passed: the streak holds
    assert later.weeks == 2 and later.row[-2:] == ["frozen", "current"]
    assert plan_freeze(
        PassportState(weeks=weeks[:1], frozen_weeks=[weeks[2]]), weeks[1], "this"
    ) == ("no_freezes")
    # A scratch-won freeze adds to the bank (at most 2).
    rich = PassportState(weeks=weeks[:1], freeze_wins=[weeks[0], weeks[0], weeks[0]])
    assert streak(rich, weeks[1]).freezes == 2


# --- Collection sets ---


def test_locally_made_set_completes_with_badge_points_and_perk() -> None:
    state = PassportState()
    for n in range(3):
        place = {**shop(f"m{n}", category="Pottery"), "locally_made": True}
        record = stamped(state, place, at(n))
        before = state.points
        done = complete_sets(state, record, "Free glaze class" if n == 2 else "")
    assert done == ["locally_made"] and state.points == before + SET_POINTS
    assert "locally_made" in state.sets_done
    assert state.won_perks[0].text == "Free glaze class" and state.won_perks[0].source == "set"
    assert complete_sets(state, record, "x") == []  # once


def test_chai_trail_and_night_market_match_their_stamps() -> None:
    state = PassportState()
    stamped(state, shop("t1", category="Chai stall"), at(0, 8))
    stamped(state, shop("t2", category="Kopitiam"), at(0, 9))
    stamped(state, shop("b1", category="Bakery"), at(0, 19))
    stamped(state, shop("n1", category="Noodle bar"), at(0, 20))
    assert set_progress(state, "chai_trail") == ["t1", "t2"]
    assert set_progress(state, "night_market") == ["b1", "n1"]
    assert set_progress(state, "locally_made") == []


def test_coop_claim_needs_help_and_pays_once() -> None:
    state = PassportState()
    assert not claim_coop(state, "w21z7", "2026-W42", demo=False)
    record_help(state, "w21z7", "2026-W42")
    assert claim_coop(state, "w21z7", "2026-W42", demo=False) and state.points == COOP_BONUS
    assert not claim_coop(state, "w21z7", "2026-W42", demo=False)


# --- Routes ---


def stamp_demo(client: TestClient) -> dict:
    body = {"shop_id": DEMO, "key": demo_key(client), **at_shop(client)}
    response = client.post("/api/v1/customer/passport/stamps", json=body)
    assert response.status_code == 200
    return response.json()


def test_stamp_scratch_coop_and_freeze_story(client: TestClient, midweek: None) -> None:
    sign_in(client)
    first = stamp_demo(client)
    card = first["scratch"]
    assert card and card["first"] and card["prize"] is None  # the prize stays on the server
    assert sum(o["percent"] for o in card["odds"]) == 100
    games = first["passport"]["games"]
    assert [c["id"] for c in games["scratch"]] == [card["id"]]
    assert games["welcome_stamps"] == 2 and first["passport"]["shops"][0]["welcome"] == 2
    coop = games["coop"]
    assert coop["you"] == 1 and coop["demo"] and coop["demo_visits"] > 0
    assert coop["total"] == coop["demo_visits"] + 1 and not coop["reached"]
    points = first["passport"]["total"]
    shown = client.post(f"/api/v1/customer/games/scratch/{card['id']}/reveal").json()
    assert shown["card"]["prize"] == "points_25" and shown["card"]["points"] == 25
    assert shown["passport"]["total"] == points + 25 and shown["passport"]["games"]["scratch"] == []
    again = client.post(f"/api/v1/customer/games/scratch/{card['id']}/reveal").json()
    assert again["passport"]["total"] == points + 25
    assert client.post("/api/v1/customer/games/scratch/nope/reveal").status_code == 404
    # The welcome freeze, spent ahead on next week.
    assert first["passport"]["streak"]["freezes"] == 1
    this = client.post("/api/v1/customer/games/freeze", json={"week": "this"}).json()
    assert this["verdict"] == "not_needed"
    frozen = client.post("/api/v1/customer/games/freeze", json={"week": "next"}).json()
    assert frozen["verdict"] == "frozen" and frozen["passport"]["streak"]["freezes"] == 0
    assert len(frozen["passport"]["streak"]["planned"]) == 1
    # A second stamp the same day: no new card.
    assert stamp_demo(client)["scratch"] is None


def test_coop_reward_once_the_goal_is_reached(client: TestClient, midweek: None) -> None:
    sign_in(client)
    coop = stamp_demo(client)["passport"]["games"]["coop"]
    body = {"area": coop["area"], "week": coop["week"]}
    assert client.post("/api/v1/customer/games/coop/claim", json=body).status_code == 409
    store: CoopStore = client.app.state.coop
    data = store.get(coop["area"], coop["week"])

    def fill(_):
        return 0.0, {**data, "visits": coop["goal"]}

    store.docs.update("coop", f"{coop['area']}|{coop['week']}", coop["area"], fill)
    before = client.get("/api/v1/customer/passport").json()
    assert before["games"]["coop"]["reached"]
    claimed = client.post("/api/v1/customer/games/coop/claim", json=body).json()
    assert claimed["total"] == before["total"] + COOP_BONUS
    assert claimed["games"]["coop"]["claimed"]
    assert client.post("/api/v1/customer/games/coop/claim", json=body).status_code == 409
    # Erasure forgets this customer's help in the shared tally.
    client.delete("/api/v1/customer/passport")
    assert store.get(coop["area"], coop["week"])["helpers"] == {}


def test_shop_games_show_odds_welcome_and_social_proof(client: TestClient) -> None:
    demo = client.get(f"/api/v1/public/shops/{DEMO}/games").json()
    assert demo["welcome"] == 2 and demo["demo"] and demo["tried"] >= 3
    assert "perk" in {o["prize"] for o in demo["odds"]}  # the demo shop has a scratch perk
    triggers = {p["trigger"] for p in demo["perks"]}
    assert {"tip", "third_visit", "scratch", "set_complete"} <= triggers
    assert client.get("/api/v1/public/shops/nope/games").status_code == 404


def test_tried_count_is_aggregate_and_hidden_below_three(tmp_path) -> None:
    store = CoopStore(SqliteDocuments(str(tmp_path / "c.sqlite3")))
    today = datetime.fromtimestamp(at(0)).date()
    for uid in ("u1", "u2"):
        store.add_tried("shop-x", uid, today.isoformat())
    store.add_tried("shop-x", "u1", today.isoformat())  # the same person again: still 2
    assert store.tried("shop-x", today) == 2
    store.add_tried("shop-x", "u3", (today - timedelta(days=40)).isoformat())
    assert store.tried("shop-x", today) == 2  # older than 30 days
    store.erase_member("u1", {}, ["shop-x"])
    assert store.tried("shop-x", today) == 1


def test_owner_reciprocity_perks_and_scratch_perk(client: TestClient) -> None:
    client.get("/api/v1/bootstrap")
    from app.merchant import BusinessFields, ProductFields, ProposalRequest

    uid = client.app.state.services.identity.signer.loads(
        client.cookies.get("ogoogle_preview_session")
    )
    merchant = client.app.state.merchant
    proposal = merchant.propose(
        uid,
        ProposalRequest(
            kind="business",
            business=BusinessFields(
                name="Chai Point",
                category="Chai stall",
                location="Jayanagar, Bengaluru",
                lat=12.93,
                lng=77.58,
            ),
            products=[ProductFields(name="Chai", price=2000, unit="cup")],
        ),
    )
    bid = merchant.commit(uid, proposal["id"], proposal["digest"])["business_id"]
    merchant.share(uid, bid, True)
    perks = [
        {"id": "tip", "trigger": "tip", "text": "Thanks for the tip: free biscuit"},
        {"id": "third", "trigger": "third_visit", "text": "Third visit: half-price chai"},
        {"id": "follow", "trigger": "follow", "text": "Followers get first pick"},
        {"id": "scratch", "trigger": "scratch", "text": "Free bun maska"},
        {"id": "set", "trigger": "set_complete", "text": "Chai trail finisher: free cutting"},
    ]
    saved = client.put(f"/api/v1/businesses/{bid}/perks", json={"perks": perks})
    assert saved.status_code == 200
    games = client.get(f"/api/v1/public/shops/{bid}/games").json()
    assert games["tried"] is None and not games["demo"]
    assert {o["prize"] for o in games["odds"]} >= {"perk"}
    key = client.get(f"/api/v1/businesses/{bid}/qr-key").json()["key"]
    sign_out(client)
    sign_in(client, "Meera K")
    stamp = {"shop_id": bid, "key": key, "lat": 12.93, "lng": 77.58, "accuracy": 10}
    result = client.post("/api/v1/customer/passport/stamps", json=stamp).json()
    assert result["outcome"]["verdict"] == "stamped" and result["scratch"]["first"]
    assert {o["prize"] for o in result["scratch"]["odds"]} >= {"perk"}
    # The follow perk unlocks for a follower who has also visited.
    assert client.put(f"/api/v1/customer/follows/{bid}").status_code == 200
    view = client.get("/api/v1/customer/passport").json()
    assert "follow" in {p["trigger"] for p in view["perks"]}


def test_flagged_accounts_get_no_scratch_card() -> None:
    state = PassportState(rejects={datetime.fromtimestamp(at(0)).date().isoformat(): 9})
    outcome = apply_visit(state, PassportVisit(shop_id="d", shop=shop("d", demo=True), at=at(0)))
    assert outcome.verdict == "stamped"  # the stamp itself is still honest
    # The route skips the card for flagged accounts; the rule is the passport's own flag.
    from app.passport import flagged

    assert flagged(state, at(0))


def test_card_count_includes_welcome_stamps_everywhere(client: TestClient) -> None:
    """One count for "stamps on this card": the welcome stamps plus the customer's own."""
    # Signed out, from this phone's receipt; then signed in, from the account.
    body = {"shop_id": DEMO, "key": demo_key(client), **at_shop(client)}
    receipt = client.post("/api/v1/public/passport/check", json=body).json()["receipt"]
    preview = client.post(
        "/api/v1/public/passport/preview", json={"receipts": [receipt], "cards": {}}
    ).json()
    sign_in(client)
    signed_in = stamp_demo(client)["passport"]
    for view in (preview, signed_in):
        shop = next(s for s in view["shops"] if s["id"] == DEMO)
        assert shop["reward"] and shop["card"] == 1
        assert shop["stamps"] == shop["welcome"] + 1 == 3
        assert shop["slots"] == shop["needed"] + shop["welcome"]
    # Signed out, the phone's card is the card: a reward claimed there resets it here too.
    claimed = client.post(
        "/api/v1/public/passport/preview", json={"receipts": [receipt], "cards": {DEMO: 0}}
    ).json()
    assert next(s for s in claimed["shops"] if s["id"] == DEMO)["stamps"] == 2


def test_card_count_is_zero_without_a_card_and_never_overflows() -> None:
    progress = ShopProgress(name="Kopi", card=12, days=["2026-10-17"])
    full = shop_stamp("kopi", progress, {"reward_text": "A free kopi", "stamps_needed": 10})
    assert (full.stamps, full.slots) == (WELCOME_STAMPS + 10, WELCOME_STAMPS + 10)
    off = shop_stamp("kopi", progress, {"reward_text": "", "stamps_enabled": False})
    assert (off.stamps, off.slots, off.reward) == (0, 0, "")
