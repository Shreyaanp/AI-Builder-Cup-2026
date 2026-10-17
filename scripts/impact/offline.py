"""Foreground offline entry point: measure, serve, build, or run backend checks.

Uses installed dependencies only. Disables dotenv before importing the application and
denies non-loopback sockets, including accidental provider calls. Never loads credentials.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import platform
import runpy
import socket
import subprocess
import sys
import tempfile
import time
from decimal import Decimal
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "docs/impact"
FIXTURES = Path(__file__).with_name("fixtures.json")


def isolate() -> None:
    keep = {
        "PATH",
        "SYSTEMROOT",
        "WINDIR",
        "TEMP",
        "TMP",
        "USERPROFILE",
        "LOCALAPPDATA",
        "PROGRAMFILES",
        "PROGRAMFILES(X86)",
        "COMSPEC",
        "PATHEXT",
        "UV_OFFLINE",
        "WEB_PORT",
        "API_PORT",
        "RECALL_PATH",
        "PYTHONUTF8",
        "PYTHONIOENCODING",
        "PYTHONUNBUFFERED",
    }
    for key in list(os.environ):
        if key.upper() not in keep:
            del os.environ[key]
    os.environ.update(
        APP_ENV="test",
        COACH_MODE="offline",
        AUTH_MODE="local",
        FACE_MODE="fixture",
        MODERATION_MODE="fixture",
        UV_OFFLINE="1",
    )
    original = socket.socket.connect
    original_ex = socket.socket.connect_ex
    original_resolve = socket.getaddrinfo

    def allowed(address: Any) -> None:
        if isinstance(address, tuple) and str(address[0]) not in {
            "127.0.0.1",
            "::1",
            "localhost",
        }:
            raise RuntimeError("Impact runner blocked a non-loopback connection")

    def connect(sock: socket.socket, address: Any) -> Any:
        allowed(address)
        return original(sock, address)

    def connect_ex(sock: socket.socket, address: Any) -> int:
        allowed(address)
        return original_ex(sock, address)

    def resolve(host: Any, *args: Any, **kwargs: Any) -> Any:
        if host not in {None, "localhost", "127.0.0.1", "::1", b"localhost"}:
            raise RuntimeError("Impact runner blocked non-loopback DNS")
        return original_resolve(host, *args, **kwargs)

    socket.socket.connect = connect  # type: ignore[assignment]
    socket.socket.connect_ex = connect_ex  # type: ignore[assignment]
    socket.getaddrinfo = resolve
    sys.path.insert(0, str(ROOT / "backend"))
    os.chdir(ROOT / "backend")
    from app.settings import Settings

    Settings.model_config["env_file"] = None


def settings(folder: Path, **extra: Any) -> Any:
    from app.settings import Settings

    return Settings(
        app_env="test",
        coach_mode="offline",
        auth_mode="local",
        v1_enabled=True,
        moderation_mode="fixture",
        face_mode="fixture",
        rate_limits_enabled=False,
        merchant_database=str(folder / "merchant.sqlite3"),
        recall_path=str(folder / "vectors"),
        media_dir=str(folder / "media"),
        **extra,
    )


def summary(values: list[float]) -> dict[str, Any]:
    from app.latency import percentile

    return {
        "n": len(values),
        "p50_ms": round(percentile(values, 0.5), 3),
        "p95_ms": round(percentile(values, 0.95), 3),
    }


def make_photos(fixtures: dict[str, Any]) -> list[Path]:
    from PIL import Image, ImageDraw, ImageFont

    folder = Path(__file__).with_name("fixtures")
    folder.mkdir(exist_ok=True)
    paths = []
    for shop in fixtures["shops"]:
        image = Image.new("RGB", (900, 420), "white")
        draw = ImageDraw.Draw(image)
        font = ImageFont.load_default(size=30)
        draw.text((30, 25), f"{shop['name']} - SYNTHETIC MENU (SGD)", fill="black", font=font)
        for i, (name, price) in enumerate(shop["menu"]):
            draw.text((30, 115 + 80 * i), name, fill="black", font=font)
            draw.text((680, 115 + 80 * i), price, fill="black", font=font)
        path = folder / f"{shop['id']}.png"
        image.save(path)
        paths.append(path)
    return paths


def photo_measure(client: Any, fixtures: dict[str, Any]) -> list[dict[str, Any]]:
    results = []
    for shop, path in zip(fixtures["shops"], make_photos(fixtures), strict=True):
        started = time.perf_counter()
        response = client.post(
            "/api/v1/photos?currency=SGD",
            content=path.read_bytes(),
            headers={"content-type": "image/png"},
        )
        assert response.status_code == 200, response.status_code
        body = response.json()
        predicted = body["extraction"]["products"]
        truth = {name.casefold(): Decimal(price) for name, price in shop["menu"]}
        remaining = dict(truth)
        tp = exact = 0
        for item in predicted:
            key = item["name"].strip().casefold()
            if key in remaining:
                tp += 1
                exact += Decimal(str(item["price"])) == remaining.pop(key)
        results.append(
            {
                "fixture": str(path.relative_to(ROOT)).replace("\\", "/"),
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                "ground_truth": shop["menu"],
                "predicted": predicted,
                "tp": tp,
                "fp": len(predicted) - tp,
                "fn": len(truth) - tp,
                "price_exact": exact,
                "price_matched_denominator": tp,
                "price_all_truth_denominator": len(truth),
                "uncertain": body["extraction"]["uncertain"],
                "elapsed_ms": (time.perf_counter() - started) * 1000,
            }
        )
    return results


def search_measure(client: Any, app: Any, fixtures: dict[str, Any]) -> dict[str, Any]:
    from app.merchant import BusinessFields, ProductFields, ProposalRequest

    store = app.state.merchant
    labels = {}
    for shop in fixtures["shops"]:
        for variant in range(fixtures["search"]["variants_per_type"]):
            label = f"{shop['id']}-{variant}"
            proposal = store.propose(
                "impact-search-owner",
                ProposalRequest(
                    kind="business",
                    business=BusinessFields(
                        name=f"{shop['name']} {variant}",
                        category=shop["category"],
                        location=shop["location"],
                        currency="SGD",
                        hours="24 hours",
                        lat=1.2847 + variant * 0.0001,
                        lng=103.832,
                        halal="yes" if variant % 2 == 0 else "no",
                        vegetarian_options=variant % 2 == 0,
                        locally_made=variant < 3,
                    ),
                    products=[
                        ProductFields(name=name, price=int(Decimal(price) * 100), unit="item")
                        for name, price in shop["menu"]
                    ]
                    + [
                        ProductFields(
                            name="Sold out special",
                            price=100,
                            available=False,
                            unit="item",
                        )
                    ],
                ),
            )
            bid = store.commit("impact-search-owner", proposal["id"], proposal["digest"])[
                "business_id"
            ]
            store.share("impact-search-owner", bid, True)
            labels[bid] = label
    rows = []
    for case in fixtures["search"]["queries"]:
        started = time.perf_counter()
        response = client.post(
            "/api/v1/discover/ask",
            json={
                "q": case["q"],
                "lat": 1.2847,
                "lng": 103.832,
                "language": "en",
                "radius": 4000,
            },
        )
        assert response.status_code == 200, response.status_code
        body = response.json()
        assert body["mode"] == "keywords"
        # Evaluate the primary ranked local group. Offline Google-place fixtures are separate.
        best: list[dict[str, Any]] = next(
            (g["places"] for g in body["groups"] if g["id"] == "best"), []
        )
        ranked = [labels.get(p["id"], f"unexpected:{p['id']}") for p in best]
        assert len(ranked) == len(set(ranked)), "Duplicate results in primary group"
        hits = sum(label in case["relevant"] for label in ranked[:5])
        rows.append(
            {
                **case,
                "ranked": ranked,
                "hits_at_5": hits,
                "precision_at_5": hits / 5,
                "returned_at_5": len(ranked[:5]),
                "intent": body["intent"],
                "elapsed_ms": (time.perf_counter() - started) * 1000,
            }
        )
    positive = [r for r in rows if r["relevant"]]
    return {
        "corpus_n": len(labels),
        "queries": rows,
        "macro_precision_at_5": sum(r["precision_at_5"] for r in rows) / len(rows),
        "positive_macro_precision_at_5": sum(r["precision_at_5"] for r in positive) / len(positive),
    }


async def latency_measure(folder: Path) -> dict[str, Any]:
    from app.auth import Principal
    from app.coordinator import MerchantContext, current
    from app.latency import stats
    from app.merchant import MerchantStore
    from app.streaming import CoachRuntime
    from google.adk.sessions import InMemorySessionService
    from scripts.latency_bench import COMMON, seed

    store = MerchantStore(str(folder / "latency.sqlite3"))
    uid = "impact-latency-owner"
    bid = seed(store, uid)
    rows: list[dict[str, Any]] = []
    stats.samples.clear()
    for instant in (True, False):
        runtime = CoachRuntime(
            settings(folder, instant_path_enabled=instant), InMemorySessionService()
        )
        for repeat in range(10):
            sid = await runtime.session(Principal(uid, "local"), None, bid)
            for message in COMMON:
                token = current.set(MerchantContext(store, uid, bid, []))
                started = time.perf_counter()
                first_visible = first_delta = complete = None
                events = []
                try:
                    async for event in runtime.text_events(
                        Principal(uid, "local"), sid, message, "en"
                    ):
                        elapsed = (time.perf_counter() - started) * 1000
                        events.append(event.kind)
                        assert event.kind != "error", "Offline turn failed"
                        if first_visible is None and event.kind in {
                            "delta",
                            "reply",
                            "proposal",
                            "chart",
                            "action",
                            "suppliers",
                        }:
                            first_visible = elapsed
                        if first_delta is None and event.kind == "delta":
                            first_delta = elapsed
                        if event.kind == "turn_complete":
                            complete = elapsed
                finally:
                    current.reset(token)
                assert first_visible is not None and complete is not None
                rows.append(
                    {
                        "flow": "text_instant" if instant else "text_agent",
                        "repeat": repeat,
                        "message": message,
                        "events": events,
                        "first_visible_ms": first_visible,
                        "first_delta_ms": first_delta,
                        "complete_ms": complete,
                    }
                )
    result = {
        "samples": rows,
        "existing_stats": stats.summary(),
        "existing_stats_samples_ms": {k: list(v) for k, v in stats.samples.items()},
    }
    for flow in ("text_instant", "text_agent"):
        samples = [r for r in rows if r["flow"] == flow]
        result[flow] = {
            metric: summary([r[metric] for r in samples if r[metric] is not None])
            for metric in ("first_visible_ms", "first_delta_ms", "complete_ms")
        }
    return result


def measure() -> None:
    from app.main import create_app
    from fastapi.testclient import TestClient
    from google.adk.sessions import InMemorySessionService

    fixtures = json.loads(FIXTURES.read_text(encoding="utf-8"))
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as directory:
        folder = Path(directory)
        app = create_app(settings(folder), InMemorySessionService())
        with TestClient(app) as client:
            client.get("/api/v1/bootstrap")
            version = client.get("/api/v1/me").json()["legal_version"]
            assert (
                client.post(
                    "/api/v1/consent",
                    json={"version": version, "terms": True, "privacy": True},
                ).status_code
                == 200
            )
            photos = photo_measure(client, fixtures)
            search = search_measure(client, app, fixtures)
        latency = asyncio.run(latency_measure(folder))
    # Recalculate historical full-turn times, without replaying or calling the model.
    recorded_path = OUT / "coach-eval-gemini-3.5-flash.json"
    recorded = json.loads(recorded_path.read_text(encoding="utf-8"))
    historical = [
        {
            "scenario": r["scenario"],
            "complete_ms": r["seconds"] * 1000,
            "passed": r["passed"],
        }
        for r in recorded
        if "seconds" in r
    ]
    multi_turn = [
        {
            "scenario": r["scenario"],
            "turn": i + 1,
            "complete_ms": turn["seconds"] * 1000,
        }
        for r in recorded
        for i, turn in enumerate(r.get("turns", []))
        if "seconds" in turn
    ]
    result = {
        "commit": subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True
        ).strip(),
        "measured_at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "platform": platform.platform(),
        "python": platform.python_version(),
        "fixtures_sha256": hashlib.sha256(FIXTURES.read_bytes()).hexdigest(),
        "photos": photos,
        "search": search,
        "latency": latency,
        "recorded": {
            "source": str(recorded_path.relative_to(ROOT)).replace("\\", "/"),
            "sha256": hashlib.sha256(recorded_path.read_bytes()).hexdigest(),
            "samples": historical,
            "untimed_scenarios": [r["scenario"] for r in recorded if "seconds" not in r],
            "multi_turn_samples": multi_turn,
            "multi_turn_complete": summary([r["complete_ms"] for r in multi_turn]),
            "complete": summary([r["complete_ms"] for r in historical]),
        },
    }
    OUT.mkdir(exist_ok=True)
    (OUT / "results.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print("Saved offline photo, search and coach measurements.")


def serve() -> None:
    import uvicorn
    from app.main import create_app
    from google.adk.sessions import InMemorySessionService

    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as directory:
        config = settings(Path(directory))
        config.recall_path = os.getenv("RECALL_PATH", "data/test-vectors")
        web = int(os.getenv("WEB_PORT", "3791"))
        config.allowed_origins = [f"http://127.0.0.1:{web}"]
        config.customer_origin = f"http://127.0.0.1:{web}"
        uvicorn.run(
            create_app(config, InMemorySessionService()),
            host="127.0.0.1",
            port=int(os.getenv("API_PORT", "3891")),
            access_log=False,
            workers=1,
            ws_max_size=32768,
            ws_max_queue=8,
        )


if __name__ == "__main__":
    isolate()
    if sys.argv[1] == "measure":
        measure()
    elif sys.argv[1] == "serve":
        serve()
    elif sys.argv[1] == "build":
        raise SystemExit(
            subprocess.run(
                [
                    "node",
                    "node_modules/vite/bin/vite.js",
                    "build",
                    "--config",
                    "scripts/impact/vite.config.ts",
                ],
                cwd=ROOT,
                check=False,
            ).returncode
        )
    elif sys.argv[1] == "pytest":
        import pytest

        raise SystemExit(pytest.main(sys.argv[2:]))
    else:
        module = sys.argv.pop(1)
        runpy.run_module(module, run_name="__main__")
