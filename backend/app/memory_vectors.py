"""Local lexical-vector recall, explicitly not a neural semantic embedding model."""

import hashlib
import re
import time
from uuid import uuid4

import numpy as np
from qdrant_client import QdrantClient, models


def lexical_vector(text: str) -> list[float]:
    vector = np.zeros(256, dtype=np.float32)
    for token in re.findall(r"\w+", text.casefold())[:800]:
        index = int.from_bytes(hashlib.sha256(token.encode()).digest()[:2], "big") % 256
        vector[index] += 1
    norm = float(np.linalg.norm(vector))
    return (vector / norm).tolist() if norm else vector.tolist()


class ConversationRecall:
    collection = "conversation_lexical_v1"

    def __init__(self, path: str) -> None:
        self.client = QdrantClient(path=path, force_disable_check_same_thread=True)
        if not self.client.collection_exists(self.collection):
            self.client.create_collection(
                self.collection,
                vectors_config=models.VectorParams(size=256, distance=models.Distance.COSINE),
            )

    def remember(self, uid: str, bid: str | None, text: str) -> None:
        vector = lexical_vector(text)
        if not any(vector):
            return
        self.client.upsert(
            self.collection,
            [
                models.PointStruct(
                    id=str(uuid4()),
                    vector=vector,
                    payload={
                        "uid": uid,
                        "business_id": bid or "",
                        "text": text[:2000],
                        "at": time.time(),
                    },
                )
            ],
        )

    def search(self, uid: str, bid: str | None, text: str) -> list[str]:
        vector = lexical_vector(text)
        if not any(vector):
            return []
        result = self.client.query_points(
            self.collection,
            query=vector,
            limit=4,
            query_filter=models.Filter(
                must=[
                    models.FieldCondition(key="uid", match=models.MatchValue(value=uid)),
                    models.FieldCondition(
                        key="business_id", match=models.MatchValue(value=bid or "")
                    ),
                ]
            ),
        )
        return [
            str((point.payload or {}).get("text", ""))
            for point in result.points
            if point.score > 0.1
        ]

    def close(self) -> None:
        self.client.close()
