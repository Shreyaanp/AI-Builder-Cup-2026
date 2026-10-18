"""Places results shared by every instance for a short time, so one area's lookups are paid once.

Google Maps Platform terms: place ids may be stored indefinitely, latitude/longitude for up to
30 days, and other Places content (names, ratings, opening state, photos) only short-term. The
shared copy therefore lives at most an hour (PLACES_CACHE_TTL_SECONDS, default 30 minutes) and
Firestore deletes it through a TTL policy on `expires_at`:

  gcloud firestore fields ttls update expires_at --collection-group=places_cache --enable-ttl \
    --project=PROJECT_ID --database=DATABASE_ID

Reads also check `expires_at`, so a late TTL deletion never serves stale content.
"""

import hashlib
import json
from datetime import UTC, datetime, timedelta
from typing import Any, Protocol

from .settings import Settings


class SharedPlaces(Protocol):
    async def get(self, key: tuple[Any, ...]) -> Any | None: ...

    async def put(self, key: tuple[Any, ...], value: Any) -> None: ...


def cache_id(key: tuple[Any, ...]) -> str:
    # Hashed: the query text and coordinates never become a readable document id.
    return hashlib.sha256(json.dumps(key, ensure_ascii=False).encode()).hexdigest()


class FirestorePlaces:
    """`<namespace>/places/places_cache/<hash>`: the provider rows as JSON, with an expiry."""

    def __init__(self, client: Any, namespace: str, ttl: int) -> None:
        self.entries = client.collection(namespace).document("places").collection("places_cache")
        self.ttl = ttl

    async def get(self, key: tuple[Any, ...]) -> Any | None:
        snapshot = await self.entries.document(cache_id(key)).get(retry=None, timeout=3)
        data = snapshot.to_dict() if snapshot.exists else None
        if not data or data["expires_at"] < datetime.now(UTC):
            return None
        return json.loads(data["value"])

    async def put(self, key: tuple[Any, ...], value: Any) -> None:
        await self.entries.document(cache_id(key)).set(
            {
                "value": json.dumps(value, ensure_ascii=False),
                "expires_at": datetime.now(UTC) + timedelta(seconds=self.ttl),
            },
            retry=None,
            timeout=3,
        )


class MemoryPlaces:
    """The shared layer for tests and single-process previews."""

    def __init__(self, ttl: int) -> None:
        self.ttl = ttl
        self.entries: dict[str, tuple[datetime, str]] = {}

    async def get(self, key: tuple[Any, ...]) -> Any | None:
        entry = self.entries.get(cache_id(key))
        if not entry or entry[0] < datetime.now(UTC):
            return None
        return json.loads(entry[1])

    async def put(self, key: tuple[Any, ...], value: Any) -> None:
        expires = datetime.now(UTC) + timedelta(seconds=self.ttl)
        self.entries[cache_id(key)] = (expires, json.dumps(value, ensure_ascii=False))


def shared_places(client: Any, settings: Settings) -> FirestorePlaces | None:
    """PLACES_CACHE on (the default) and Firestore available: share Places across instances."""
    if client is None or not settings.places_cache:
        return None
    return FirestorePlaces(client, settings.firestore_namespace, settings.places_cache_ttl_seconds)
