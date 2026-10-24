"""Shop playbook: generation (offline fixture and one mocked Gemini call), bounds, refresh rules,
lazy migration in both stores, owner edits and the Today / Grow / coach consumers."""

import json
import sqlite3
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.agent import shop_snapshot
from app.coordinator import MerchantContext, current
from app.merchant import BusinessFields, MerchantRepository, MerchantStore, ProposalRequest
from app.merchant_firestore import FirestoreMerchantStore
from app.playbook import (
    GROW_DEFAULT,
    Playbook,
    PlaybookDraft,
    PlaybookWriter,
    StoredPlaybook,
    coach_summary,
    edit_item,
    gather_inputs,
    grow_order,
    menu_changed,
    migrate_stored,
    needs_refresh,
    offline_draft,
    remove_item,
    today_hints,
)
from app.settings import Settings
from tests.pins import SHOP_PIN
from tests.test_merchant_store import store  # noqa: F401
from tests.test_photos import app, join  # noqa: F401

SHOP = "6b0e8a52-2f0c-4b1e-9d55-0d6a3c4e9f11"
NOW = datetime(2026, 10, 16, 9, tzinfo=UTC)
TEA = {"kind": "food", "subtype": "Tea stall", "food": {"segment": "beverage"}}
TAILOR = {"kind": "tailor", "tailor": {}}


def business(profile: dict[str, Any], **fields: Any) -> dict[str, Any]:
    return {
        "fields": BusinessFields(
            name="Owner's real name",
            category=fields.pop("category", "Tea stall"),
            profile=profile,
            **fields,
        ).model_dump(),
        "coach_notes": [],
    }


def inputs_for(profile: dict[str, Any], menu: list[str] | None = None, **fields: Any) -> dict:
    inventory = [{"name": n, "price": 1500, "unit": "cup"} for n in (menu or [])]
    return gather_inputs(business(profile, **fields), inventory, [], [], date(2026, 10, 16))


def writer(mode: str = "offline") -> PlaybookWriter:
    settings = Settings(_env_file=None, coach_mode="offline")
    settings.coach_mode = mode  # type: ignore[assignment]
    return PlaybookWriter(settings)


def all_text(playbook: Playbook) -> str:
    return json.dumps(playbook.model_dump(), ensure_ascii=False).casefold()


async def test_offline_playbooks_fit_the_business_type() -> None:
    tea = await writer().build(
        inputs_for(TEA, ["Masala chai", "Cutting chai", "Bun maska"], busy_hours="7-10am"),
        "en",
        None,
        NOW,
    )
    metrics = [m.metric for m in tea.playbook.key_metrics]
    assert metrics[:2] == ["items_sold", "busy_hours"] and tea.mode == "offline"
    assert "rush hours: 7-10am" in all_text(tea.playbook)
    assert not {"halal", "vegetarian", "meat"} & set(all_text(tea.playbook).split())
    assert "Masala chai" in tea.playbook.vocabulary.terms
    tailor = await writer().build(inputs_for(TAILOR, category="Tailor"), "en", None, NOW)
    assert {"orders_due", "fittings"} <= {m.metric for m in tailor.playbook.key_metrics}
    assert tailor.playbook.vocabulary.catalogue == "services"
    # No menu and no sales yet: the first suggestions are the ones that unlock the rest.
    assert [f.feature for f in tailor.playbook.next_features][:2] == ["menu_photo", "import_sales"]


async def test_owner_answers_shape_goals_segments_and_features() -> None:
    stored = await writer().build(
        inputs_for(
            TEA,
            ["Chai"],
            understanding={"focus": "less_waste", "regulars": "Auto drivers at dawn"},
        ),
        "en",
        None,
        NOW,
    )
    p = stored.playbook
    assert p.goals[0].text == "Waste less stock"
    assert p.segments[0].text == "Regulars: Auto drivers at dawn"
    assert p.key_metrics[0].metric == "leftovers"
    assert "rescue" in [f.feature for f in p.next_features]
    hints = today_hints(stored, {"understanding": {"focus": "less_waste"}})
    assert hints.needs_you[0] == "leftovers" and "regulars" in hints.line_topics


