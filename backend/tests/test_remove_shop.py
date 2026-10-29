"""OB-136 (#438): the operator removal really erases a shop (same steps as the owner's own
"Delete all my data"), is a dry run unless --apply, and only ever touches the named owner."""

from pathlib import Path

import anyio
import pytest
from fastapi.testclient import TestClient

from app.settings import Settings
from scripts import remove_shop
from scripts.seed_demo_shops import seed
from tests.test_erasure import make, shop
from tests.test_photos import join


def run(client: TestClient, *argv: str) -> int:
    return anyio.run(remove_shop.run, client.app, remove_shop.parse(list(argv)))


@pytest.fixture
def shops(tmp_path: Path):
    """Two owners: the removed one's shop, and a neighbour's shop that must stay."""
    app = make(tmp_path)
    with TestClient(app) as removed:
        join(removed)
        bid = shop(removed, "Removed tea")
        neighbour = TestClient(app)
        join(neighbour)
        kept = shop(neighbour, "Neighbour tea")
        yield removed, bid, neighbour, kept


def test_ob136_dry_run_by_default_erases_nothing(shops, capsys) -> None:
    removed, bid, _, _ = shops
    assert run(removed, "--shop", bid) == 0
    out = capsys.readouterr().out
    assert "Dry run: nothing erased" in out and bid in out
    assert removed.app.state.merchant.owners(bid)
    assert [b["id"] for b in removed.get("/api/v1/businesses").json()] == [bid]


def test_ob136_apply_runs_every_erase_step_for_that_owner_only(shops, capsys) -> None:
    removed, bid, neighbour, kept = shops
    store = removed.app.state.merchant
    uid = store.owners(bid)[0]
    assert run(removed, "--shop", bid, "--apply") == 0
    out = capsys.readouterr().out
    assert "erased, 1 shop(s)" in out
    # Really gone, not hidden: no owner, no record, no public page, no account data.
    assert store.owners(bid) == [] and store.list_businesses(uid) == []
    assert removed.get(f"/api/v1/public/shops/{bid}").status_code == 404
    assert removed.get("/api/v1/businesses").json() == []
    # Never a UID in the output.
    assert uid not in out
    # The neighbour keeps everything.
    assert [b["id"] for b in neighbour.get("/api/v1/businesses").json()] == [kept]


def test_ob136_an_owner_with_other_shops_is_refused_unless_all_are_named(shops) -> None:
    removed, bid, _, _ = shops
    second = shop(removed, "Second tea")
    store = removed.app.state.merchant
    assert run(removed, "--shop", bid, "--apply") == 1
    assert store.owners(bid) and store.owners(second)
    assert run(removed, "--shop", bid, "--shop", second, "--apply") == 0
    assert store.owners(bid) == [] and store.owners(second) == []


def test_ob136_sealed_finds_half_deleted_shops(shops, monkeypatch) -> None:
    removed, bid, neighbour, kept = shops
    store = removed.app.state.merchant
    # A shop flagged by hand (deleting, removed_by_operator) but still stored.
    monkeypatch.setattr(store, "sealed_shops", lambda: [bid])
    assert run(removed, "--sealed", "--apply") == 0
    assert store.owners(bid) == []
    assert [b["id"] for b in neighbour.get("/api/v1/businesses").json()] == [kept]


def test_ob136_sample_shops_stay(tmp_path: Path) -> None:
    with TestClient(make(tmp_path)) as client:
        seed(client.app.state.merchant, "demo-owner", city="singapore")
        sample = "demo-tiong-bahru-bakery"
        assert run(client, "--shop", sample, "--apply") == 0
        assert client.app.state.merchant.owners(sample) == ["demo-owner"]


def test_ob136_apply_on_a_real_project_needs_it_named(monkeypatch) -> None:
    monkeypatch.delenv("FIRESTORE_EMULATOR_HOST", raising=False)
    real = Settings(
        app_env="test",
        merchant_backend="firestore",
        google_cloud_project="some-project",
        _env_file=None,
    )
    args = remove_shop.parse(["--shop", "x", "--apply"])
    assert remove_shop.refusal(args, real).startswith("Refusing")
    named = remove_shop.parse(["--shop", "x", "--apply", "--project", "some-project"])
    assert remove_shop.refusal(named, real) == ""
    assert remove_shop.refusal(remove_shop.parse(["--shop", "x"]), real) == ""
    assert remove_shop.refusal(remove_shop.parse([]), real) != ""


def test_ob136_nothing_calls_the_removal_by_itself() -> None:
    backend = Path(__file__).resolve().parents[1]
    callers = [
        path
        for path in [*backend.glob("app/**/*.py"), *backend.glob("scripts/*.py")]
        if "remove_shop" in path.read_text(encoding="utf-8") and path.name != "remove_shop.py"
    ]
    assert callers == []
