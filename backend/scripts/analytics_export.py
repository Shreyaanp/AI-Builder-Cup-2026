"""Run the owner-analytics export by hand: a backfill, or a check before the scheduler is set up.

Uses the same code as the nightly job and the app's merchant store settings from the environment.
Read-only on merchant records; writes only aggregated rows to BigQuery.

    MERCHANT_BACKEND=firestore V1_ENABLED=true GOOGLE_CLOUD_PROJECT=ichiropractic \
    ANALYTICS_BACKEND=bigquery uv run python scripts/analytics_export.py --days 30
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.analytics import BigQuery, export  # noqa: E402
from app.main import merchant_services  # noqa: E402
from app.settings import Settings  # noqa: E402


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=2, help="Days back from yesterday (UTC)")
    args = parser.parse_args()
    settings = Settings()
    if settings.analytics_backend != "bigquery" or not settings.google_cloud_project:
        raise SystemExit("Set ANALYTICS_BACKEND=bigquery and GOOGLE_CLOUD_PROJECT.")
    repository, recall = merchant_services(settings)
    if repository is None:
        raise SystemExit("Set V1_ENABLED=true and the merchant backend.")
    today = datetime.now(UTC).date()
    days = [today - timedelta(days=i) for i in range(max(1, min(args.days, 60)), 0, -1)]
    try:
        print(json.dumps(await export(repository, BigQuery(settings), settings, days)))
    finally:
        if recall is not None:
            recall.close()


if __name__ == "__main__":
    asyncio.run(main())
