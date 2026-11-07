"""Local fixtures only: sealed sales, both adapters, recaps and daily confirmation."""

from datetime import date, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.imports import heuristic_map
from app.merchant import BusinessFields, MerchantRepository, ProductFields, ProposalRequest
from app.planning import sales_forecast
from app.recap import TEMPLATES, RecapWriter, Summary, offline_summary, recap_facts, week_start
from app.sales import daily_sales, today_for
from app.settings import Settings
from app.shop_time import shop_timezone
from tests.pins import SHOP_PIN
from tests.test_imports import SALES, make_shop, upload
from tests.test_merchant_store import create, store  # noqa: F401
from tests.test_photos import app, join  # noqa: F401


def sale(day="2026-10-12", item="Kopi", quantity=30, revenue=5400):
    return {"date": day, "item": item, "quantity": quantity, "revenue": revenue}


def save(repository, bid, rows):
    proposal = repository.prepare_sales("alice", bid, rows)
    return repository.save_sales("alice", bid, proposal["id"], proposal["digest"])


def test_sealed_sales_reimport_persistence_scope_and_erase(store: MerchantRepository):  # noqa: F811
    bid = create(store, "alice", "Ah Seng Kopi")
    other = create(store, "bob", "Bakery")
    rows = [sale(), sale(item="Toast", quantity=12, revenue=3000), sale("2026-10-13")]
    pending = store.prepare_sales("alice", bid, rows)
    assert store.sales_history("alice", bid) == []
    for call in [
        lambda: store.sales_history("bob", bid),
        lambda: store.prepare_sales("bob", bid, rows),
        lambda: store.save_sales("bob", bid, pending["id"], pending["digest"]),
        lambda: store.save_sales("alice", other, pending["id"], pending["digest"]),
    ]:
        with pytest.raises(HTTPException) as denied:
            call()
        assert denied.value.status_code == 404
    with pytest.raises(HTTPException) as mismatch:
        store.save_sales("alice", bid, pending["id"], "0" * 64)
    assert mismatch.value.status_code == 409
    receipt = store.save_sales("alice", bid, pending["id"], pending["digest"])
    assert store.save_sales("alice", bid, pending["id"], pending["digest"]) == receipt
    save(store, bid, rows)
    assert len(store.sales_history("alice", bid)) == 3
    save(store, bid, [sale(quantity=5, revenue=900)])
    history = store.sales_history("alice", bid)
    assert len(history) == 2  # whole day replaced, including the removed toast
    assert history[0]["quantity"] == 5 and history[1]["quantity"] == 30
    if hasattr(store, "connect"):
        reopened = type(store)(store.path)
    else:
        reopened = type(store)(store.client, store.businesses.parent.parent.id)
    assert reopened.sales_history("alice", bid) == history
    store.recap_cache("alice", bid, "2026-W42:en", {"test": True})
    store.confirm_menu("alice", bid)
    store.erase_owner("alice")
    with pytest.raises(HTTPException):
        store.sales_history("alice", bid)
    assert store.sales_history("bob", other) == []
    if hasattr(store, "connect"):
        with store.connect() as db:
            for table in ("sales_days", "sales_imports", "recaps", "sold_out_days"):
                assert db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] == 0
    else:
        for collection in ("sales_days", "sales_imports", "recaps", "sold_out_days"):
            assert list(store.businesses.document(bid).collection(collection).stream()) == []


def test_sales_caps_stale_and_replaced_proposals(store: MerchantRepository):  # noqa: F811
    bid = create(store, "alice", "Kopi shop")
    rows = [sale((date(2025, 1, 1) + timedelta(days=i)).isoformat()) for i in range(365)]
    save(store, bid, rows)
    pending = store.prepare_sales("alice", bid, [sale("2026-10-12")])
    with pytest.raises(HTTPException) as full:
        store.save_sales("alice", bid, pending["id"], pending["digest"])
    assert full.value.status_code == 413
    assert len(store.sales_history("alice", bid)) == 365
    second = create(store, "alice", "Bakery")
    save(store, second, [sale(item=f"Item {i}") for i in range(500)])
    pending = store.prepare_sales("alice", second, [sale("2026-10-13", "New item")])
    with pytest.raises(HTTPException) as full:
        store.save_sales("alice", second, pending["id"], pending["digest"])
    assert full.value.status_code == 413
    pending = store.prepare_sales("alice", second, [sale()])
    replacement = store.prepare_sales("alice", second, [sale(quantity=1)])
    with pytest.raises(HTTPException):
        store.save_sales("alice", second, pending["id"], pending["digest"])
    edit = store.propose(
        "alice",
        ProposalRequest(
            kind="business",
            business_id=second,
            revision=2,
            business=BusinessFields(name="Changed bakery"),
        ),
    )
    store.commit("alice", edit["id"], edit["digest"])
    with pytest.raises(HTTPException) as stale:
        store.save_sales("alice", second, replacement["id"], replacement["digest"])
    assert stale.value.status_code == 409


