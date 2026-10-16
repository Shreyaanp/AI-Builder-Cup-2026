"""Import every shared shop's items into the Recommendations AI catalog; optionally start the
"Similar items" model.

Usage (from backend/):
  uv run python -m scripts.retail_sync --dry-run                      # shape only, print counts
  uv run python -m scripts.retail_sync --project ichiropractic        # real import
  uv run python -m scripts.retail_sync --project ichiropractic --train --prune
  uv run python -m scripts.retail_sync --project ichiropractic --status

Reads shops from the production Firestore merchant store (read-only). Only customer-visible item
fields are sent. A real project is only touched with an explicit --project.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from typing import Any

import httpx

from app.retail_recs import MODEL_ID, SERVING_CONFIG_ID, RetailClient, catalog_products

CONSOLE_STEPS = f"""Create it once in the console, then rerun with --train for the serving config:
  https://console.cloud.google.com/ai/retail/catalogs/default_catalog/models?project=ichiropractic
  Create model -> Similar items -> name "Similar items", ID {MODEL_ID}, filtering by tags/attributes
  on -> Create. Serving config ID: {SERVING_CONFIG_ID}."""


def load_shops(project: str, database: str, namespace: str) -> list[dict[str, Any]]:
    from google.cloud import firestore

    from app.merchant_firestore import FirestoreMerchantStore

    store = FirestoreMerchantStore(firestore.Client(project=project, database=database), namespace)
    return store.shared_shops()


def wait(client: RetailClient, names: list[str], timeout: float = 300.0) -> list[dict[str, Any]]:
    done: list[dict[str, Any]] = []
    deadline = time.monotonic() + timeout
    for name in names:
        while True:
            op = client.operation(name)
            if op.get("done") or time.monotonic() > deadline:
                done.append(op)
                break
            time.sleep(3)
    return done


def status(client: RetailClient) -> dict[str, Any]:
    model = client.model() or {}
    return {
        "products": len(client.list_product_ids()),
        "model": {
            key: model.get(key)
            for key in ("name", "trainingState", "servingState", "dataState", "createTime")
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--project", help="Google Cloud project (required for a real run)")
    parser.add_argument("--source-project", help="Firestore project (defaults to --project)")
    parser.add_argument("--database", default="(default)")
    parser.add_argument("--namespace", default="ogoogle_ai_v1")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--prune", action="store_true", help="Delete products no longer shared")
    parser.add_argument("--train", action="store_true", help="Create the Similar items model")
    parser.add_argument("--status", action="store_true", help="Only print catalog/model status")
    args = parser.parse_args()
    source = args.source_project or args.project
    if not source:
        parser.error("pass --project (or --source-project with --dry-run)")
    if not args.dry_run and not args.project:
        parser.error("a real run needs --project")

    client = RetailClient(args.project) if args.project else None
    if args.status and client:
        print(json.dumps(status(client), indent=2))
        return 0

    shops = load_shops(source, args.database, args.namespace)
    products = catalog_products(shops)
    demo = sum(1 for p in products if p["attributes"]["demo"]["text"] == ["true"])
    print(f"{len(shops)} shared shops -> {len(products)} products ({demo} demo)")
    if args.dry_run or client is None:
        print(json.dumps(products[:2], indent=2, ensure_ascii=False))
        return 0

    ops = wait(client, client.import_products(products))
    failures = sum(int(op.get("metadata", {}).get("failureCount", 0) or 0) for op in ops)
    errors = [e for op in ops for e in op.get("response", {}).get("errorSamples", [])]
    print(f"imported in {len(ops)} batches; failures={failures}")
    for error in errors[:5]:
        print("  error:", error.get("message"))

    if args.prune:
        keep = {p["id"] for p in products}
        stale = [pid for pid in client.list_product_ids() if pid not in keep]
        for pid in stale:
            client.delete_product(pid)
        print(f"pruned {len(stale)} products")

    if args.train:
        if client.model() is None:
            try:
                op = client.create_similar_items_model()
                print("model creation:", op.get("name"))
            except httpx.HTTPStatusError as error:
                # Seen 16 Oct 2026: the API rejects every objective (and none) for similar-items.
                print("model creation refused:", error.response.text.strip()[:300])
                print(CONSOLE_STEPS)
        if client.model() is not None:
            print("serving config:", client.ensure_serving_config().get("name"))
    print(json.dumps(status(client), indent=2))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
