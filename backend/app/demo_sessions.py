"""Expiring demo snapshots in the app namespace, separate from merchant records.

Both SQLite files (merchant and feature documents) travel together. Revision checks
reject concurrent edits rather than losing an already acknowledged sandbox write.
"""

import base64
import json
import sqlite3
import time
import zlib
from contextlib import closing
from pathlib import Path
from typing import Any

from fastapi import HTTPException

from .community import Documents, FirestoreDocuments, SqliteDocuments

KIND = "public_demo_sessions"
MAX_SNAPSHOT = 700_000


def repository(request: Any) -> Documents:
    app = request.app
    docs = getattr(app.state, "public_demo_docs", None)
    if docs is None:
        settings = app.state.v1_settings
        if settings.merchant_backend == "firestore":
            docs = FirestoreDocuments(app.state.merchant.client, settings.firestore_namespace)
        else:
            path = Path(settings.merchant_database)
            docs = SqliteDocuments(str(path.with_name(path.stem + "-public-demos.sqlite3")))
        app.state.public_demo_docs = docs
    return docs


def pack(entry: Any) -> dict[str, Any]:
    assert entry.store is not None
    files = []
    for path in (entry.store.path, entry.store.feature_docs.path):
        with closing(sqlite3.connect(path)) as db:
            dump = "\n".join(db.iterdump()).encode()
            files.append(base64.b64encode(zlib.compress(dump)).decode())
    data = {
        "expires": entry.expires,
        "uid": entry.uid,
        "bid": entry.bid,
        "reads": entry.reads,
        "reminders": entry.reminders,
        "turns": entry.turns,
        "revision": entry.revision,
        "files": files,
    }
    if len(json.dumps(data).encode()) > MAX_SNAPSHOT:
        raise HTTPException(413, "Demo is full. Start a new demo.")
    return data


def restore_files(data: dict[str, Any], directory: str) -> str:
    paths = [Path(directory) / "demo.sqlite3", Path(directory) / "demo-community.sqlite3"]
    for path, encoded in zip(paths, data["files"], strict=True):
        with closing(sqlite3.connect(path)) as target:
            target.executescript(zlib.decompress(base64.b64decode(encoded)).decode())
    return str(paths[0])


def save(docs: Documents, key: str, entry: Any, *, create: bool = False) -> None:
    data = pack(entry)

    def change(prior: dict[str, Any] | None) -> tuple[float, dict[str, Any]]:
        if not create and (not prior or prior["expires"] <= time.time()):
            raise HTTPException(410, "DEMO_EXPIRED")
        if prior and (create or prior["revision"] != entry.revision):
            raise HTTPException(409, "Demo changed. Try again.")
        return entry.expires, {**data, "revision": entry.revision + 1}

    docs.update(KIND, key, key, change)
    entry.revision += 1
