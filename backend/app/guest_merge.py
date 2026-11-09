"""OB-56: join a guest's account from before the separate sign-in change (#335) into their new one.

A phone that opened the app after #335 made a second anonymous account, so its follows and
stamps are split across two uids. This moves the old account's into the new one. It writes
customer data, so it is off unless GUEST_MERGE is set. The caller proves it holds both accounts:
its own sign-in, and the old account's still-valid ID token.

Stamps count once: a shop-day present on both sides is the one kept on the new account. The
merged uid is recorded inside the same atomic edit, so a retry can never add the points twice.
"""

from __future__ import annotations

from typing import Any

from .community import MAX_FOLLOWS, Community, Profile
from .passport import PassportState, PassportStore, StampRecord, earned_level


def _key(stamp: StampRecord) -> tuple[str, str, str]:
    return (stamp.shop_id, stamp.day, stamp.kind)


def merge_passport(target: PassportState, source: PassportState, source_uid: str) -> bool:
    """Add the old account's stamps and progress to `target`. False when already merged."""
    if source_uid in target.merged_guests:
        return False
    target.merged_guests.append(source_uid)
    held = {_key(stamp) for stamp in target.stamps}
    fresh = [stamp for stamp in source.stamps if _key(stamp) not in held]
    target.stamps = sorted([*target.stamps, *fresh], key=lambda stamp: stamp.at, reverse=True)
    target.points += sum(stamp.points for stamp in fresh if not stamp.demo)
    target.demo_points += sum(stamp.points for stamp in fresh if stamp.demo)
    moved = {stamp.shop_id for stamp in fresh}
    for shop_id, progress in source.shops.items():
        mine = target.shops.get(shop_id)
        if mine is None:
            target.shops[shop_id] = progress
            continue
        if shop_id not in moved:
            continue
        new_days = [day for day in progress.days if day not in mine.days]
        mine.days = sorted({*mine.days, *new_days})[-60:]
        mine.visits += len(new_days)
        mine.card += len(new_days)
        mine.card_day = max(mine.card_day, progress.card_day)
        mine.rescues += progress.rescues
        mine.tipped = mine.tipped or progress.tipped
    target.weeks = sorted({*target.weeks, *source.weeks})
    target.scratch = sorted(
        [*target.scratch, *source.scratch], key=lambda ticket: ticket.at, reverse=True
    )
    target.won_perks = [*target.won_perks, *source.won_perks]
    target.level = earned_level(target)
    return True


def merge_guest(
    passports: PassportStore, community: Community, source_uid: str, target_uid: str
) -> dict[str, Any]:
    """Move follows and the passport from `source_uid` to `target_uid`, once."""
    source_state = passports.get(source_uid)
    state, merged = passports.edit(
        target_uid, lambda target: merge_passport(target, source_state, source_uid)
    )
    old = community.profile(source_uid).follows

    def add_follows(profile: Profile) -> bool:
        joined = list(dict.fromkeys([*profile.follows, *old]))[:MAX_FOLLOWS]
        changed = joined != profile.follows
        profile.follows = joined
        return changed

    def clear_follows(profile: Profile) -> bool:
        changed = bool(profile.follows)
        profile.follows = []
        return changed

    profile = community.edit_profile(target_uid, add_follows)
    community.edit_profile(source_uid, clear_follows)
    # Only once the new account has everything: a failure above leaves the old one to retry.
    passports.erase(source_uid)
    return {"merged": bool(merged), "follows": len(profile.follows), "stamps": len(state.stamps)}
