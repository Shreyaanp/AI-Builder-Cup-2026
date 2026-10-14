import os
from collections.abc import Iterator
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi import HTTPException
from google.auth.credentials import AnonymousCredentials
from google.cloud import firestore

from app.merchant import (
    BusinessFields,
    MerchantRepository,
    MerchantStore,
    ProductFields,
    ProposalRequest,
)
from app.merchant_firestore import FirestoreMerchantStore

EMULATOR = os.getenv("FIRESTORE_EMULATOR_HOST") == "127.0.0.1:8085"


@pytest.fixture(params=["sqlite", "firestore"])
def store(request: pytest.FixtureRequest, tmp_path: Path) -> Iterator[MerchantRepository]:
    if request.param == "sqlite":
        yield MerchantStore(str(tmp_path / "merchant.sqlite3"))
        return
    if not EMULATOR:
        pytest.skip("Requires the explicitly local Firestore emulator; never a cloud database.")
    client = firestore.Client(project="demo-ogoogle-local", credentials=AnonymousCredentials())
    yield FirestoreMerchantStore(client, "ogoogle_ai_test_" + uuid4().hex)
    client.close()


def create(store: MerchantRepository, uid: str, name: str = "Ram Tea Stall") -> str:
    request = ProposalRequest(kind="business", business=BusinessFields(name=name))
    proposal = store.propose(uid, request)
    return str(store.commit(uid, proposal["id"], proposal["digest"])["business_id"])


def create_with_products(store: MerchantRepository, uid: str = "alice") -> str:
    proposal = store.propose(
        uid,
        ProposalRequest(
            kind="business",
            business=BusinessFields(
                name="Ram Tea Stall",
                category="Tea",
                location="Market Road",
                hours="09:00–18:00",
                phone="1234567890",
            ),
            products=[
                ProductFields(name="Chai", price=1500, unit="cup", stock=10),
                ProductFields(name="Samosa", price=1000, unit="piece", stock=40),
            ],
        ),
    )
    return str(store.commit(uid, proposal["id"], proposal["digest"])["business_id"])


def test_new_business_proposal_commits_products_at_revision_one(store: MerchantRepository) -> None:
    bid = create_with_products(store)
    items = {item["name"]: item for item in store.inventory("alice", bid)}
    assert set(items) == {"Chai", "Samosa"}
    assert items["Chai"] == {
        "id": items["Chai"]["id"],
        "name": "Chai",
        "price": 1500,
        "unit": "cup",
        "stock": 10,
        "available": True,
    }
    assert items["Samosa"] == {
        "id": items["Samosa"]["id"],
        "name": "Samosa",
        "price": 1000,
        "unit": "piece",
        "stock": 40,
        "available": True,
    }
    assert store.context("alice", bid)["business"]["revision"] == 1


def test_business_edit_cannot_include_products(store: MerchantRepository) -> None:
    bid = create(store, "alice")
    with pytest.raises(HTTPException) as rejected:
        store.propose(
            "alice",
            ProposalRequest(
                kind="business",
                business_id=bid,
                revision=1,
                business=BusinessFields(name="Changed Tea Stall"),
                products=[ProductFields(name="Chai", price=1500, unit="cup")],
            ),
        )
    assert rejected.value.status_code == 422
    assert store.context("alice", bid)["business"]["revision"] == 1
    assert store.inventory("alice", bid) == []


def test_sharing_is_explicit_reversible_and_owner_scoped(store: MerchantRepository) -> None:
    bid = create_with_products(store)
    create(store, "bob", "Bob Bakery")
    assert store.public_shop(bid) is None
    for public in (True, False):
        with pytest.raises(HTTPException) as denied:
            store.share("bob", bid, public)
        assert denied.value.status_code == 404
    assert store.public_shop(bid) is None
    assert store.share("alice", bid, True) == {"business_id": bid, "public": True}
    assert store.public_shop(bid) is not None
    assert store.share("alice", bid, False) == {"business_id": bid, "public": False}
    assert store.public_shop(bid) is None


