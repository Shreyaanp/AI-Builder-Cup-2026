"""Owner erasure ("Delete all my data"), step by step.

Every step runs on its own: one failing (face worker down, storage 403, Firestore error) never
stops the others. Steps that fail are remembered per owner (community documents, kind
`erase_pending`) together with the shop IDs they still need, so a retry finishes them even after
the shop records themselves are gone. Retries run when the owner presses Try again (the same
DELETE, every step again) and in the background on the owner's next `GET /me` (only the pending
steps, only for the remembered shops, and never the records step: shops the owner saved since
must not vanish without a new request).
"""

import time
from collections.abc import Awaitable, Callable
from typing import Any

import anyio
import structlog
from fastapi import Request

from . import trust
from .streaming import APP_NAME
from .threads import thread_signals

log = structlog.get_logger()

# Order matters: face and photos first (the most sensitive), then records (which yields the shop
# IDs the shop-scoped steps need), then copies, memory and conversations.
STEPS = (
    "face",
    "photos",
    "records",
    "reminders",
    "gallery",
    "community",
    "analytics",
    "memory",
    "conversations",
)
PENDING_KIND = "erase_pending"


class StepFailed(Exception):
    """A step finished some of its work; `left` is what still needs a retry (e.g. shop IDs)."""

    def __init__(self, reason: str, left: list[str] | None = None) -> None:
        super().__init__(reason)
        self.left = left or []


def _docs(request: Request) -> Any:
    community = getattr(request.app.state, "community", None)
    return getattr(community, "docs", None)


async def pending(request: Request, uid: str) -> dict[str, Any] | None:
    """What an earlier erasure still has to finish for this owner, or None."""
    docs = _docs(request)
    if docs is None:
        return None
    try:
        return await anyio.to_thread.run_sync(docs.get, PENDING_KIND, uid)
    except Exception as error:
        log.warning("erase_pending_read_failed", error=str(error)[:300])
        return None


async def _remember(request: Request, uid: str, failed: dict[str, list[str]]) -> bool:
    """Persist the retry list (or clear it when nothing is left). False when it could not be."""
    docs = _docs(request)
    if docs is None:
        return not failed
    try:
        if failed:
            data = {"steps": failed, "updated": time.time()}
            await anyio.to_thread.run_sync(docs.put, PENDING_KIND, uid, uid, time.time(), data)
        else:
            await anyio.to_thread.run_sync(docs.delete, PENDING_KIND, uid)
        return True
    except Exception as error:
        # The response still lists what is pending, so the owner can press Try again.
        log.error("erase_pending_write_failed", error=str(error)[:300], steps=sorted(failed))
        return False


async def _face(request: Request, uid: str) -> None:
    # The encrypted template, the check result and reviews about this owner live in the
    # shared document store (the worker keeps nothing).
    store = _docs(request)
    if store is None:
        return
    try:
        await anyio.to_thread.run_sync(trust.erase, store, uid)
    except Exception as error:
        raise StepFailed(f"face data not erased: {type(error).__name__}") from error


async def erase(request: Request, uid: str, only: set[str] | None = None) -> dict[str, Any]:
    """Run the erase steps (all, or `only` these) and report each one."""
    state = request.app.state
    earlier: dict[str, list[str]] = ((await pending(request, uid)) or {}).get("steps", {})
    # Shop IDs come from the earlier attempt and, while the records still exist, from the store,
    # so gallery and community copies are erased even when the records step fails.
    shop_steps = ("gallery", "community", "analytics", "memory")
    bids: list[str] = list(dict.fromkeys(b for step in shop_steps for b in earlier.get(step, [])))
    store = state.merchant
    if only is None:
        try:
            listed = await anyio.to_thread.run_sync(store.list_businesses, uid)
            bids += [b["id"] for b in listed if b["id"] not in bids]
        except Exception as error:
            log.warning("erase_list_businesses_failed", error=str(error)[:300])
    counts = {"businesses": 0, "photos": 0, "conversations": 0}

    async def photos() -> None:
        if state.photos is not None:
            counts["photos"] = await anyio.to_thread.run_sync(state.photos.erase_owner_sync, uid)

    async def records() -> None:
        erased = await anyio.to_thread.run_sync(store.erase_owner, uid)
        counts["businesses"] = len(erased)
        bids.extend(bid for bid in erased if bid not in bids)
        for bid in erased:
            thread_signals(request).wake(bid)

    async def per_shop(step: Callable[[str], Any]) -> None:
        left = []
        for bid in list(bids):
            try:
                await anyio.to_thread.run_sync(step, bid)
            except Exception as error:
                log.warning("erase_shop_step_failed", shop=bid, error=str(error)[:300])
                left.append(bid)
        if left:
            raise StepFailed(f"{len(left)} shop(s) left", left)

    async def gallery() -> None:
        if state.photos is not None:
            await per_shop(state.photos.delete_gallery_sync)

    async def reminders() -> None:
        await anyio.to_thread.run_sync(store.feature_docs.delete, "push_subscriptions", uid)

    async def community() -> None:
        if getattr(state, "community", None) is not None:
            await per_shop(state.community.erase_shop)

    async def analytics() -> None:
        # Aggregated daily rows in BigQuery, keyed by the shops' pseudonyms.
        if getattr(state, "analytics", None) is not None:
            await state.analytics.forget(bids)

    async def memory() -> None:
        if state.recall:
            await anyio.to_thread.run_sync(state.recall.forget, uid, bids)

    async def conversations() -> None:
        sessions = state.services.runtime.sessions
        listing = await sessions.list_sessions(app_name=APP_NAME, user_id=uid)
        left = 0
        for session in listing.sessions:
            try:
                await sessions.delete_session(app_name=APP_NAME, user_id=uid, session_id=session.id)
                counts["conversations"] += 1
            except Exception as error:
                log.warning("erase_conversation_failed", error=str(error)[:300])
                left += 1
        if left:
            raise StepFailed(f"{left} conversation(s) left")

    runners: dict[str, Callable[[], Awaitable[None]]] = {
        "face": lambda: _face(request, uid),
        "photos": photos,
        "records": records,
        "reminders": reminders,
        "gallery": gallery,
        "community": community,
        "analytics": analytics,
        "memory": memory,
        "conversations": conversations,
    }
    done: list[str] = []
    # A partial run keeps whatever it did not attempt.
    failed: dict[str, list[str]] = (
        {} if only is None else {k: v for k, v in earlier.items() if k not in only}
    )
    for name in STEPS:
        if only is not None and name not in only:
            continue
        try:
            await runners[name]()
            done.append(name)
        except Exception as error:
            # Never a bare 500: log it, remember it, keep going.
            left = error.left if isinstance(error, StepFailed) else []
            log.error("erase_step_failed", step=name, error=str(error)[:300], retry=True)
            failed[name] = left or (list(bids) if name in shop_steps else [])
    saved = await _remember(request, uid, failed)
    log.info("erase_finished", erased=done, pending=sorted(failed), saved=saved)
    return {
        "status": "partial" if failed else "erased",
        "erased": done,
        "pending": [name for name in STEPS if name in failed],
        # Pending steps are retried on Try again and on the next visit, unless saving failed.
        "retry_saved": saved,
        **counts,
    }


async def retry_quietly(request: Request, uid: str, steps: list[str]) -> None:
    """Background retry of an earlier partial erasure's pending steps; never raises."""
    only = set(steps) - {"records"}
    if not only:
        return
    try:
        await erase(request, uid, only=only)
    except Exception as error:
        log.error("erase_retry_failed", error=str(error)[:300])