def test_daily_parse_currency_rounding_zero_and_invalid():
    mapping = heuristic_map(["Date", "Item", "Qty", "Revenue"])
    rows = [["2026-10-12", "Kopi", "0", "0"], ["2026-10-12", "kopi", "2", "1.005"]]
    assert daily_sales(rows, mapping, "SGD") == [sale(quantity=2, revenue=101)]
    assert daily_sales(rows, mapping, "JPY")[0]["revenue"] == 1
    for bad in [
        ["", "Kopi", "2", "1"],
        ["2026-10-12", "", "2", "1"],
        ["2026-10-12", "Kopi", "-2", "1"],
        ["2026-10-12", "Kopi", "2", ""],
    ]:
        with pytest.raises(HTTPException):
            daily_sales([bad], mapping, "SGD")


def test_same_weekday_four_weeks_rounding_and_fallback():
    cutoff = date(2026, 10, 15)
    rows = [
        sale((cutoff - timedelta(weeks=i)).isoformat(), quantity=q)
        for i, q in enumerate([10, 20, 30, 42], start=1)
    ]
    rows += [
        sale(cutoff.isoformat(), quantity=10000),
        sale((cutoff - timedelta(weeks=5)).isoformat(), quantity=10000),
        sale("2026-10-14", quantity=10000),
    ]
    result = sales_forecast(rows, cutoff, "kopi", "cup")
    assert result is not None and result["baseline"] == 26 and result["n"] == 4
    assert result["source"] == "sales" and result["method"] == "same_weekday_four_weeks"
    assert sales_forecast(rows, cutoff, "Toast", "set") is None


def test_recap_facts_boundary_counts_and_all_offline_languages():
    start = week_start("2026-W42")
    timestamp = datetime(2026, 10, 12, tzinfo=shop_timezone("Asia/Singapore")).timestamp()
    facts = recap_facts(
        "2026-W42",
        [
            sale(),
            sale("2026-10-05", revenue=2700),
            sale(item="Toast", quantity=1, revenue=100),
            sale("2026-10-19", revenue=100000),
        ],
        {
            "fields": {"currency": "SGD"},
            "sold_out": {"2026-10-12": 2, "2026-10-19": 10},
            "questions": [
                {
                    "created": timestamp,
                    "messages": [
                        {"author": "customer", "created": timestamp},
                        {"author": "owner", "created": timestamp},
                        {"author": "customer", "created": timestamp + 7 * 86400},
                    ],
                }
            ],
        },
    )
    assert start.isoformat() == "2026-10-12"
    assert facts["revenue"] == 5500 and facts["previous_revenue"] == 2700
    assert facts["revenue_change_percent"] == 103.7
    assert facts["top_sellers"][0]["item"] == "Kopi"
    assert facts["slow_movers"][0]["item"] == "Toast"
    assert facts["sold_out_count"] == 2 and facts["customer_questions_count"] == 1
    for language in TEMPLATES:
        assert offline_summary(facts, language)
        assert offline_summary({**facts, "sales_days": 0}, language)
    for invalid in ["2026-W00", "2026-W54", "2026-42", "../2026"]:
        with pytest.raises(HTTPException):
            week_start(invalid)


def test_freshness_owner_switch_and_sold_out_signals(store: MerchantRepository):  # noqa: F811
    proposal = store.propose(
        "alice",
        ProposalRequest(
            kind="business",
            business=BusinessFields(name="Ah Seng Kopi", timezone="UTC", **SHOP_PIN),
            products=[ProductFields(name="Kopi", price=180)],
        ),
    )
    bid = store.commit("alice", proposal["id"], proposal["digest"])["business_id"]
    before = store.context("alice", bid)["business"]
    with pytest.raises(HTTPException):
        store.confirm_menu("bob", bid)
    day = today_for(before["fields"]).isoformat()
    assert store.confirm_menu("alice", bid)["last_confirmed"] == day
    assert store.confirm_menu("alice", bid)["last_confirmed"] == day
    assert store.context("alice", bid)["business"]["revision"] == before["revision"]
    store.share("alice", bid, True)
    assert store.public_shop(bid)["last_confirmed"] == day
    pid = store.inventory("alice", bid)[0]["id"]
    store.set_availability("alice", bid, pid, False)
    store.set_availability("alice", bid, pid, False)
    assert store.recap_signals("alice", bid)["sold_out"][day] == 1
    with pytest.raises(HTTPException):
        store.recap_cache("bob", bid, "week", {})
    with pytest.raises(HTTPException):
        store.recap_signals("bob", bid)


