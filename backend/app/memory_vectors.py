"""Owner/business-scoped conversation recall.

Local mode uses Qdrant with lexical hashed vectors (explicitly not semantic). Production uses
Firestore vector search over Vertex `gemini-embedding-2` vectors, one collection per
owner+business so a nearest-neighbour query can never cross account or business boundaries.
"""

import hashlib
import re
import time
from collections.abc import Callable
from typing import Any, Protocol
from uuid import uuid4

import numpy as np
from google.cloud import firestore
from google.cloud.firestore_v1.base_vector_query import DistanceMeasure
from google.cloud.firestore_v1.vector import Vector
from qdrant_client import QdrantClient, models

EMBEDDING_DIMENSIONS = 768


class Recall(Protocol):
    def remember(self, uid: str, bid: str | None, text: str) -> None: ...
    def search(self, uid: str, bid: str | None, text: str) -> list[str]: ...
    def forget(self, uid: str, bids: list[str]) -> None: ...
    def close(self) -> None: ...


def gemini_embedder(project: str, location: str, model: str) -> Callable[[str], list[float]]:
    from google import genai
    from google.genai import types

    client = genai.Client(vertexai=True, project=project, location=location)
    config = types.EmbedContentConfig(output_dimensionality=EMBEDDING_DIMENSIONS)

    def embed(text: str) -> list[float]:
        result = client.models.embed_content(model=model, contents=text[:2000], config=config)
        values = (result.embeddings or [types.ContentEmbedding()])[0].values or []
        return normalize(values)

    return embed


def normalize(values: list[float]) -> list[float]:
    vector = np.asarray(values, dtype=np.float32)
    norm = float(np.linalg.norm(vector))
    return (vector / norm).tolist() if norm else vector.tolist()


def padded_lexical(text: str) -> list[float]:
    """Offline fixture embedder matching the production vector width."""
    return lexical_vector(text) + [0.0] * (EMBEDDING_DIMENSIONS - 256)


class FirestoreRecall:
    max_distance = 0.6  # cosine distance; background context only, never authority

    def __init__(
        self, client: firestore.Client, namespace: str, embed: Callable[[str], list[float]]
    ) -> None:
        self.client = client
        self.root = client.collection(namespace).document("merchant").collection("recall")
        self.embed = embed

    def items(self, uid: str, bid: str | None) -> Any:
        scope = hashlib.sha256(f"{uid}\0{bid or ''}".encode()).hexdigest()
        return self.root.document(scope).collection("items")

    def remember(self, uid: str, bid: str | None, text: str) -> None:
        vector = self.embed(text)
        if any(vector):
            self.items(uid, bid).add(
                {"text": text[:2000], "at": time.time(), "embedding": Vector(vector)}
            )

    def search(self, uid: str, bid: str | None, text: str) -> list[str]:
        vector = self.embed(text)
        if not any(vector):
            return []
        query = self.items(uid, bid).find_nearest(
            vector_field="embedding",
            query_vector=Vector(vector),
            distance_measure=DistanceMeasure.COSINE,
            limit=4,
            distance_result_field="distance",
        )
        return [
            str(data.get("text", ""))
            for data in (snapshot.to_dict() or {} for snapshot in query.get())
            if data.get("distance", 1.0) <= self.max_distance
        ]

    def forget(self, uid: str, bids: list[str]) -> None:
        for bid in [None, *bids]:
            items = list(self.items(uid, bid).stream())
            for start in range(0, len(items), 400):
                batch = self.client.batch()
                for snapshot in items[start : start + 400]:
                    batch.delete(snapshot.reference)
                batch.commit()

    def close(self) -> None:
        return None


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

    def forget(self, uid: str, bids: list[str]) -> None:
        owner = models.FieldCondition(key="uid", match=models.MatchValue(value=uid))
        self.client.delete(self.collection, models.Filter(must=[owner]))

    def close(self) -> None:
        self.client.close()
