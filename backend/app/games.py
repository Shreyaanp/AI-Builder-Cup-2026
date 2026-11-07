"""The game layer on top of the passport: scratch cards, collection sets, the neighbourhood co-op
goal, streak freezes planned ahead, and shop social proof.

Each mechanic and the behavioural research behind it are documented in the code. The
rules stay honest: rewards only follow a verified stamp (never money), the server decides every
outcome and publishes the odds, nothing expires, and demo shops only ever earn demo points.

Everything here is a pure function over the customer's PassportState, saved atomically by the
caller, except the two shared documents (the co-op tally and a shop's "tried" count), which go
through the same community Documents store on SQLite and Firestore.
"""

from __future__ import annotations

import hashlib
import secrets
import time
from collections.abc import Callable
from datetime import date, timedelta
from typing import Any, Literal

from pydantic import BaseModel

from .passport import (
    PassportState,
    PrizeKind,
    ScratchTicket,
    StampRecord,
    WonPerk,
    is_food,
    local_now,
    makes_own,
    member_id,
    monday_of,
    streak,
    week_of,
)

# --- Endowed progress ---

# A shop card is printed with 2 welcome stamps on top of the owner's target: a 10-visit card
# shows 12 slots with 2 already filled, so the owner's economics are unchanged and the customer
# starts 2 stamps in (Nunes & Drèze 2006).
WELCOME_STAMPS = 2

# --- Scratch cards (variable reward with published odds) ---

PRIZE_POINTS: dict[PrizeKind, int] = {"points_10": 10, "points_25": 25}
# Percent weights. When the shop has no scratch perk, its share moves to the small bonus, so the
# odds always add up to 100 and every customer sees exactly the table that applies to them.
ODDS_WITH_PERK: tuple[tuple[PrizeKind, int], ...] = (
    ("points_10", 45),
    ("points_25", 20),
    ("perk", 10),
    ("freeze", 5),
    ("again", 20),
)
ODDS_NO_PERK: tuple[tuple[PrizeKind, int], ...] = (
    ("points_10", 55),
    ("points_25", 20),
    ("freeze", 5),
    ("again", 20),
)
# The very first card always wins (stated in the odds): a first experience that teaches the
# mechanic without a loss.
FIRST_PRIZE: PrizeKind = "points_25"
MAX_TICKETS_KEPT = 20


class Odd(BaseModel):
    prize: PrizeKind
    percent: int


def odds(has_perk: bool) -> list[Odd]:
    table = ODDS_WITH_PERK if has_perk else ODDS_NO_PERK
    return [Odd(prize=prize, percent=weight) for prize, weight in table]


Draw = Callable[[int], int]  # n -> a uniform integer in [0, n)


def draw(has_perk: bool, below: Draw = secrets.randbelow) -> PrizeKind:
    table = ODDS_WITH_PERK if has_perk else ODDS_NO_PERK
    roll = below(sum(weight for _, weight in table))
    for prize, weight in table:
        if roll < weight:
            return prize
        roll -= weight
    return table[-1][0]


def issue_scratch(
    state: PassportState,
    record: StampRecord,
    perk_text: str,
    below: Draw = secrets.randbelow,
) -> ScratchTicket:
    """A verified stamp earns one card. The prize is drawn now, on the server, and kept there."""
    has_perk = bool(perk_text)
    first = state.scratches == 0
    prize = FIRST_PRIZE if first else draw(has_perk, below)
    ticket = ScratchTicket(
        id=secrets.token_hex(8),
        shop_id=record.shop_id,
        shop_name=record.shop_name,
        day=record.day,
        at=record.at,
        demo=record.demo,
        first=first,
        has_perk=has_perk,
        prize=prize,
        perk_text=perk_text if prize == "perk" else "",
    )
    state.scratch = [ticket, *state.scratch][:MAX_TICKETS_KEPT]
    state.scratches += 1
    return ticket