def test_bounds_are_enforced_on_every_section() -> None:
    with pytest.raises(ValidationError):
        Playbook.model_validate({"goals": [{"id": "abcdef12", "text": "x"}] * 4})
    with pytest.raises(ValidationError):
        Playbook.model_validate({"priorities": [{"id": "abcdef12", "text": "x" * 121}]})
    with pytest.raises(ValidationError):
        Playbook.model_validate({"key_metrics": [{"id": "abcdef12", "text": "x", "metric": "x"}]})
    with pytest.raises(ValidationError):
        PlaybookDraft.model_validate(
            {**offline_draft(inputs_for(TEA)).model_dump(), "segments": ["a"] * 5}
        )


async def test_one_gemini_call_validated_and_filtered_for_relevance() -> None:
    draft = offline_draft(inputs_for(TEA, ["Chai"])).model_copy(
        update={
            "summary": "Morning chai for the market.",
            "priorities": ["Ask about halal certification", "Keep milk cold"],
            "goals": ["Sell more vegetarian thali"],
        }
    )
    generate = AsyncMock(return_value=SimpleNamespace(parsed=None, text=draft.model_dump_json()))
    live = writer("gemini")
    live._client = SimpleNamespace(
        aio=SimpleNamespace(models=SimpleNamespace(generate_content=generate))
    )
    stored = await live.build(inputs_for(TEA, ["Chai"]), "hi", None, NOW)
    assert generate.await_count == 1 and stored.mode == "gemini"
    config = generate.await_args.kwargs["config"]
    assert "maxItems" not in json.dumps(config.response_json_schema)
    assert "hi" in config.system_instruction
    assert [i.text for i in stored.playbook.priorities] == ["Keep milk cold"]
    assert stored.playbook.goals == [] and stored.playbook.tone.language == "hi"
    # A reply that breaks a bound is rejected whole, and the fixture is used instead.
    bad = json.loads(draft.model_dump_json())
    bad["goals"] = ["a", "b", "c", "d"]
    generate.return_value = SimpleNamespace(parsed=None, text=json.dumps(bad))
    assert (await live.build(inputs_for(TEA), "en", None, NOW)).mode == "offline"
    generate.side_effect = TimeoutError
    assert (await live.build(inputs_for(TEA), "en", None, NOW)).mode == "offline"


async def test_refresh_rules_cache_until_material_change_or_a_week() -> None:
    base = inputs_for(TEA, ["Chai", "Coffee", "Bun", "Toast"])
    stored = await writer().build(base, "en", None, NOW)
    assert needs_refresh(None, base, NOW) == "missing"
    assert needs_refresh(stored, base, NOW) is None
    # New sales after six days: still cached. After a week: rebuilt. Nothing new: never.
    newer = {**base, "sales": {"days": 3, "top_items": ["Chai"], "busiest_weekday": 0}}
    assert needs_refresh(stored, newer, NOW + timedelta(days=6)) is None
    assert needs_refresh(stored, newer, NOW + timedelta(days=7)) == "weekly"
    assert needs_refresh(stored, base, NOW + timedelta(days=60)) is None
    # Material: profile, goals, place, language or a real menu change.
    tailor = inputs_for(TAILOR, ["Chai", "Coffee", "Bun", "Toast"], category="Tailor")
    assert needs_refresh(stored, tailor, NOW) == "profile_changed"
    goals = inputs_for(
        TEA, ["Chai", "Coffee", "Bun", "Toast"], understanding={"focus": "save_time"}
    )
    assert needs_refresh(stored, goals, NOW) == "profile_changed"
    assert needs_refresh(stored, {**base, "language": "ta"}, NOW) == "language_changed"
    one_more = inputs_for(TEA, ["Chai", "Coffee", "Bun", "Toast", "Rusk"])
    assert needs_refresh(stored, one_more, NOW) is None
    menu = inputs_for(TEA, ["Chai", "Lassi", "Juice", "Samosa"])
    assert needs_refresh(stored, menu, NOW) == "menu_changed"
    assert menu_changed([], ["chai"]) and not menu_changed(
        ["a"] * 0 + list("abcdefghij"), list("abcdefghik")
    )


