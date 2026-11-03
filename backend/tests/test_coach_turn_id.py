import json
from time import monotonic
from uuid import uuid4

from fastapi.testclient import TestClient
from google.adk.sessions import InMemorySessionService

from app.agent import OfflineCoachModel
from app.main import create_app
from app.replay import REPLAY_TTL
from app.settings import Settings


def events(response) -> list[dict]:
    return [
        json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")
    ]


def test_a_repeated_turn_id_in_a_session_is_one_turn(monkeypatch) -> None:
    calls = 0
    original = OfflineCoachModel.generate_content_async

    async def counted(self, *args, **kwargs):
        nonlocal calls
        calls += 1
        async for event in original(self, *args, **kwargs):
            yield event

    monkeypatch.setattr(OfflineCoachModel, "generate_content_async", counted)
    app = create_app(Settings(app_env="test", _env_file=None), InMemorySessionService())
    with TestClient(app) as client:
        client.get("/api/v1/bootstrap")
        first = events(client.post("/api/v1/coach/stream", json={"message": "My tea shop"}))
        sid = first[0]["session_id"]
        assert calls == 1
        turn = str(uuid4())
        body = {"message": "name: Twice Tea Stall", "session_id": sid, "turn_id": turn}
        sent = events(client.post("/api/v1/coach/stream", json=body))
        assert calls == 2
        reply = next(event["text"] for event in sent if event["kind"] == "reply")

        # The page reloaded and the same turn went again: its answer is replayed, not re-run.
        again = events(client.post("/api/v1/coach/stream", json=body))
        assert calls == 2
        assert next(event["text"] for event in again if event["kind"] == "reply") == reply
        assert again[-1]["kind"] == "turn_complete"

        # The reloaded page's opening turn (no client id) does not hide the owner's turn.
        events(client.post("/api/v1/coach/stream", json={"message": "Resume", "session_id": sid}))
        assert calls == 3
        again = events(client.post("/api/v1/coach/stream", json=body))
        assert calls == 3
        assert next(event["text"] for event in again if event["kind"] == "reply") == reply

        # After the replay expired the session still knows the id: the turn just ends.
        replay = app.state.services.replay
        for turns in (replay.turns, replay.owner_turns):
            for key, item in turns.items():
                if key[1] == sid:
                    item.finished = monotonic() - REPLAY_TTL - 1
        late = events(client.post("/api/v1/coach/stream", json=body))
        assert calls == 3
        assert [event["kind"] for event in late] == ["ready", "turn_complete"]
        assert late[0]["session_id"] == sid

        # A new id is a new turn, and so is the same id in another session.
        events(client.post("/api/v1/coach/stream", json={**body, "turn_id": str(uuid4())}))
        assert calls > 3
        before = calls
        events(
            client.post("/api/v1/coach/stream", json={"message": "Another shop", "turn_id": turn})
        )
        assert calls > before
