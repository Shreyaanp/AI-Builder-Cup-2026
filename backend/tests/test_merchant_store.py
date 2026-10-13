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