async def test_owner_edits_survive_and_removed_items_never_return() -> None:
    base = inputs_for(TEA, ["Chai"])
    stored = await writer().build(base, "en", None, NOW)
    first, second = stored.playbook.priorities[0], stored.playbook.priorities[1]
    edited = edit_item(stored, first.id, "Milk delivery by 6 am", NOW)
    removed = remove_item(edited, second.id, NOW)
    assert removed.playbook.priorities[0].source == "owner"
    assert second.text not in [i.text for i in removed.playbook.priorities]
    again = await writer().build(base, "en", removed, NOW)
    texts = [i.text for i in again.playbook.priorities]
    assert texts[0] == "Milk delivery by 6 am" and second.text not in texts
    assert again.edited_at == removed.edited_at
    with pytest.raises(KeyError):
        remove_item(again, "00000000", NOW)
    with pytest.raises(ValidationError):
        edit_item(again, again.playbook.goals[0].id, "x" * 121, NOW)


def test_consumers_without_a_playbook_keep_the_usual_order() -> None:
    hints = today_hints(None, {})
    assert hints.pulse == ["sales", "items", "questions"] and hints.metrics == []
    assert grow_order(None) == list(GROW_DEFAULT) and coach_summary(None) == ""


async def test_tailor_today_and_grow_follow_the_playbook() -> None:
    stored = await writer().build(
        inputs_for(TAILOR, category="Tailor", understanding={"focus": "more_customers"}),
        "en",
        None,
        NOW,
    )
    hints = today_hints(stored, {"understanding": {"focus": "more_customers"}})
    assert hints.needs_you[:2] == ["orders", "questions"]
    assert hints.pulse[0] == "questions"
    order = grow_order(stored)
    assert order[0] == "google" and sorted(order) == sorted(GROW_DEFAULT)
    summary = json.loads(coach_summary(stored))
    assert "orders_due" in summary["numbers_that_matter"] and len(coach_summary(stored)) <= 900


@pytest.mark.parametrize("raw", [None, "", "{oops", {"version": 2}, {"version": 1, "x": 1}])
def test_unreadable_or_future_records_are_regenerated_not_trusted(raw) -> None:
    assert migrate_stored(raw) is None


# --- Both stores -------------------------------------------------------------------------------


def make(store: MerchantRepository, uid: str = "alice") -> str:  # noqa: F811
    proposal = store.propose(
        uid,
        ProposalRequest(
            kind="business",
            business=BusinessFields(name="Ram Tea", category="Tea stall", profile=TEA, **SHOP_PIN),
        ),
    )
    return str(store.commit(uid, proposal["id"], proposal["digest"])["business_id"])


async def test_store_round_trip_scope_and_erase(store: MerchantRepository) -> None:  # noqa: F811
    bid = make(store)
    assert store.playbook("alice", bid) is None
    stored = await writer().build(inputs_for(TEA, ["Chai"]), "en", None, NOW)
    store.set_playbook("alice", bid, stored.model_dump())
    assert StoredPlaybook.model_validate(store.playbook("alice", bid)) == stored
    revision = store.context("alice", bid)["business"]["revision"]
    with pytest.raises(HTTPException):
        store.playbook("bob", bid)
    with pytest.raises(HTTPException):
        store.set_playbook("bob", bid, stored.model_dump())
    # Private: never in the business record the app or customers read.
    assert "playbook" not in json.dumps(store.context("alice", bid)["business"])
    store.share("alice", bid, True)
    assert "playbook" not in json.dumps(store.public_shop(bid))
    assert store.context("alice", bid)["business"]["revision"] == revision
    store.set_playbook("alice", bid, None)
    assert store.playbook("alice", bid) is None
    store.set_playbook("alice", bid, stored.model_dump())
    store.erase_owner("alice")
    assert store.list_businesses("alice") == []