def test_public_shop_exposes_only_customer_fields(store: MerchantRepository) -> None:
    bid = create_with_products(store)
    store.share("alice", bid, True)
    shop = store.public_shop(bid)
    assert shop is not None
    # Exact key sets at both levels exclude owners, revision, stock and registration.
    assert set(shop) == {
        "id",
        "name",
        "category",
        "location",
        "lat",
        "lng",
        "place_id",
        "timezone",
        "hours",
        "phone",
        "currency",
        "facts",
        "products",
        "last_confirmed",
    }
    # A shop that never stated customer facts publishes none.
    assert shop["facts"] == {}
    assert {key: value for key, value in shop.items() if key not in ("products", "facts")} == {
        "id": bid,
        "name": "Ram Tea Stall",
        "category": "Tea",
        "location": "Market Road",
        "lat": None,
        "lng": None,
        "place_id": None,
        "timezone": "Asia/Singapore",
        "hours": "09:00–18:00",
        "phone": "1234567890",
        "currency": "SGD",
        "last_confirmed": None,
    }
    assert {product["name"]: product for product in shop["products"]} == {
        "Chai": {"name": "Chai", "price": 1500, "unit": "cup", "available": True},
        "Samosa": {"name": "Samosa", "price": 1000, "unit": "piece", "available": True},
    }


def test_availability_changes_one_product_and_invalidates_proposals(
    store: MerchantRepository,
) -> None:
    bid = create_with_products(store)
    store.share("alice", bid, True)
    revision = store.context("alice", bid)["business"]["revision"]
    proposal = store.propose(
        "alice",
        ProposalRequest(
            kind="inventory",
            business_id=bid,
            revision=revision,
            products=[ProductFields(name="Chai", price=2000, unit="cup")],
        ),
    )
    items = {item["name"]: item for item in store.inventory("alice", bid)}
    changed = store.set_availability("alice", bid, items["Chai"]["id"], False)
    assert changed == {**items["Chai"], "available": False, "revision": revision + 1}
    assert store.context("alice", bid)["business"]["revision"] == revision + 1
    assert {item["name"]: item for item in store.inventory("alice", bid)} == {
        "Chai": {**items["Chai"], "available": False},
        "Samosa": items["Samosa"],
    }
    shop = store.public_shop(bid)
    assert shop is not None
    assert {product["name"]: product["available"] for product in shop["products"]} == {
        "Chai": False,
        "Samosa": True,
    }
    with pytest.raises(HTTPException) as stale:
        store.commit("alice", proposal["id"], proposal["digest"])
    assert stale.value.status_code == 409


def test_availability_requires_known_product_and_owner(store: MerchantRepository) -> None:
    bid = create_with_products(store)
    create(store, "bob", "Bob Bakery")
    items = store.inventory("alice", bid)
    # A valid-shaped missing ID for Firestore also exercises SQLite's missing-row check.
    for uid, product_id in [("alice", "0" * 64), ("bob", items[0]["id"])]:
        with pytest.raises(HTTPException) as denied:
            store.set_availability(uid, bid, product_id, False)
        assert denied.value.status_code == 404
    assert store.inventory("alice", bid) == items
    assert store.context("alice", bid)["business"]["revision"] == 1


def test_erasure_removes_shared_shop(store: MerchantRepository) -> None:
    bid = create_with_products(store)
    store.share("alice", bid, True)
    assert store.public_shop(bid) is not None
    assert store.erase_owner("alice") == [bid]
    assert store.public_shop(bid) is None


def test_reviewed_business_is_owner_scoped(store: MerchantRepository) -> None:
    bid = create(store, "alice")
    assert [b["fields"]["name"] for b in store.list_businesses("alice")] == ["Ram Tea Stall"]
    assert store.list_businesses("bob") == []
    with pytest.raises(HTTPException) as denied:
        store.context("bob", bid)
    assert denied.value.status_code == 404
    context = store.context("alice", bid)
    assert context["business"]["revision"] == 1
    assert context["business"]["google_publication"] == "not_connected"
    assert context["person_verification"] == "not_enrolled"


