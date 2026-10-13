import os
from uuid import uuid4

import pytest
from google.auth.credentials import AnonymousCredentials
from google.cloud import firestore

from app.memory_vectors import EMBEDDING_DIMENSIONS, FirestoreRecall, padded_lexical

pytestmark = pytest.mark.skipif(
    os.getenv("FIRESTORE_EMULATOR_HOST") != "127.0.0.1:8085",
    reason="Requires the explicitly local Firestore emulator; never use a cloud database.",
)


def test_recall_never_crosses_owner_or_business() -> None:
    assert len(padded_lexical("chai")) == EMBEDDING_DIMENSIONS
    client = firestore.Client(project="demo-ogoogle-local", credentials=AnonymousCredentials())
    recall = FirestoreRecall(client, "ogoogle_ai_test_" + uuid4().hex, padded_lexical)
    recall.remember("alice", "shop-1", "chai price is fifteen rupees")
    recall.remember("alice", "shop-2", "chai price is twenty rupees at the second shop")
    recall.remember("bob", "shop-1", "bob chai price secret")
    assert recall.search("alice", "shop-1", "what is the chai price") == [
        "chai price is fifteen rupees"
    ]
    assert recall.search("carol", "shop-1", "chai price") == []
    client.close()
