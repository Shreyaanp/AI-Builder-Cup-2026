"""OB-78: open every Firestore connection before a new instance takes traffic.

The merchant store, community documents and rate limiter each hold their own client, whose gRPC
channel and credentials were set up on the first request that used it, so the first owner after a
deploy or a scale-up paid for all three. Uvicorn accepts connections only after the app's startup,
so touching each client there moves that cost off the first visitor.
"""

import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import structlog
from google.cloud import firestore

log = structlog.get_logger()
WARM_TIMEOUT_SECONDS = 5.0


def firestore_clients(*services: object) -> list[firestore.Client]:
    """The distinct Firestore clients held by these services (local SQLite stores hold none)."""
    found: dict[int, firestore.Client] = {}
    for service in services:
        for holder in (service, getattr(service, "docs", None)):
            client: Any = getattr(holder, "client", None)
            if isinstance(client, firestore.Client):
                found.setdefault(id(client), client)
    return list(found.values())


def warm_firestore(clients: list[firestore.Client], namespace: str) -> None:
    """One small read per client, in parallel. A failure only means the first request warms it."""
    if not clients:
        return

    def touch(client: firestore.Client) -> bool:
        # Warming must never stop the app from starting.
        try:
            client.collection(namespace).document("readiness").get(timeout=WARM_TIMEOUT_SECONDS)
            return True
        except Exception as error:
            log.warning("firestore_warm_failed", error=type(error).__name__)
            return False

    started = time.perf_counter()
    with ThreadPoolExecutor(max_workers=len(clients)) as pool:
        warmed = list(pool.map(touch, clients))
    log.info(
        "firestore_warm_ms",
        ms=round((time.perf_counter() - started) * 1000),
        clients=len(clients),
        failed=warmed.count(False),
    )
