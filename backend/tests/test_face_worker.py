import base64
import io
import json
from pathlib import Path

import numpy as np
import pytest
from fastapi import Request
from fastapi.testclient import TestClient
from starlette.requests import ClientDisconnect

import face_worker


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("FACE_WORKER_TOKEN", "fixture-only")
    monkeypatch.delenv("FACE_REQUIRE_MODELS", raising=False)

    class FixtureModels:
        def __init__(self, directory):
            pass

        def analyze(self, capture, prompts, trace=None):
            assert prompts == ["turn_left"]
            if capture == b"offline-capture":
                return {"status": "live", "reason": "ok", "liveness": "passed"}, (
                    face_worker.template(np.ones(256))
                )
            raise face_worker.CaptureRejected("several_faces")

    monkeypatch.setattr(face_worker, "CpuModels", FixtureModels)
    with TestClient(face_worker.app) as test_client:
        yield test_client


def headers(owner="owner-a"):
    return {
        "Authorization": "Bearer fixture-only",
        "X-Owner": owner,
        "X-Prompts": "turn_left",
    }


def test_authentication_and_owner_scope(client):
    assert client.post("/evaluate", content=b"offline-capture").status_code == 401
    assert client.delete("/template").status_code == 401
    assert (
        client.delete("/template", headers={"Authorization": "Bearer fixture-only"}).status_code
        == 400
    )


def test_evaluate_returns_a_template_only_for_a_live_capture_and_stores_nothing(client):
    assert client.get("/health", headers=headers()).json() == {
        "models_ready": True,
        "model": face_worker.MODEL_ID,
        "stores_templates": False,
    }
    live = client.post("/evaluate", headers=headers(), content=b"offline-capture").json()
    assert live["status"] == "live" and live["liveness"] == "passed"
    assert len(live["template"]) == 256
    assert abs(float(np.linalg.norm(live["template"])) - 1) < 1e-5
    # A rejected capture says why (the app shows a tip) and carries no template.
    rejected = client.post("/evaluate", headers=headers(), content=b"two-people").json()
    trace = rejected.pop("trace")
    assert rejected == {"status": "retry", "reason": "several_faces", "liveness": "not_evaluated"}
    assert trace["status"] == "retry" and trace["reason"] == "several_faces"
    # Kept for older app revisions: nothing is stored, so deletion is a confirmation.
    assert client.delete("/template", headers=headers()).json() == {"status": "deleted"}


# The app's first second says "look straight": about three frames of the resting pose.
STILL = [(0.0, 0.0)] * 3


def test_movement_needs_each_prompt_in_order_and_opposite_turns():
    left_then_right = [*STILL, (22.0, 0.0), (0.0, 0.0), (-20.0, 0.0)]
    assert face_worker.movement_seen(["turn_left", "turn_right"], left_then_right)
    # Two turns to the same side are not a left-then-right challenge.
    assert not face_worker.movement_seen(
        ["turn_left", "turn_right"], [*STILL, (22.0, 0.0), (0.0, 0.0), (25.0, 0.0)]
    )
    # Nor is coming back to the middle after one turn.
    assert not face_worker.movement_seen(
        ["turn_left", "turn_right"], [*STILL, (30.0, 0.0), (12.0, 0.0), (-2.0, 0.0)]
    )
    assert face_worker.movement_seen(["turn_left", "look_up"], [*STILL, (18.0, 0.0), (0.0, -14.0)])
    # Order matters: looking up first does not satisfy a turn-then-look-up challenge.
    assert not face_worker.movement_seen(
        ["turn_left", "look_up"], [*STILL, (0.0, -14.0), (18.0, 0.0)]
    )
    assert not face_worker.movement_seen(["look_up"], [(3.0, 2.0)] * 8)
    assert not face_worker.movement_seen(["look_up"], [])


