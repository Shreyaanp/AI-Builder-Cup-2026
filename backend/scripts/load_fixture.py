"""Isolated loopback-only offline server for load evidence; no provider credentials."""

import tempfile
from pathlib import Path

import uvicorn
from google.adk.sessions import InMemorySessionService

from app.main import create_app
from app.merchant import BusinessFields, MerchantStore, ProductFields, ProposalRequest
from app.settings import Settings


def run() -> None:
    with tempfile.TemporaryDirectory(prefix="chalkboard-load-") as directory:
        root = Path(directory)
        settings = Settings(
            _env_file=None,
            app_env="test",
            auth_mode="local",
            coach_mode="offline",
            session_backend="sqlite",
            merchant_backend="sqlite",
            v1_enabled=True,
            rate_limits_enabled=False,
            demo_world_enabled=False,
            forecast_backend="weekday_average",
            weather_backend="offline",
            moderation_mode="fixture",
            maps_server_key=None,
            maps_browser_key=None,
            media_bucket="",
            merchant_database=str(root / "merchant.sqlite3"),
            recall_path=str(root / "recall"),
            release_commit="local-load-fixture",
        )
        store = MerchantStore(settings.merchant_database)
        bids = []
        for i in range(10):
            proposal = store.propose(
                "load-fixture",
                ProposalRequest(
                    kind="business",
                    business=BusinessFields(
                        name=f"Offline load shop {i}",
                        category="Tea stall",
                        location="Singapore",
                        lat=1.28 + i * 0.001,
                        lng=103.84,
                    ),
                    products=[ProductFields(name="Tea", price=150, unit="cup")],
                ),
            )
            bid = store.commit("load-fixture", proposal["id"], proposal["digest"])["business_id"]
            store.share("load-fixture", bid, True)
            bids.append(bid)
        app = create_app(settings, InMemorySessionService())

        @app.get("/load-fixture")
        async def fixture() -> dict[str, object]:
            return {"shops": bids, "fixture": "local-load-fixture"}

        uvicorn.run(app, host="127.0.0.1", port=3398, access_log=False, log_level="error")


if __name__ == "__main__":
    run()