def test_ob240_recap_never_lists_an_item_as_top_seller_and_slow_mover():
    # Issue #622: a tea stall with three items had Bun maska under both lists.
    signals = {"fields": {"currency": "INR"}, "sold_out": {}, "questions": []}

    def sold(item: str, quantity: int) -> dict:
        return {"date": "2026-10-26", "item": item, "quantity": quantity, "revenue": quantity * 20}

    stall = [sold("Masala chai", 400), sold("Bun maska", 90), sold("Samosa", 30)]
    facts = recap_facts("2026-W44", stall, signals)
    assert [r["item"] for r in facts["top_sellers"]] == ["Masala chai", "Bun maska"]
    assert [r["item"] for r in facts["slow_movers"]] == ["Samosa"]
    for rows in (stall[:1], stall[:2], stall + [sold(f"Item {n}", n) for n in range(1, 10)]):
        facts = recap_facts("2026-W44", rows, signals)
        top = {r["item"] for r in facts["top_sellers"]}
        assert top and not top & {r["item"] for r in facts["slow_movers"]}
        assert facts["top_sellers"][0]["item"] == "Masala chai"


def test_routes_save_recap_cache_planning_and_freshness(app):  # noqa: F811
    with TestClient(app) as client:
        join(client)
        bid = make_shop(client)
        body = upload(client, bid, SALES).json()
        path = f"/api/v1/businesses/{bid}"
        assert client.get(path + "/sales").json() == []
        assert (
            client.post(
                path + f"/import/{body['import_id']}/approve", json={"digest": body["digest"]}
            ).status_code
            == 200
        )
        assert len(client.get(path + "/sales").json()) == 3
        writer = AsyncMock(wraps=app.state.recap_writer.write)
        app.state.recap_writer.write = writer
        recap = client.get(path + "/recap?week=2026-W42&language=ms")
        assert recap.status_code == 200
        assert recap.json()["mode"] == "offline" and recap.json()["revenue"] == 12900
        assert "Ringkasan" in recap.json()["summary"]
        assert client.get(path + "/recap?week=2026-W42&language=ms").json() == recap.json()
        assert writer.call_count == 1
        replacement = upload(client, bid, b"Date,Item,Qty,Revenue\n2026-10-12,Kopi,1,1.80\n").json()
        client.post(
            path + f"/import/{replacement['import_id']}/approve",
            json={"digest": replacement["digest"]},
        )
        assert client.get(path + "/recap?week=2026-W42&language=ms").json()["revenue"] == 4680
        assert writer.call_count == 2
        assert client.get(path + "/recap?week=2026-W54").status_code == 422
        assert client.get(path + "/recap?week=2026-W42&language=xx").status_code == 422
        assert client.post(path + "/freshness/confirm").status_code == 200
        assert client.get(path + "/freshness").json()["last_confirmed"] is not None
        # Planning must use actual saved sales even without manual observations.
        context = next(b for b in client.get("/api/v1/businesses").json() if b["id"] == bid)
        proposal = client.post(
            "/api/v1/proposals",
            json={
                "kind": "inventory",
                "business_id": bid,
                "revision": context["revision"],
                "products": [{"name": "Kopi", "price": 180}],
            },
        ).json()
        client.post(
            f"/api/v1/proposals/{proposal['id']}/approve", json={"digest": proposal["digest"]}
        )
        pid = client.get(path + "/inventory").json()[0]["id"]
        tomorrow = date.fromisoformat(client.get(path + "/freshness").json()["today"]) + timedelta(
            days=1
        )
        data = "Date,Item,Qty,Revenue\n" + "\n".join(
            f"{tomorrow - timedelta(weeks=i)},Kopi,{q},1" for i, q in enumerate([10, 20, 30, 42], 1)
        )
        body = upload(client, bid, data.encode()).json()
        client.post(path + f"/import/{body['import_id']}/approve", json={"digest": body["digest"]})
        result = client.post(path + f"/planning/{pid}/forecast", json={"capacity": 100}).json()
        assert result["source"] == "sales" and result["suggestion"] == 26
    with TestClient(app) as other:
        join(other)
        for url in ["/sales", "/freshness", "/recap?week=2026-W42"]:
            assert other.get(path + url).status_code == 404
        assert other.post(path + "/freshness/confirm").status_code == 404
        assert (
            other.post(
                path + f"/import/{body['import_id']}/approve", json={"digest": body["digest"]}
            ).status_code
            == 404
        )


@pytest.mark.asyncio
async def test_gemini_summary_uses_substituted_client_only():
    settings = Settings(_env_file=None, coach_mode="offline")
    settings.coach_mode = "gemini"  # no client is ever constructed
    writer = RecapWriter(settings)
    generate = AsyncMock(
        return_value=SimpleNamespace(
            parsed=Summary(text="Saved sales rose. Review the slow movers.")
        )
    )
    writer._client = SimpleNamespace(
        aio=SimpleNamespace(models=SimpleNamespace(generate_content=generate))
    )
    facts = {
        "sales_days": 1,
        "previous_sales_days": 1,
        "sold_out_count": 0,
        "customer_questions_count": 0,
    }
    text, mode = await writer.write(facts, "en")
    assert mode == "gemini" and text.startswith("Saved sales")
    assert "untrusted data" in generate.call_args.kwargs["config"].system_instruction
    generate.side_effect = RuntimeError("fixture failure")
    assert await writer.write(facts, "en") == (offline_summary(facts, "en"), "offline")