# Owner's phone, 17 Oct 19:03Z (16/16 frames with a face, JSON JPEG frames, 480x640, 7.5 s):
# prompts turn_right then turn_left, yaw_range [-38.3, 20], pitch_range [-25.1, -8.7]. The
# phone was held low and to one side, so the resting pose already read yaw -14, pitch -16.
# The old rule measured from 0 degrees: frame 1 passed as the first turn, frame 2 as a second
# turn on the same side, and a 58 degree swing was told "movement_not_seen" on turn_left.
OWNER_TURNS = [
    (-14.2, -16.0), (-13.1, -15.2), (-14.8, -16.9), (-6.0, -14.1), (9.5, -12.3),
    (20.0, -10.0), (18.4, -8.7), (6.2, -12.8), (-8.9, -16.4), (-22.7, -19.5),
    (-35.1, -23.9), (-38.3, -25.1), (-30.2, -22.0), (-17.6, -18.3), (-12.9, -16.2),
    (-13.6, -15.8),
]  # fmt: skip


def test_owner_turns_from_a_low_side_held_phone_count_from_the_starting_pose():
    yaws, pitches = [y for y, _ in OWNER_TURNS], [p for _, p in OWNER_TURNS]
    assert (min(yaws), max(yaws), min(pitches), max(pitches)) == (-38.3, 20.0, -25.1, -8.7)
    # At rest the old absolute rule already saw a turn and a look up.
    assert abs(OWNER_TURNS[0][0]) > face_worker.YAW_MIN
    assert abs(OWNER_TURNS[0][1]) > face_worker.PITCH_MIN
    assert face_worker.start_pose(OWNER_TURNS) == (-14.2, -16.0)
    assert face_worker.movement_evaluation(["turn_right", "turn_left"], OWNER_TURNS) == (
        True,
        ["turn_right", "turn_left"],
        None,
    )
    # Direction-agnostic: the same head turns read with the other sign convention (a mirrored
    # front camera) and the prompts in the other order pass too.
    mirrored = [(-yaw, pitch) for yaw, pitch in OWNER_TURNS]
    assert face_worker.movement_seen(["turn_right", "turn_left"], mirrored)
    assert face_worker.movement_seen(["turn_left", "turn_right"], OWNER_TURNS)


def test_a_face_held_still_at_an_angle_is_not_movement():
    # Yaw -14 and pitch -16 at rest are past both thresholds from 0 degrees; nothing moved.
    still = [(-14.0 + (i % 3) - 1, -16.0 + (i % 2)) for i in range(16)]
    for prompts in (["turn_left"], ["look_up"], ["turn_right", "turn_left"]):
        ok, passed, failed = face_worker.movement_evaluation(prompts, still)
        assert not ok and passed == [] and failed == prompts[0]
    # A real look up from that pose is seen, whichever sign the pitch moves.
    assert face_worker.movement_seen(["look_up"], [*still[:3], (-14.0, -4.0)])
    assert face_worker.movement_seen(["look_up"], [*still[:3], (-14.0, -27.0)])


def test_capture_limit(client):
    assert (
        client.post(
            "/evaluate", headers=headers(), content=b"x" * (face_worker.MAX_BYTES + 1)
        ).status_code
        == 413
    )


@pytest.mark.asyncio
async def test_disconnect_releases_worker_lock(client):
    events = iter(
        [
            {"type": "http.request", "body": b"partial", "more_body": True},
            {"type": "http.disconnect"},
        ]
    )

    async def receive():
        return next(events)

    request = Request(
        {
            "type": "http",
            "app": face_worker.app,
            "headers": [(key.lower().encode(), value.encode()) for key, value in headers().items()],
        },
        receive,
    )
    with pytest.raises(ClientDisconnect):
        await face_worker.evaluate(request)
    assert not face_worker.app.state.busy.locked()