def reveal(
    state: PassportState, ticket_id: str, now: float, zone: str = "UTC"
) -> ScratchTicket | None:
    """Scratching applies the prize once; scratching again shows the same result. `zone` is the
    ticket shop's timezone: a freeze counts for the week it is scratched in there."""
    ticket = next((t for t in state.scratch if t.id == ticket_id), None)
    if ticket is None or ticket.revealed:
        return ticket
    ticket.revealed = True
    points = PRIZE_POINTS.get(ticket.prize, 0)
    if ticket.demo:
        state.demo_points += points
    else:
        state.points += points
    if ticket.prize == "freeze":
        # Credited to the shop-local week of the scratch itself, never back-dated to the
        # visit: a streak replays freeze_wins, so an old ticket must not rewrite past weeks.
        week = week_of(local_now(zone, now).date())
        state.freeze_wins = [*state.freeze_wins, week][-20:]
    if ticket.prize == "perk" and ticket.perk_text:
        state.won_perks = [
            WonPerk(
                id=f"scratch-{ticket.id}",
                shop_id=ticket.shop_id,
                shop_name=ticket.shop_name,
                text=ticket.perk_text,
                source="scratch",
                day=ticket.day,
                demo=ticket.demo,
            ),
            *state.won_perks,
        ][:40]
    return ticket


def use_perk(state: PassportState, perk_id: str) -> bool:
    """Counter staff saw the won perk: it is marked used (kept in the history)."""
    perk = next((p for p in state.won_perks if p.id == perk_id and not p.used), None)
    if perk is None:
        return False
    perk.used = True
    return True


# --- Streak freezes planned ahead ---

FreezeVerdict = Literal["frozen", "no_freezes", "already", "not_needed"]


def plan_freeze(state: PassportState, current_week: str, which: Literal["this", "next"]) -> str:
    """Spend a banked freeze on this week (no visit yet) or next week (going away)."""
    week = current_week if which == "this" else week_of(monday_of(current_week) + timedelta(days=7))
    if week in state.frozen_weeks:
        return "already"
    if which == "this" and current_week in state.weeks:
        return "not_needed"
    if streak(state, current_week).freezes < 1:
        return "no_freezes"
    state.frozen_weeks = sorted({*state.frozen_weeks, week})[-12:]
    return "frozen"


# --- Collection sets ---

TEA_WORDS = ("tea", "chai", "kopi", "coffee", "cafe", "café", "kissaten", "teh", "espresso")
SET_POINTS = 50
SetId = Literal["chai_trail", "locally_made", "night_market"]


class SetDef(BaseModel):
    id: SetId
    need: int
    art: str


SETS = (
    SetDef(id="chai_trail", need=4, art="cup"),
    SetDef(id="locally_made", need=3, art="hands"),
    SetDef(id="night_market", need=3, art="lantern"),
)


def in_set(set_id: str, record: StampRecord) -> bool:
    if record.kind not in ("visit", "first", "rescue"):
        return False
    category = record.category.casefold()
    if set_id == "chai_trail":
        return any(word in category for word in TEA_WORDS)
    if set_id == "locally_made":
        return record.made
    if set_id == "night_market":
        return record.hour >= 18 and is_food(record.category)
    return False


def shop_in_set(set_id: str, shop: dict[str, Any]) -> bool:
    """For "stops nearby": could a stamp here count (night market: any food stall after 6 pm)."""
    category = str(shop.get("category") or "").casefold()
    if set_id == "chai_trail":
        return any(word in category for word in TEA_WORDS)
    if set_id == "locally_made":
        return makes_own(shop)
    if set_id == "night_market":
        return is_food(category)
    return False


def set_progress(state: PassportState, set_id: str) -> list[str]:
    """Distinct shops collected for the set, oldest first."""
    shops: list[str] = []
    for record in reversed(state.stamps):
        if in_set(set_id, record) and record.shop_id not in shops:
            shops.append(record.shop_id)
    return shops


def complete_sets(state: PassportState, record: StampRecord, perk_text: str) -> list[str]:
    """Sets this stamp completes: a badge, +50 points and the finishing shop's set perk."""
    done: list[str] = []
    for definition in SETS:
        if definition.id in state.sets_done or not in_set(definition.id, record):
            continue
        if len(set_progress(state, definition.id)) < definition.need:
            continue
        state.sets_done[definition.id] = record.at
        if record.demo:
            state.demo_points += SET_POINTS
        else:
            state.points += SET_POINTS
        if perk_text:
            state.won_perks = [
                WonPerk(
                    id=f"set-{definition.id}",
                    shop_id=record.shop_id,
                    shop_name=record.shop_name,
                    text=perk_text,
                    source="set",
                    day=record.day,
                    demo=record.demo,
                ),
                *state.won_perks,
            ][:40]
        done.append(definition.id)
    return done


# --- Neighbourhood co-op goal (a public-goods game with a shared reward) ---

COOP_GOAL = 100  # verified visits in one area in one week
COOP_GOAL_DEMO = 500
COOP_BONUS = 25
COOP_KEEP_HELPED = 8