def test_sqlite_lazy_migration_adds_the_column_without_touching_rows(tmp_path: Path) -> None:
    path = tmp_path / "old.sqlite3"
    MerchantStore(str(path))
    bid = make(MerchantStore(str(path)))
    with sqlite3.connect(path) as db:
        db.execute("ALTER TABLE businesses DROP COLUMN playbook")
        before = db.execute("SELECT fields, revision FROM businesses").fetchall()
    reopened = MerchantStore(str(path))
    with sqlite3.connect(path) as db:
        assert db.execute("SELECT fields, revision FROM businesses").fetchall() == before
        assert db.execute("SELECT playbook FROM businesses").fetchall() == [(None,)]
    assert reopened.playbook("alice", bid) is None
    with sqlite3.connect(path) as db:
        db.execute("UPDATE businesses SET playbook=?", (json.dumps({"version": 9}),))
    assert reopened.playbook("alice", bid) is None


class FakeSnapshot:
    def __init__(self, data: dict[str, Any] | None, version: int) -> None:
        self._data, self.update_time = data, version
        self.exists = data is not None

    def to_dict(self) -> dict[str, Any] | None:
        return json.loads(json.dumps(self._data)) if self._data is not None else None


class FakeDocument:
    def __init__(self, docs: dict[str, Any], path: str) -> None:
        self.docs, self.path = docs, path

    def collection(self, name: str) -> "FakeCollection":
        return FakeCollection(self.docs, f"{self.path}/{name}")

    def get(self, transaction: Any = None) -> FakeSnapshot:
        data, version = self.docs.get(self.path, (None, 0))
        return FakeSnapshot(data, version)

    def update(self, changes: dict[str, Any], option: Any = None) -> None:
        data, version = self.docs[self.path]
        if option is not None and option != version:
            raise RuntimeError("precondition failed")
        data = dict(data)
        for key, value in changes.items():
            if value is FirestoreDelete:
                data.pop(key, None)
            else:
                data[key] = value
        self.docs[self.path] = (data, version + 1)


class FakeCollection:
    def __init__(self, docs: dict[str, Any], path: str) -> None:
        self.docs, self.path = docs, path

    def document(self, name: str) -> FakeDocument:
        return FakeDocument(self.docs, f"{self.path}/{name}")


class FakeClient:
    """Just the document calls the playbook methods use (no emulator on this machine)."""

    def __init__(self) -> None:
        self.docs: dict[str, Any] = {}

    def collection(self, name: str) -> FakeCollection:
        return FakeCollection(self.docs, name)

    @staticmethod
    def write_option(last_update_time: int) -> int:
        return last_update_time


FirestoreDelete: Any = None


async def test_firestore_lazy_migration_and_precondition(monkeypatch) -> None:
    from app import merchant_firestore

    global FirestoreDelete
    FirestoreDelete = merchant_firestore.firestore.DELETE_FIELD
    client = FakeClient()
    repo = FirestoreMerchantStore(client, "test")  # type: ignore[arg-type]
    path = f"test/merchant/businesses/{SHOP}"
    # A business document written before playbooks existed: no field at all.
    client.docs[path] = ({"fields": {"name": "Ram"}, "owners": ["alice"], "revision": 3}, 1)
    assert repo.playbook("alice", SHOP) is None
    with pytest.raises(HTTPException):
        repo.playbook("bob", SHOP)
    stored = await writer().build(inputs_for(TEA), "en", None, NOW)
    repo.set_playbook("alice", SHOP, stored.model_dump())
    data, _ = client.docs[path]
    assert data["revision"] == 3 and data["fields"] == {"name": "Ram"}
    assert StoredPlaybook.model_validate(repo.playbook("alice", SHOP)) == stored
    client.docs[path] = ({**data, "playbook": {"version": 0}}, 5)
    assert repo.playbook("alice", SHOP) is None
    repo.set_playbook("alice", SHOP, None)
    assert "playbook" not in client.docs[path][0]
    with pytest.raises(HTTPException):
        repo.set_playbook("bob", SHOP, stored.model_dump())


# --- Coach and routes --------------------------------------------------------------------------