def test_required_models_fail_startup(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("FACE_REQUIRE_MODELS", "true")

    def missing(directory):
        raise OSError("offline missing model")

    monkeypatch.setattr(face_worker, "CpuModels", missing)
    with pytest.raises(RuntimeError, match="Required face models"):
        with TestClient(face_worker.app):
            pass


def test_realistic_phone_angles_and_prompt_tracking():
    # 12 degrees yaw and 8 degrees pitch are accepted (relaxed phone angles)
    ok, passed, failed = face_worker.movement_evaluation(
        ["turn_left", "turn_right"], [*STILL, (12.0, 0.0), (0.0, 0.0), (-11.0, 0.0)]
    )
    assert ok is True
    assert passed == ["turn_left", "turn_right"]
    assert failed is None

    # Partial pass: turn_left passed, look_up not reached
    ok, passed, failed = face_worker.movement_evaluation(
        ["turn_left", "look_up"], [*STILL, (12.0, 0.0), (0.0, 0.0)]
    )
    assert ok is False
    assert passed == ["turn_left"]
    assert failed == "look_up"

    # Head turned up past 7 degrees
    ok, passed, failed = face_worker.movement_evaluation(["look_up"], [*STILL, (0.0, -8.0)])
    assert ok is True
    assert passed == ["look_up"]


def test_evaluate_handles_json_sampled_frames(client):
    import json

    payload = json.dumps(
        {
            "frames": [
                {"timestamp": 0.0, "data": "base64mock"},
                {"timestamp": 0.5, "data": "base64mock"},
            ]
        }
    ).encode()
    # Offline fixture returns rejected several_faces for unknown capture
    res = client.post("/evaluate", headers=headers(), content=payload).json()
    assert res["status"] == "retry"
    assert res["reason"] == "several_faces"


# Real browser recordings (Chrome's MediaRecorder with FaceDialog's settings: 640x480 front
# camera, 500 kbps, 250 ms timeslices) of a public test sequence; see fixtures/face/README.md.
FIXTURES = Path(__file__).parent / "fixtures" / "face"
RECORDINGS = [
    ("chrome-vp8.webm", "webm", "vp8", 0),
    ("chrome-vp9.webm", "webm", "vp9", 0),
    ("chrome-h264.mp4", "mp4", "h264", 0),
    # Coded sideways with a 90 degree display matrix, as a phone held upright records.
    ("h264-portrait-rotated.mp4", "mp4", "h264", 90),
]
MODELS = Path(__file__).parents[1] / "data" / "face-models"


@pytest.mark.parametrize(("name", "container", "codec", "rotation"), RECORDINGS)
def test_phone_recordings_decode_into_upright_frames(name, container, codec, rotation):
    trace = {}
    frames = list(face_worker.sampled_frames((FIXTURES / name).read_bytes(), trace))
    assert trace["container"] == container and trace["codec"] == codec
    assert trace["rotation"] == rotation
    assert 2.0 <= trace["duration_s"] <= 4.0
    assert trace["sampled"] == len(frames) >= face_worker.MIN_FRAMES
    # Every frame comes out landscape 640x480, the way the camera saw the face.
    assert {frame.shape for frame in frames} == {(480, 640, 3)}


def client_frames(name):
    """What FaceDialog sends when its canvas sampling works: a JPEG data URL every 0.35 s."""
    from PIL import Image

    items, last = [], -1.0
    for image in face_worker.sampled_frames((FIXTURES / name).read_bytes(), {}):
        last += 0.35
        jpeg = io.BytesIO()
        Image.fromarray(image[:, :, ::-1]).save(jpeg, format="JPEG", quality=82)
        data = "data:image/jpeg;base64," + base64.b64encode(jpeg.getvalue()).decode()
        items.append({"timestamp": round(last, 2), "data": data})
    return json.dumps({"frames": items}).encode()


def test_client_sampled_frames_decode_and_skip_broken_ones():
    payload = json.loads(client_frames("chrome-vp8.webm"))
    payload["frames"].insert(1, {"timestamp": 0.1, "data": "data:image/jpeg;base64,AAAA"})
    trace = {}
    frames = list(face_worker.sampled_frames(json.dumps(payload).encode(), trace))
    assert trace["container"] == "json_frames" and trace["undecodable"] == 1
    assert len(frames) == trace["sampled"] >= face_worker.MIN_FRAMES
    assert {frame.shape for frame in frames} == {(480, 640, 3)}


def test_a_cut_off_recording_keeps_its_decoded_frames():
    data = (FIXTURES / "chrome-h264.mp4").read_bytes()
    trace = {}
    frames = list(face_worker.sampled_frames(data[: int(len(data) * 0.8)], trace))
    assert len(frames) >= 1 and trace["container"] == "mp4"


@pytest.mark.parametrize(
    ("capture", "failed"),
    [
        (b"\x1a\x45\xdf\xa3 not really a webm", "container"),
        (b"not a video at all", "container"),
        (b'{"frames": []}', "frames JSON has no frames"),
    ],
)
def test_unreadable_captures_say_which_stage_failed(capture, failed):
    with pytest.raises(face_worker.CaptureRejected) as rejected:
        list(face_worker.sampled_frames(capture, {}))
    assert rejected.value.reason == "capture_not_usable"
    assert rejected.value.failed.startswith(failed)


def test_verdict_log_is_one_json_line_without_identity_data(client):
    stream = io.StringIO()
    handler = face_worker.logger.handlers[0]
    previous = handler.setStream(stream)
    try:
        client.post("/evaluate", headers=headers(), content=b"offline-capture")
    finally:
        handler.setStream(previous)
    line = json.loads(stream.getvalue().strip().splitlines()[-1])
    assert line["severity"] == "INFO" and line["event"] == "face_worker_verdict"
    assert line["status"] == "live" and line["bytes"] == len(b"offline-capture")
    assert "first_request" in line and "latency_ms" in line
    assert not {"template", "owner", "x-owner", "uid"} & set(line)


@pytest.mark.skipif(not (MODELS / "verified.json").exists(), reason="face models not fetched")
@pytest.mark.parametrize("name", [name for name, *_ in RECORDINGS])
def test_real_models_find_one_live_person_in_each_recording(name):
    models = face_worker.CpuModels(MODELS)
    captures = [(FIXTURES / name).read_bytes(), client_frames(name)]
    for capture in captures:
        trace = {}
        outcome, vector = models.analyze(capture, ["turn_left", "look_up"], trace)
        assert outcome["status"] == "live", trace
        assert len(vector) == 256
        assert set(trace["faces"]) == {"1"}


# OB-26 / #74. Owner's phone, 19 Oct 02:18 IST: 16/16 frames with a face, the turn_right prompt
# passed (yaw -44..35), but the anti-spoof model scored 0.003 and rejected a real owner as
# "not_live". The model is gone: a face in enough frames plus the completed prompts passes.
OWNER_LIVE_POSES = [
    (-2.0, -12.1), (0.4, -11.0), (1.2, -12.6), (12.5, -10.2), (24.8, -9.3), (34.9, -11.4),
    (22.0, -12.9), (6.1, -13.3), (1.0, -21.8), (0.6, -30.2), (-0.8, -35.6), (0.2, -27.4),
    (1.5, -16.0), (0.9, -12.4), (-1.1, -11.8), (0.0, -12.2),
]  # fmt: skip


def scripted_models(monkeypatch, poses, faces=None):
    """CpuModels whose frames report recorded poses (no model files needed); a False in
    `faces` is a frame without a face."""
    faces = faces or [True] * len(poses)

    def frames(capture, trace):
        trace["sampled"] = len(poses)
        yield from (np.zeros((4, 4, 3), np.uint8) for _ in poses)

    monkeypatch.setattr(face_worker, "sampled_frames", frames)
    models = object.__new__(face_worker.CpuModels)
    seen = iter(
        [(pose, np.ones(256)) if face else None for pose, face in zip(poses, faces, strict=True)]
    )
    models.frame = lambda image: next(seen)
    return models


def test_ob26_74_face_and_completed_prompts_pass_with_no_spoof_check(monkeypatch):
    models = scripted_models(monkeypatch, OWNER_LIVE_POSES)
    trace = {}
    outcome, vector = models.analyze(b"{}", ["turn_left", "look_up"], trace)
    assert outcome == {
        "status": "live",
        "reason": "ok",
        "liveness": "passed",
        "passed_prompts": ["turn_left", "look_up"],
    }
    assert len(vector) == 256
    # The model and its thresholds are gone, and so is any score in the verdict or the log.
    assert not any(hasattr(face_worker, name) for name in ("SPOOF_MAX", "REAL_MIN", "exposed"))
    assert "score" not in outcome and "face_luma" not in trace
    assert not hasattr(models, "anti")


def test_ob26_74_no_face_asks_to_retry(monkeypatch):
    # The endpoint turns the rejection into {"status": "retry", "reason": "no_face"}.
    models = scripted_models(monkeypatch, OWNER_LIVE_POSES, faces=[False] * 16)
    with pytest.raises(face_worker.CaptureRejected) as rejected:
        models.analyze(b"{}", ["turn_left"], {})
    assert rejected.value.reason == "no_face"
    # Too few frames with a face is the same friendly retry.
    models = scripted_models(monkeypatch, OWNER_LIVE_POSES, faces=[True] * 5 + [False] * 11)
    with pytest.raises(face_worker.CaptureRejected) as rejected:
        models.analyze(b"{}", ["turn_left"], {})
    assert rejected.value.reason == "no_face"


def test_ob26_74_prompts_not_done_asks_to_retry(monkeypatch):
    still = [(0.0, -10.0)] * 16
    models = scripted_models(monkeypatch, still)
    outcome, vector = models.analyze(b"{}", ["turn_left"], {})
    assert outcome["status"] == "retry" and outcome["reason"] == "movement_not_seen"
    assert outcome["failed_prompt"] == "turn_left" and vector is None


def test_ob26_74_every_reason_the_worker_gives_has_owner_copy():
    copy = (Path(__file__).parents[2] / "src" / "features" / "trust" / "copy.ts").read_text(
        encoding="utf-8"
    )
    english = copy[copy.index("movement_not_seen") :][:1500]
    for reason in ("no_face", "movement_not_seen", "too_short", "capture_not_usable"):
        assert reason + ":" in copy, reason
    assert "not_live" not in copy and "photo or a screen" not in english


def dimmed_frames(name, change):
    """FaceDialog's JPEG frames of a fixture recording, each changed by `change` first."""
    from PIL import Image

    items, last = [], -1.0
    for image in face_worker.sampled_frames((FIXTURES / name).read_bytes(), {}):
        last += 0.35
        jpeg = io.BytesIO()
        Image.fromarray(change(image)[:, :, ::-1]).save(jpeg, format="JPEG", quality=82)
        data = "data:image/jpeg;base64," + base64.b64encode(jpeg.getvalue()).decode()
        items.append({"timestamp": round(last, 2), "data": data})
    return json.dumps({"frames": items}).encode()


def night_room(image):
    """A phone indoors at night: 35% exposure and a little sensor noise."""
    noise = np.random.default_rng(1).normal(0, 3, image.shape)
    return np.clip(image.astype(np.float32) * 0.35 + noise, 0, 255).astype(np.uint8)


@pytest.mark.skipif(not (MODELS / "verified.json").exists(), reason="face models not fetched")
@pytest.mark.parametrize("name", ["chrome-vp9.webm", "chrome-h264.mp4"])
def test_real_models_pass_a_live_face_in_a_dark_room(name):
    models = face_worker.CpuModels(MODELS)
    trace = {}
    outcome, vector = models.analyze(dimmed_frames(name, night_room), ["turn_left"], trace)
    assert outcome["status"] == "live" and vector is not None, trace