def test_commit_requires_exact_digest_owner_and_is_idempotent(store: MerchantRepository) -> None:
    proposal = store.propose(
        "alice", ProposalRequest(kind="business", business=BusinessFields(name="Tea"))
    )
    for uid, digest, status in [("alice", "0" * 64, 409), ("bob", proposal["digest"], 404)]:
        with pytest.raises(HTTPException) as rejected:
            store.commit(uid, proposal["id"], digest)
        assert rejected.value.status_code == status
    first = store.commit("alice", proposal["id"], proposal["digest"])
    assert store.commit("alice", proposal["id"], proposal["digest"]) == first
    assert len(store.list_businesses("alice")) == 1


def test_stale_revision_is_rejected(store: MerchantRepository) -> None:
    bid = create(store, "alice")
    edit = ProposalRequest(
        kind="business", business_id=bid, revision=1, business=BusinessFields(name="Ram Chai")
    )
    first, second = store.propose("alice", edit), store.propose("alice", edit)
    store.commit("alice", first["id"], first["digest"])
    with pytest.raises(HTTPException) as stale:
        store.commit("alice", second["id"], second["digest"])
    assert stale.value.status_code == 409
    with pytest.raises(HTTPException):
        store.propose("alice", edit)  # revision 1 is no longer current
    assert store.context("alice", bid)["business"]["fields"]["name"] == "Ram Chai"


def test_inventory_upserts_by_name_and_unit(store: MerchantRepository) -> None:
    bid = create(store, "alice")
    revision = 1
    for price in (1500, 2000):
        proposal = store.propose(
            "alice",
            ProposalRequest(
                kind="inventory",
                business_id=bid,
                revision=revision,
                products=[
                    ProductFields(name="Chai", price=price, unit="cup"),
                    ProductFields(name="Samosa", price=1000, unit="piece", stock=40),
                ],
            ),
        )
        revision = store.commit("alice", proposal["id"], proposal["digest"])["revision"]
    items = {item["name"]: item for item in store.inventory("alice", bid)}
    assert set(items) == {"Chai", "Samosa"}
    assert items["Chai"]["price"] == 2000
    with pytest.raises(HTTPException):
        store.inventory("bob", bid)


def test_consent_and_erasure_are_owner_scoped(store: MerchantRepository) -> None:
    assert store.consent("alice") is None
    assert store.record_consent("alice", "2026-10-14")["version"] == "2026-10-14"
    assert store.consent("alice")["version"] == "2026-10-14"
    alice_shop = create(store, "alice")
    inventory = store.propose(
        "alice",
        ProposalRequest(
            kind="inventory",
            business_id=alice_shop,
            revision=1,
            products=[ProductFields(name="Chai", price=1500, unit="cup")],
        ),
    )
    store.commit("alice", inventory["id"], inventory["digest"])
    store.challenge("alice", alice_shop)
    bob_shop = create(store, "bob", "Bob Bakery")
    assert store.erase_owner("alice") == [alice_shop]
    assert store.list_businesses("alice") == []
    assert store.consent("alice") is None
    with pytest.raises(HTTPException):
        store.inventory("alice", alice_shop)
    assert [b["id"] for b in store.list_businesses("bob")] == [bob_shop]


def test_face_challenge_is_single_use_and_deletion_invalidates(store: MerchantRepository) -> None:
    bid = create(store, "alice")
    with pytest.raises(HTTPException):
        store.challenge("bob", bid)
    challenge = store.challenge("alice", bid)
    assert len(challenge["prompts"]) == 2
    with pytest.raises(HTTPException):
        store.consume("bob", challenge["id"])
    assert store.consume("alice", challenge["id"])["business_id"] == bid
    with pytest.raises(HTTPException) as replay:
        store.consume("alice", challenge["id"])
    assert replay.value.status_code == 409
    store.face_result("alice", challenge["id"], {"status": "review_pending"})
    assert store.result("alice", challenge["id"]) == {"status": "review_pending"}
    assert store.context("alice", bid)["person_verification"] == "review_pending"
    store.invalidate_face("alice")
    assert store.context("alice", bid)["person_verification"] == "not_enrolled"
    with pytest.raises(HTTPException):
        store.result("alice", challenge["id"])


