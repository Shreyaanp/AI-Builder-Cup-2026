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


TOPICS = json.loads((ROOT / "tests/askTopics.json").read_text(encoding="utf-8"))
# The change the phrase prepares for review, in English and in Hindi.
PREPARES = {"sold_out", "closed_today", "add_menu"}


def _ask(client, app, message: str) -> tuple[str, list[dict]]:  # noqa: F811
    """One message in a fresh demo session: the reply text and the events."""
    app.state.rate_limiter.counters.clear()
    session = open_demo(client).json()["session_id"]
    response = client.post(f"/api/v1/demo/sessions/{session}/coach", json={"message": message})
    assert response.status_code == 200, (message, response.text)
    events = _events(response)
    return " ".join(e.get("text") or "" for e in events if e.get("kind") == "reply"), events


def test_every_owner_feature_has_a_topic_word():
    assert set(TOPICS) == {f.id for f in OWNER}
    for feature in OWNER:
        assert feature.what_hi and re.search(r"[ऀ-ॿ]", feature.what_hi), feature.id


@pytest.mark.parametrize("lang", ["en", "hi"])
@pytest.mark.parametrize("feature", OWNER, ids=lambda f: f.id)
def test_demo_answers_every_chat_phrase_on_topic_with_its_screen_path(app, feature, lang):  # noqa: F811
    """Each "Or just ask" phrase, English and Hindi, sent in a fresh public demo session, gets an
    answer about that feature (its topic word) that names the same feature's screen path.
    Hindi screens show ask_hi, so it must not dead-end or answer another topic (review of #633)."""
    with TestClient(app) as client:
        app.state.v1_settings.public_demo_enabled = True
        message = feature.ask if lang == "en" else feature.ask_hi
        reply, events = _ask(client, app, message)
    line = f"Next, open {feature.where}." if lang == "en" else f"अब {feature.where} खोलें।"
    assert reply.count(line) == 1, (message, reply)
    assert re.search(TOPICS[feature.id][lang], reply, re.I), (message, reply)
    actions = [e["data"]["target"] for e in events if e.get("kind") == "action"]
    if feature.screen in {"radar", "rider", "reminders"}:
        assert actions == [feature.screen], message
    proposals = [e for e in events if e.get("kind") == "proposal"]
    assert len(proposals) == (1 if feature.id in PREPARES else 0), (message, reply)


@pytest.mark.parametrize(
    ("message", "topic", "where"),
    [
        # Orders → Find a supplier sends the owner's item (sourcing/copy.ts lowMessage).
        (
            "My milk 20 litres is running low. Find suppliers.",
            # The demo does the work now: it lists the suppliers and drafts the order (OB-248).
            r"Demo suppliers near you for Milk",
            "Grow → Orders → Find a supplier",
        ),
        ("मेरा दूध 20 लीटर कम हो रहा है। सप्लायर खोजें।", r"सप्लायर.*दूध 20 लीटर", None),
        # The PR's own "Owner looks at" phrases.
        (
            "how was this week",
            r"In the last 7 days the demo shop sold [\d,]+ items for ₹[\d,]+\.",
            "Grow → Your week",
        ),
        ("reorder milk", r"order for milk", "Grow → Purchase orders"),
    ],
)
def test_demo_typed_supply_and_week_questions_stay_on_topic(app, message, topic, where):  # noqa: F811
    with TestClient(app) as client:
        app.state.v1_settings.public_demo_enabled = True
        reply, _ = _ask(client, app, message)
    assert re.search(topic, reply), (message, reply)
    assert "Masala chai" not in reply, reply
    if where:
        assert reply.endswith(f"Next, open {where}."), reply


def test_language_control_says_it_is_the_owners_own_language():
    """In Messages, "Reply language" read as the language replies to customers go out in, but it
    switches the whole app (review of #633): it is named for what it does, in every locale."""
    feature = next(f for f in OWNER if f.id == "reply_language")
    assert feature.path == ("Shop", "Messages", "Your language (app and coach)")
    assert INNER_LABELS[("Shop", "Messages")] == frozenset({"Your language (app and coach)"})
    copy = (ROOT / "src/features/v1/twoPathsCopy.ts").read_text(encoding="utf-8")
    labels = re.findall(r"yourLanguage: '([^']+)'", copy)
    assert len(labels) == len(re.findall(r"closedToday: '", copy)) == 15
    assert "Your language (app and coach)" in labels and "आपकी भाषा (ऐप और कोच)" in labels
    assert "Reply language" not in copy and "जवाब की भाषा" not in copy
