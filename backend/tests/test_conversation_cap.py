import asyncio

from google.adk.sessions import InMemorySessionService

from app.auth import Principal
from app.settings import Settings
from app.streaming import APP_NAME, MAX_CONVERSATIONS, CoachRuntime


def test_a_full_account_still_starts_new_conversations_and_clears_the_oldest() -> None:
    """Regression: after 20 conversations every new chat and voice session got 429 forever."""
    sessions = InMemorySessionService()
    runtime = CoachRuntime(Settings(_env_file=None), sessions)
    owner = Principal("owner-1", "local")

    async def run() -> None:
        made = [await runtime.session(owner, None, "shop-1") for _ in range(MAX_CONVERSATIONS)]
        newest = await runtime.session(owner, None, "shop-1")
        listing = await sessions.list_sessions(app_name=APP_NAME, user_id=owner.uid)
        kept = {item.id for item in listing.sessions}
        assert len(kept) == MAX_CONVERSATIONS
        assert newest in kept and made[-1] in kept
        assert made[0] not in kept  # the oldest one made room

    asyncio.run(run())