def test_simulator_persistence_isolation_erasure_and_inventory(store: MerchantRepository) -> None:
    """E20, E23–24: both adapters keep fictional records separate from real facts."""
    from app.google_sim import SimFacts, initial

    bid = create_with_products(store)
    second = create(store, "alice", "Second shop")
    bob = create(store, "bob", "Bob shop")
    original = store.context("alice", bid)
    assert store.sim_state("alice", bid) is None
    state = initial(SimFacts(name="Fictional only"), "submit-unknown")
    state.phase, state.submission, state.version = "pending", "unknown", 1
    store.save_sim_state("alice", bid, state.model_dump())
    assert store.sim_state("alice", bid) == state.model_dump()
    if isinstance(store, MerchantStore):
        reopened = MerchantStore(store.path)
    else:
        reopened = FirestoreMerchantStore(store.client, store.businesses.parent.parent.id)
    assert reopened.sim_state("alice", bid) == state.model_dump()
    assert store.sim_state("alice", second) is None
    assert store.context("alice", bid) == original
    for method in [
        lambda: store.sim_state("bob", bid),
        lambda: store.save_sim_state("bob", bid, state.model_dump()),
    ]:
        with pytest.raises(HTTPException) as denied:
            method()
        assert denied.value.status_code == 404
    with pytest.raises(HTTPException) as stale:
        store.save_sim_state("alice", bid, state.model_dump())
    assert stale.value.status_code == 409
    proposal = store.propose(
        "alice",
        ProposalRequest(
            kind="inventory",
            business_id=bid,
            revision=1,
            products=[ProductFields(name="Chai", price=2500, unit="cup")],
        ),
    )
    store.commit("alice", proposal["id"], proposal["digest"])
    assert store.sim_state("alice", bid) == state.model_dump()
    assert store.context("alice", bid)["business"]["google_publication"] == "not_connected"
    state = initial(SimFacts(name="Reset only"))
    state.version = 2
    store.save_sim_state("alice", bid, state.model_dump())
    assert store.inventory("alice", bid)[0]["price"] == 2500
    store.erase_owner("alice")
    with pytest.raises(HTTPException):
        store.sim_state("alice", bid)
    assert store.sim_state("bob", bob) is None
    # Confirm erasure of the underlying simulator document/table too.
    if isinstance(store, MerchantStore):
        with store.connect() as db:
            assert (
                db.execute("SELECT COUNT(*) FROM google_sim WHERE uid='alice'").fetchone()[0] == 0
            )
    else:
        assert list(store.businesses.document(bid).collection("google_sim").stream()) == []


def test_customer_facts_are_sealed_saved_and_published(store: MerchantRepository) -> None:
    bid = create_with_products(store)
    saved = store.context("alice", bid)["business"]["fields"]
    # Shops without facts keep exactly the original record shape (and therefore digests).
    assert set(saved) == {"name", "category", "location", "hours", "phone", "currency"}
    proposal = store.propose(
        "alice",
        ProposalRequest(
            kind="business",
            business_id=bid,
            revision=1,
            business=BusinessFields(
                **saved,
                halal="muslim_owned",
                payment_methods=["paynow", "cash", "paynow"],
                delivery="grab",
                delivery_note="within 3 km",
            ),
        ),
    )
    business = proposal["snapshot"]["business"]
    assert business["payment_methods"] == ["paynow", "cash"]
    assert "preorders" not in business and "busy_hours" not in business
    store.commit("alice", proposal["id"], proposal["digest"])
    assert store.context("alice", bid)["business"]["fields"]["halal"] == "muslim_owned"
    store.share("alice", bid, True)
    shop = store.public_shop(bid)
    assert shop is not None
    assert shop["facts"] == {
        "halal": "muslim_owned",
        "payment_methods": ["paynow", "cash"],
        "delivery": "grab",
        "delivery_note": "within 3 km",
    }


@pytest.mark.parametrize(
    "fact",
    [
        {"halal": "maybe"},
        {"delivery": "drone"},
        {"payment_methods": ["bitcoin"]},
        {"busy_hours": "x" * 81},
        {"delivery_note": "x" * 81},
        {"preorder_lead_time": "x" * 81},
    ],
)
def test_customer_facts_are_validated(fact: dict[str, object]) -> None:
    with pytest.raises(ValueError):
        BusinessFields(name="Tea", **fact)  # type: ignore[arg-type]
