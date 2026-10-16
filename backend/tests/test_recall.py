import os
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest
from google.auth.credentials import AnonymousCredentials
from google.cloud import firestore

from app.memory_vectors import (
    EMBEDDING_DIMENSIONS,
    ConversationRecall,
    FirestoreRecall,
    padded_lexical,
)

requires_emulator = pytest.mark.skipif(
    (os.getenv("FIRESTORE_EMULATOR_HOST") or "").split(":")[0] not in {"127.0.0.1", "localhost"},
    reason="Requires the explicitly local Firestore emulator; never use a cloud database.",
)


@requires_emulator
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


def test_local_recall_supports_concurrent_owned_turns(tmp_path) -> None:
    recall = ConversationRecall(str(tmp_path / "recall"))

    def turn(index: int) -> None:
        uid = f"owner-{index % 4}"
        recall.remember(uid, "shop", f"chai price note {index}")
        assert recall.search(uid, "shop", "chai price")
        assert recall.search("stranger", "shop", "chai price") == []

    try:
        with ThreadPoolExecutor(max_workers=8) as pool:
            list(pool.map(turn, range(80)))
    finally:
        recall.close()
