"""OB-78: hashed assets are served from their build-time .br/.gz copies (no per-request gzip)."""

import gzip
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.testclient import TestClient

from app.frontend import serve_frontend

SCRIPT = b"export const answer = 42;\n" * 200
BROTLI = b"pretend-brotli-bytes"


@pytest.fixture
def client(tmp_path: Path) -> TestClient:
    (tmp_path / "index.html").write_text("<html><head></head></html>", encoding="utf-8")
    assets = tmp_path / "assets"
    assets.mkdir()
    (assets / "app-abc123.js").write_bytes(SCRIPT)
    (assets / "app-abc123.js.br").write_bytes(BROTLI)
    (assets / "app-abc123.js.gz").write_bytes(gzip.compress(SCRIPT))
    (assets / "plain-abc123.js").write_bytes(SCRIPT)
    app = FastAPI()
    # The real app compresses responses too; a precompressed file must not be compressed twice.
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    serve_frontend(app, str(tmp_path))
    return TestClient(app)


def fetch(client: TestClient, path: str, accept: str) -> tuple[dict[str, str], bytes]:
    with client.stream("GET", path, headers={"Accept-Encoding": accept}) as response:
        assert response.status_code == 200
        return dict(response.headers), b"".join(response.iter_raw())


def test_ob78_brotli_copy_is_sent_when_accepted(client: TestClient) -> None:
    headers, body = fetch(client, "/assets/app-abc123.js", "gzip, deflate, br")
    assert headers["content-encoding"] == "br"
    assert body == BROTLI
    assert headers["content-type"] == "text/javascript; charset=utf-8"
    assert headers["cache-control"] == "public, max-age=31536000, immutable"
    assert "accept-encoding" in headers["vary"].lower()


def test_ob78_gzip_copy_when_brotli_is_not_accepted(client: TestClient) -> None:
    for accept in ("gzip, deflate", "gzip, br;q=0"):
        headers, body = fetch(client, "/assets/app-abc123.js", accept)
        assert headers["content-encoding"] == "gzip"
        assert gzip.decompress(body) == SCRIPT


def test_ob78_identity_and_files_without_copies_still_work(client: TestClient) -> None:
    headers, body = fetch(client, "/assets/app-abc123.js", "identity")
    assert "content-encoding" not in headers
    assert body == SCRIPT
    # An asset without precompressed copies is still compressed by the middleware.
    headers, body = fetch(client, "/assets/plain-abc123.js", "gzip")
    assert headers["content-encoding"] == "gzip"
    assert gzip.decompress(body) == SCRIPT
    assert headers["cache-control"] == "public, max-age=31536000, immutable"
