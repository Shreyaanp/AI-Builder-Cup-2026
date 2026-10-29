"""Operator removal of a shop (OB-136): really erase it, never only hide it.

A shop removed by hand used to be flagged (deleting, public=false) and left in the database. This
runs the same erase steps as the owner's own "Delete all my data" (app/erasure.py). Erasure is
owner-scoped: the shop's owner loses every record of their account (all their shops, photos,
face data, memory and conversations), so an owner who has other shops is refused unless every
one of them is named. Sample shops (demo-…) are never removed here.

Dry run by default: it only reports. Nothing is erased without --apply, and a real Firestore
project also needs --project naming it. Nothing runs this automatically.

Usage (from backend/, with the environment of the server whose data it removes):
  uv run python -m scripts.remove_shop --shop BID            # what would be erased
  uv run python -m scripts.remove_shop --sealed              # also every half-deleted shop
  uv run python -m scripts.remove_shop --shop BID --apply --project PROJECT
Output names shops by ID and owners by a short hash; never names, emails or UIDs.
"""

from __future__ import annotations

import argparse
import hashlib
import os
import sys
from dataclasses import dataclass, field
from types import SimpleNamespace
from typing import Any, cast

import anyio
from fastapi import FastAPI, Request

from app import erasure
from app.merchant import DEMO_ID, MerchantRepository


@dataclass
class Plan:
    # Owner UID -> the shops erased with them.
    owners: dict[str, list[str]] = field(default_factory=dict)
    # Owner UID -> their other shops that were not named (refused).
    refused: dict[str, list[str]] = field(default_factory=dict)
    # Named shops with no owner left: nothing the owner erasure can reach.
    orphans: list[str] = field(default_factory=list)
    samples: list[str] = field(default_factory=list)


def tag(uid: str) -> str:
    return "owner#" + hashlib.sha256(uid.encode()).hexdigest()[:8]


def plan(store: MerchantRepository, shops: list[str], sealed: bool = False) -> Plan:
    targets = list(dict.fromkeys([*shops, *(store.sealed_shops() if sealed else [])]))
    result = Plan()
    for bid in targets:
        if DEMO_ID.fullmatch(bid):
            result.samples.append(bid)
            continue
        owners = store.owners(bid)
        if not owners:
            result.orphans.append(bid)
        for uid in owners:
            result.owners.setdefault(uid, []).append(bid)
    for uid in list(result.owners):
        others = [b["id"] for b in store.list_businesses(uid) if b["id"] not in targets]
        if others:
            result.refused[uid] = others
            del result.owners[uid]
    return result


def report(result: Plan) -> None:
    for uid, bids in result.owners.items():
        print(f"  {tag(uid)}: erase account and shops {', '.join(bids)}")
    for uid, others in result.refused.items():
        print(
            f"  {tag(uid)}: REFUSED, also owns {', '.join(others)}; name every one with --shop "
            "to erase this owner"
        )
    for bid in result.orphans:
        print(f"  {bid}: no owner found (already erased, or needs a manual look)")
    for bid in result.samples:
        print(f"  {bid}: sample shop, kept")
    if not (result.owners or result.refused or result.orphans or result.samples):
        print("  Nothing to remove.")


async def remove(app: FastAPI, result: Plan) -> bool:
    """Erase each planned owner on an app whose services are running; True when all finished."""
    request = cast(Request, SimpleNamespace(app=app))
    finished = True
    for uid in result.owners:
        outcome = await erasure.erase(request, uid)
        pending = outcome["pending"]
        finished = finished and not pending
        print(
            f"  {tag(uid)}: {outcome['status']}, {outcome['businesses']} shop(s)"
            + (f"; pending {', '.join(pending)} (run again to retry)" if pending else "")
        )
    return finished


def parse(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--shop", action="append", default=[], help="shop ID; repeat for more")
    parser.add_argument(
        "--sealed", action="store_true", help="also every shop marked deleting but still stored"
    )
    parser.add_argument("--apply", action="store_true", help="erase (default: dry run)")
    parser.add_argument("--project", help="required with --apply on a real Firestore project")
    return parser.parse_args(argv)


def refusal(args: argparse.Namespace, settings: Any) -> str:
    if not args.shop and not args.sealed:
        return "Name a shop with --shop, or pass --sealed."
    real = settings.merchant_backend == "firestore" and not os.getenv("FIRESTORE_EMULATOR_HOST")
    if args.apply and real and args.project != settings.google_cloud_project:
        return "Refusing: --apply on a real Firestore project needs --project naming it."
    return ""


async def run(app: FastAPI, args: argparse.Namespace) -> int:
    """The work on an app whose services are already running (the lifespan has started)."""
    settings = app.state.v1_settings
    reason = refusal(args, settings)
    if reason:
        print(reason, file=sys.stderr)
        return 2
    target = (
        f"SQLite {settings.merchant_database}"
        if settings.merchant_backend == "sqlite"
        else f"Firestore {settings.google_cloud_project} / {settings.firestore_namespace}"
    )
    print(f"Target: {target}")
    result = await anyio.to_thread.run_sync(plan, app.state.merchant, args.shop, args.sealed)
    report(result)
    if not args.apply:
        print("Dry run: nothing erased. Pass --apply to erase.")
        return 0
    finished = await remove(app, result)
    return 0 if finished and not result.refused else 1


def main(argv: list[str] | None = None) -> int:
    from app.main import create_app
    from app.settings import Settings

    args = parse(argv)
    app = create_app(Settings())

    async def start() -> int:
        async with app.router.lifespan_context(app):
            return await run(app, args)

    return anyio.run(start)


if __name__ == "__main__":
    raise SystemExit(main())