async def test_coach_snapshot_includes_the_playbook_summary(tmp_path: Path) -> None:
    repo = MerchantStore(str(tmp_path / "m.sqlite3"))
    bid = make(repo)
    context = MerchantContext(repo, "alice", bid, [])
    token = current.set(context)
    try:
        assert "Shop playbook" not in shop_snapshot()
        stored = await writer().build(inputs_for(TEA, ["Chai"]), "en", None, NOW)
        repo.set_playbook("alice", bid, stored.model_dump())
        snapshot = shop_snapshot()
        assert "Shop playbook" in snapshot and "items_sold" in snapshot
        assert '"segment": "beverage"' in snapshot
    finally:
        current.reset(token)


def test_routes_generate_once_cache_edit_and_scope(app) -> None:  # noqa: F811
    with TestClient(app) as client:
        join(client)
        proposal = client.post(
            "/api/v1/proposals",
            json={
                "kind": "business",
                "revision": 0,
                "business": {"name": "Ram Tea", "category": "Tea stall", "profile": TEA},
            },
        ).json()
        bid = client.post(
            f"/api/v1/proposals/{proposal['id']}/approve", json={"digest": proposal["digest"]}
        ).json()["business_id"]
        path = f"/api/v1/businesses/{bid}/playbook"
        build = AsyncMock(wraps=app.state.playbook_writer.build)
        app.state.playbook_writer.build = build
        first = client.get(path)
        assert first.status_code == 200, first.text
        body = first.json()
        assert body["refreshed"] == "missing" and body["mode"] == "offline"
        assert body["today"]["metrics"][:2] == ["items_sold", "busy_hours"]
        assert set(body["grow"]) == set(GROW_DEFAULT)
        assert client.get(path).json()["refreshed"] is None
        assert client.get(path + "/today").json()["pulse"][0] == "items"
        assert build.await_count == 1
        item = body["playbook"]["priorities"][0]
        edited = client.patch(f"{path}/items/{item['id']}", json={"text": "Boil milk at 6"})
        assert edited.json()["playbook"]["priorities"][0] == {
            "id": item["id"],
            "text": "Boil milk at 6",
            "source": "owner",
        }
        gone = body["playbook"]["watch_list"][0]
        assert client.delete(f"{path}/items/{gone['id']}").status_code == 200
        assert client.delete(f"{path}/items/{gone['id']}").status_code == 404
        words = client.patch(
            path, json={"terms": ["cutting chai"], "summary": "Chai by the bus stop."}
        )
        assert words.json()["playbook"]["vocabulary"]["terms"] == ["cutting chai"]
        fresh = client.post(path + "/regenerate").json()
        assert fresh["refreshed"] == "requested" and build.await_count == 2
        assert fresh["playbook"]["priorities"][0]["text"] == "Boil milk at 6"
        assert gone["text"] not in json.dumps(fresh["playbook"])
        assert client.patch(f"{path}/items/abc", json={"text": ""}).status_code == 422
        assert client.get(path + "?language=xx").status_code == 422
        for _ in range(3):
            client.post(path + "/regenerate")
        assert client.post(path + "/regenerate").status_code == 429
    with TestClient(app) as other:
        join(other)
        assert other.get(path).status_code == 404
        assert other.post(path + "/regenerate").status_code == 404
        assert other.delete(f"{path}/items/{item['id']}").status_code == 404


def test_coach_eval_playbook_scenarios_seed_offline(tmp_path: Path) -> None:
    """The live eval scenarios need Gemini; their seeds and checks are validated here."""
    from scripts.coach_eval import SCENARIOS, Turn

    scenarios = {s.name: s for s in SCENARIOS if s.name.startswith("playbook_")}
    assert set(scenarios) == {
        "playbook_records_owner_goals",
        "playbook_tea_stall_never_asked_halal",
        "playbook_personal_advice",
    }
    for name, scenario in scenarios.items():
        repo = MerchantStore(str(tmp_path / f"{name}.sqlite3"))
        assert scenario.seed
        bid = scenario.seed(repo, "eval-owner")
        fields = repo.context("eval-owner", bid)["business"]["fields"]
        assert fields["profile"]["food"]["segment"] == "beverage"
        stored = repo.playbook("eval-owner", bid)
        assert (stored is not None) == (name == "playbook_personal_advice")
        bad = Turn(reply="Is your food halal?")
        assert not all(check(bad) for _, check in scenario.checks)
