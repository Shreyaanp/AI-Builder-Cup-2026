"""Simplify batch 2: every feature has a screen path and a chat path, from one shared map.

The coach used to send owners to screens that do not exist ("Grow → Supplies", "Grow →
Insights", "Shop → Details → Stamp card", a "Today" tab). Every owner `where` now has to match
the labels the owner can see, the screens read the same map (appGuide.json), and the three
screen-only features (nearby demand, send a rider, reminders) open from the chat.
"""

import json
import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.app_guide import (
    FEATURES,
    INNER_LABELS,
    TAB_LABELS,
    TABS,
    by_ask,
    explain_app,
    export,
    guide_reply,
)
from app.instant import SCREEN_RULES
from app.voice_tools import SCREENS
from tests.test_photos import app  # noqa: F401
from tests.test_public_demo import open_demo

ROOT = Path(__file__).resolve().parents[2]
OWNER = [f for f in FEATURES if f.audience == "owner"]
PATH = re.compile(r"\b(Coach|Shop|Grow|You)((?: → [^.;,\"()]+?)+)(?=[.;,\"()]|$)")


def _source_text() -> str:
    files = [*ROOT.glob("src/**/*.ts"), *ROOT.glob("src/**/*.tsx")]
    return "\n".join(f.read_text(encoding="utf-8") for f in files if "locales" not in f.parts)


def _valid(path: tuple[str, ...]) -> bool:
    if not path or path[0] not in TABS:
        return False
    if len(path) >= 2 and path[1] not in TAB_LABELS[path[0]]:
        return False
    if len(path) >= 3 and path[2] not in INNER_LABELS.get((path[0], path[1]), frozenset()):
        return False
    return len(path) <= 3


@pytest.mark.parametrize("feature", OWNER, ids=lambda f: f.id)
def test_every_owner_where_names_a_real_tab_and_row(feature):
    assert _valid(feature.path), f"{feature.id}: {feature.where} is not a screen an owner sees"
    assert "Today" not in feature.path[:1], "there is no Today tab; Today is the top of Coach"


@pytest.mark.parametrize("feature", OWNER, ids=lambda f: f.id)
def test_every_owner_feature_has_a_chat_phrase_and_screen(feature):
    for phrase in (feature.ask, feature.ask_hi):
        assert phrase.strip(), f"{feature.id} needs an English and a Hindi phrase"
        assert not re.search(r"[{}]", phrase), f"{feature.id}: unfilled placeholder in {phrase}"
    assert re.search(r"[ऀ-ॿ]", feature.ask_hi), f"{feature.id}: ask_hi is not Hindi"
    assert feature.screen in SCREENS, f"{feature.id}: open_screen has no {feature.screen}"
    assert by_ask(feature.ask) is not None


def test_screen_labels_are_the_app_copy():
    """The label list is the English UI copy, so a renamed tile fails here, not in the chat."""
    source = _source_text()
    labels = {label for rows in TAB_LABELS.values() for label in rows}
    labels |= {label for inner in INNER_LABELS.values() for label in inner}
    missing = sorted(label for label in labels if f"'{label}'" not in source)
    assert missing == []


def test_screens_read_the_same_map():
    """appGuide.json is app_guide.py's export: python -m scripts.export_app_guide."""
    shipped = json.loads((ROOT / "src/features/v1/appGuide.json").read_text(encoding="utf-8"))
    assert shipped == export()


def test_no_stale_where_left_in_coach_text():
    """Every "Tab → Row" the coach says (prompt, instant and demo replies) is a real path."""
    stale = []
    for name in ("agent.py", "demo_coach.py", "instant.py", "voice_tools.py", "app_guide.py"):
        text = (ROOT / "backend/app" / name).read_text(encoding="utf-8")
        for tab, rest in PATH.findall(text):
            path = (tab, *[part.strip() for part in rest.split("→")[1:]])
            if not _valid(path):
                stale.append(f"{name}: {' → '.join(path)}")
    assert stale == []
    for old in ("Grow → Supplies", "Grow → Insights", "Shop → Details", "Shop Details"):
        for name in ("demo_coach.py", "app_guide.py", "instant.py"):
            assert old not in (ROOT / "backend/app" / name).read_text(encoding="utf-8")


def test_guide_answers_end_with_the_screen_path():
    answer = guide_reply("How do I get on Google?")
    assert answer and answer.endswith("You can also find this in Grow → Get on Google.")
    assert explain_app("closed today")["features"][0]["where"] == (
        "Shop → Shop details → Closed today"
    )
    # OB-241: the guide knows reminders.
    assert explain_app("how do I get reminders")["features"][0]["where"] == "You → Remind me"


@pytest.mark.parametrize(
    ("message", "target"),
    [
        ("What are people nearby asking for?", "radar"),
        ("Show nearby demand", "radar"),
        ("Send a rider", "rider"),
        ("Book a rider for this order", "rider"),
        ("Remind me every morning", "reminders"),
        ("Turn on reminders", "reminders"),
    ],
)
def test_screen_only_features_open_from_the_chat(message, target):
    lowered = message.casefold()
    assert next(t for pattern, t in SCREEN_RULES if re.search(pattern, lowered)) == target


def _events(response) -> list[dict]:
    return [
        json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")
    ]


def test_demo_answers_every_chat_phrase_with_its_screen_path(app):  # noqa: F811
    """Each "Or just ask" phrase, sent in the public demo, names the same feature's screen."""
    with TestClient(app) as client:
        app.state.v1_settings.public_demo_enabled = True
        app.state.rate_limiter.counters.clear()
        session = open_demo(client).json()["session_id"]
        for feature in OWNER:
            app.state.rate_limiter.counters.clear()
            response = client.post(
                f"/api/v1/demo/sessions/{session}/coach", json={"message": feature.ask}
            )
            assert response.status_code == 200, (feature.ask, response.text)
            events = _events(response)
            reply = " ".join(e.get("text") or "" for e in events if e.get("kind") == "reply")
            assert f"Next, open {feature.where}." in reply, (feature.ask, reply)
            actions = [e["data"]["target"] for e in events if e.get("kind") == "action"]
            if feature.screen in {"radar", "rider", "reminders"}:
                assert actions == [feature.screen], feature.ask