def coop_key(area: str, week: str) -> str:
    return f"{area}|{week}"


def demo_coop_visits(area: str, week: str, today: date) -> int:
    """Generated neighbours' visits so a demo area shows a living bar. Always labelled demo; it
    grows through the week and stops short of the goal, so only real visits finish it."""
    seed = int(hashlib.sha256(f"coop/{area}/{week}".encode()).hexdigest()[:6], 16)
    day = min(6, max(0, (today - monday_of(week)).days))
    return min(COOP_GOAL_DEMO - 12, 160 + seed % 90 + day * 42)


class CoopStore:
    """One small shared document per area and week: the tally and who helped (hashed IDs)."""

    def __init__(self, documents: Any) -> None:
        self.docs = documents

    def get(self, area: str, week: str) -> dict[str, Any]:
        return dict(self.docs.get("coop", coop_key(area, week)) or {})

    def add(self, area: str, week: str, uid: str) -> None:
        member = member_id(uid)

        def change(data: dict[str, Any] | None) -> tuple[float, dict[str, Any]]:
            data = dict(data or {})
            helpers = dict(data.get("helpers", {}))
            helpers[member] = helpers.get(member, 0) + 1
            # Bounded: the document stays small however busy the street gets.
            if len(helpers) > 2000:
                helpers = dict(sorted(helpers.items(), key=lambda kv: -kv[1])[:2000])
            return time.time(), {"visits": int(data.get("visits", 0)) + 1, "helpers": helpers}

        self.docs.update("coop", coop_key(area, week), area, change)

    # A shop's "neighbours tried this" count: distinct passports in the last 30 days.

    def tried(self, bid: str, today: date) -> int:
        data = self.docs.get("tried", bid) or {}
        cutoff = (today - timedelta(days=30)).isoformat()
        return sum(1 for day in dict(data.get("members", {})).values() if day >= cutoff)

    def add_tried(self, bid: str, uid: str, day: str) -> None:
        member = member_id(uid)

        def change(data: dict[str, Any] | None) -> tuple[float, dict[str, Any]] | None:
            members = dict((data or {}).get("members", {}))
            if members.get(member) == day:
                return None
            members[member] = day
            if len(members) > 1000:
                members = dict(sorted(members.items(), key=lambda kv: kv[1])[-1000:])
            return time.time(), {"members": members}

        self.docs.update("tried", bid, bid, change)

    def erase_member(self, uid: str, areas: dict[str, list[str]], shops: list[str]) -> None:
        """Remove a customer from the co-op tallies they helped and the shops' tried counts."""
        member = member_id(uid)
        for bid in shops:

            def forget(data: dict[str, Any] | None) -> tuple[float, dict[str, Any]] | None:
                members = dict((data or {}).get("members", {}))
                if member not in members:
                    return None
                members.pop(member)
                return time.time(), {"members": members}

            self.docs.update("tried", bid, bid, forget)
        for area, weeks in areas.items():
            for week in weeks:

                def change(data: dict[str, Any] | None) -> tuple[float, dict[str, Any]] | None:
                    if not data or member not in data.get("helpers", {}):
                        return None
                    helpers = dict(data["helpers"])
                    given = int(helpers.pop(member))
                    return time.time(), {
                        "visits": max(0, int(data.get("visits", 0)) - given),
                        "helpers": helpers,
                    }

                self.docs.update("coop", coop_key(area, week), area, change)


def record_help(state: PassportState, area: str, week: str) -> None:
    key = coop_key(area, week)
    state.coop_helped[key] = state.coop_helped.get(key, 0) + 1
    for old in sorted(state.coop_helped, key=lambda k: k.split("|")[-1])[:-COOP_KEEP_HELPED]:
        state.coop_helped.pop(old, None)


def claim_coop(state: PassportState, area: str, week: str, demo: bool) -> bool:
    """Everyone who helped collects the shared reward once the goal is reached."""
    key = coop_key(area, week)
    if key in state.coop_claimed or not state.coop_helped.get(key):
        return False
    state.coop_claimed = [*state.coop_claimed, key][-20:]
    if demo:
        state.demo_points += COOP_BONUS
    else:
        state.points += COOP_BONUS
    return True


def demo_tried(bid: str) -> int:
    """Demo shops show a generated count, labelled demo."""
    return 6 + int(hashlib.sha256(f"tried/{bid}".encode()).hexdigest()[:4], 16) % 30


# Social proof is aggregate only and shown from this many neighbours (no single person).
TRIED_MIN = 3
