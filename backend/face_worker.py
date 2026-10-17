"""Private CPU inference worker. Raw captures never enter a file or a model prompt.

The worker keeps nothing: it answers whether a short capture shows one live person following
the prompted head movements and, only then, returns that capture's face template. The main app
encrypts templates and keeps the gallery (a worker instance is ephemeral and per instance, so a
gallery here lost every template on scale-down and duplicate owners were never found).
"""

import asyncio
import base64
import hashlib
import io
import json
import logging
import os
import secrets
import sys
import time
from collections.abc import Iterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import anyio
import numpy as np
from fastapi import FastAPI, HTTPException, Request


class JsonLines(logging.Formatter):
    """One JSON object per line on stdout: Cloud Logging keeps it as a structured jsonPayload."""

    def format(self, record: logging.LogRecord) -> str:
        fields = getattr(record, "fields", {})
        return json.dumps(
            {"severity": record.levelname, "message": record.getMessage(), **fields}, default=str
        )


logger = logging.getLogger("face_worker")
# Uvicorn only configures its own loggers; without this handler every INFO line was dropped.
if not logger.handlers:
    _handler = logging.StreamHandler(sys.stdout)
    _handler.setFormatter(JsonLines())
    logger.addHandler(_handler)
    logger.setLevel(logging.INFO)
    logger.propagate = False


def log(level: int, event: str, **fields: Any) -> None:
    """Capture facts only: stages, counts, codecs, timings, reasons. Never pixels, templates,
    scores per frame or anything that identifies the owner."""
    logger.log(level, event, extra={"fields": {"event": event, **fields}})


MODEL_ID = "intel-face-reidentification-retail-0095-fp32-v1"
MAX_BYTES = 8 * 1024 * 1024
# anti-spoof-mn3 class 0 is "real person" (model README). Its mean over sampled frames must
# reach this threshold. Calibrated for real front cameras (low light, glasses, Indian skin tones).
# Real persons score 0.35-0.70; screens or prints score near zero (< 0.15).
REAL_MIN = 0.30
# Frames without exactly one clear face (motion blur, turned head) are skipped, but sampled
# frames must show enough valid faces. 40% accommodates profile views during turns.
MIN_FRAMES = 6
MIN_FACE_SHARE = 0.40
YAW_MIN = 10.0
PITCH_MIN = 7.0


class CaptureRejected(ValueError):
    """A capture the owner can fix by trying again; `reason` picks the tip the app shows and
    `failed` names the check that did not hold (for the logs)."""

    def __init__(self, reason: str, failed: str | None = None) -> None:
        super().__init__(reason)
        self.reason = reason
        self.failed = failed


def container_of(capture: bytes) -> str:
    """What the bytes are, from their first bytes (the content type is only the browser's word)."""
    head = capture[:64]
    if head.lstrip().startswith(b"{"):
        return "json_frames"
    if head.startswith(b"\x1a\x45\xdf\xa3"):
        return "webm"
    if head[4:8] in {b"ftyp", b"moov", b"moof", b"styp", b"free", b"mdat"}:
        return "mp4"
    if head.startswith(b"\xff\xd8"):
        return "jpeg"
    return "unknown"


def upright(image: np.ndarray, rotation: int) -> np.ndarray:
    """Apply the stream's display rotation (degrees counter-clockwise, as FFmpeg reports it).
    A phone held upright records sideways frames plus this note; a sideways face is no face."""
    turns = round(rotation / 90) % 4
    return np.ascontiguousarray(np.rot90(image, k=turns)) if turns else image


def template(values: np.ndarray) -> list[float]:
    """The unit-length 256-value face template (compared by cosine similarity)."""
    value = np.asarray(values, dtype=np.float32).reshape(-1)
    if value.size != 256 or not np.isfinite(value).all() or np.linalg.norm(value) <= 1e-8:
        raise ValueError("Invalid biometric template")
    return (value / np.linalg.norm(value)).tolist()


def movement_evaluation(
    prompts: list[str], poses: list[tuple[float, float]]
) -> tuple[bool, list[str], str | None]:
    """Each prompted movement, in order: a head turn is |yaw| > 10.0 degrees, looking up is
    |pitch| > 7.0. Turn direction is not tied to one sign convention; a left-then-right
    challenge needs its two turns on opposite sides.
    Returns (passed_all, passed_prompts, failed_prompt)."""
    position = 0
    turns: list[float] = []
    passed: list[str] = []
    for prompt in prompts:
        if not prompt:
            continue
        found = False
        for index in range(position, len(poses)):
            yaw, pitch = poses[index]
            if prompt in {"turn_left", "turn_right"} and abs(yaw) > YAW_MIN:
                turns.append(yaw)
                found = True
                break
            if prompt == "look_up" and abs(pitch) > PITCH_MIN:
                found = True
                break
        if not found:
            return False, passed, prompt
        passed.append(prompt)
        position = index + 1
    if len(turns) >= 2 and (turns[0] > 0) == (turns[1] > 0):
        return False, passed[:1], prompts[-1]
    return True, passed, None


def movement_seen(prompts: list[str], poses: list[tuple[float, float]]) -> bool:
    ok, _, _ = movement_evaluation(prompts, poses)
    return ok


class CpuModels:
    def __init__(self, directory: Path) -> None:
        import cv2
        import onnxruntime as ort
        import openvino as ov

        self.cv2 = cv2
        # Reverify receipts, including size-independent digest, before trusting cached models.
        receipts = json.loads((directory / "verified.json").read_text())
        for receipt in receipts:
            path = directory / receipt["model"] / receipt["file"]
            if hashlib.sha384(path.read_bytes()).hexdigest() != receipt["sha384"]:
                raise ValueError("Model integrity failure")
        core = ov.Core()
        names = [
            "face-detection-retail-0004",
            "landmarks-regression-retail-0009",
            "head-pose-estimation-adas-0001",
            "face-reidentification-retail-0095",
        ]
        self.models = {
            name: core.compile_model(
                str(directory / name / "FP32" / (name + ".xml")),
                "CPU",
                {"INFERENCE_NUM_THREADS": 2},
            )
            for name in names
        }
        self.anti = ort.InferenceSession(
            str(directory / "anti-spoof-mn3" / "anti-spoof-mn3.onnx"),
            sess_options=self.anti_options(ort),
            providers=["CPUExecutionProvider"],
        )

    @staticmethod
    def anti_options(ort):
        options = ort.SessionOptions()
        options.intra_op_num_threads = 2
        options.inter_op_num_threads = 1
        return options

    def infer(self, name: str, image: np.ndarray) -> dict[str, np.ndarray]:
        model = self.models[name]
        shape = list(model.input(0).shape)
        frame = (
            self.cv2.resize(image, (shape[3], shape[2])).transpose(2, 0, 1)[None].astype(np.float32)
        )
        output = model([frame])
        return {port.get_any_name(): np.asarray(value) for port, value in output.items()}

    def frame(self, image: np.ndarray) -> tuple[tuple[float, float], np.ndarray, float] | None:
        """(yaw, pitch), template and real-person score for one frame; None without one face."""
        detections = next(iter(self.infer("face-detection-retail-0004", image).values())).reshape(
            -1, 7
        )
        faces = [d for d in detections if d[2] > 0.60]
        if len(faces) > 1:
            # Someone else in view is never skipped: the check is about one person.
            raise CaptureRejected("several_faces")
        if not faces:
            return None
        face = faces[0]
        height, width = image.shape[:2]
        x1, y1, x2, y2 = [int(v) for v in face[3:7] * [width, height, width, height]]
        crop = image[max(0, y1) : min(height, y2), max(0, x1) : min(width, x2)]
        if min(crop.shape[:2]) < 45:
            raise CaptureRejected("face_too_small")
        landmarks = next(
            iter(self.infer("landmarks-regression-retail-0009", crop).values())
        ).reshape(5, 2)
        source = landmarks * [crop.shape[1], crop.shape[0]]
        target = (
            np.array(
                [
                    [0.31556875, 0.4615741],
                    [0.68262292, 0.4615741],
                    [0.5002625, 0.6405054],
                    [0.349471875, 0.824692],
                    [0.653436458, 0.824692],
                ],
                dtype=np.float32,
            )
            * 128
        )
        matrix, _ = self.cv2.estimateAffinePartial2D(
            source.astype(np.float32), target, method=self.cv2.LMEDS
        )
        if matrix is None:
            return None
        aligned = self.cv2.warpAffine(crop, matrix, (128, 128))
        vector = next(iter(self.infer("face-reidentification-retail-0095", aligned).values()))
        pose = self.infer("head-pose-estimation-adas-0001", crop)
        yaw = float(pose["angle_y_fc"].reshape(-1)[0])
        pitch = float(pose["angle_p_fc"].reshape(-1)[0])
        rgb = self.cv2.cvtColor(self.cv2.resize(crop, (128, 128)), self.cv2.COLOR_BGR2RGB).astype(
            np.float32
        )
        normalized = (rgb - [151.2405, 119.5950, 107.8395]) / [63.0105, 56.4570, 55.0035]
        prediction = self.anti.run(
            None,
            {
                self.anti.get_inputs()[0].name: normalized.transpose(2, 0, 1)[None].astype(
                    np.float32
                )
            },
        )[0].reshape(-1)
        return (yaw, pitch), np.asarray(vector).reshape(-1), float(prediction[0])

    def analyze(
        self, video: bytes, prompts: list[str], trace: dict[str, Any] | None = None
    ) -> tuple[dict[str, Any], list[float] | None]:
        """The verdict for one capture. `trace` collects what the logs say about it."""
        trace = {} if trace is None else trace
        poses: list[tuple[float, float]] = []
        templates = []
        scores = []
        faces = ""
        for image in sampled_frames(video, trace):
            trace["stage"] = "faces"
            try:
                seen = self.frame(image)
            except CaptureRejected as rejected:
                trace["faces"] = faces + ("2" if rejected.reason == "several_faces" else "s")
                raise
            faces += "0" if seen is None else "1"
            if seen is None:
                continue
            pose, vector, real = seen
            poses.append(pose)
            templates.append(vector)
            scores.append(real)
        trace["stage"] = "thresholds"
        trace["faces"] = faces
        trace["face_frames"] = len(poses)
        if poses:
            yaws, pitches = [p[0] for p in poses], [p[1] for p in poses]
            trace["yaw_range"] = [round(min(yaws), 1), round(max(yaws), 1)]
            trace["pitch_range"] = [round(min(pitches), 1), round(max(pitches), 1)]
        sampled = trace.get("sampled", 0)
        if sampled < MIN_FRAMES:
            raise CaptureRejected("too_short", f"sampled {sampled} < MIN_FRAMES {MIN_FRAMES}")
        if len(poses) < MIN_FRAMES:
            raise CaptureRejected("no_face", f"face_frames {len(poses)} < MIN_FRAMES {MIN_FRAMES}")
        if len(poses) < MIN_FACE_SHARE * sampled:
            raise CaptureRejected(
                "no_face", f"face_frames {len(poses)}/{sampled} < MIN_FACE_SHARE {MIN_FACE_SHARE}"
            )

        ok, passed_prompts, failed_prompt = movement_evaluation(prompts, poses)
        if not ok:
            trace["failed"] = f"{failed_prompt}: YAW_MIN {YAW_MIN} / PITCH_MIN {PITCH_MIN}"
            return {
                "status": "retry",
                "reason": "movement_not_seen",
                "liveness": "failed",
                "passed_prompts": passed_prompts,
                "failed_prompt": failed_prompt or "movement",
            }, None

        mean_score = float(np.mean(scores))
        if mean_score < REAL_MIN:
            trace["failed"] = f"score {mean_score:.3f} < REAL_MIN {REAL_MIN}"
            return {
                "status": "retry",
                "reason": "not_live",
                "liveness": "failed",
                "score": round(mean_score, 3),
                "passed_prompts": passed_prompts,
            }, None

        # Liveness is measured, not certified: the app treats a pass as "checked", and any
        # match against another owner goes to a person, never to an automatic decision.
        return {
            "status": "live",
            "reason": "ok",
            "liveness": "passed",
            "score": round(mean_score, 3),
            "passed_prompts": passed_prompts,
        }, template(np.mean(templates, axis=0))


def sampled_frames(capture: bytes, trace: dict[str, Any]) -> Iterator[np.ndarray]:
    """Upright BGR frames, about three a second, from the app's JSON list of JPEG frames or a
    browser recording (WebM VP8/VP9, MP4 H.264). Fills `trace` with what was decoded."""
    trace["container"] = container_of(capture)
    trace["stage"] = "open"
    if trace["container"] == "json_frames":
        yield from json_frames(capture, trace)
    else:
        yield from video_frames(capture, trace)
    if trace.get("sampled", 0) == 0:
        raise CaptureRejected("capture_not_usable", "no decodable frames")


def json_frames(capture: bytes, trace: dict[str, Any]) -> Iterator[np.ndarray]:
    from PIL import Image, ImageOps

    try:
        items = json.loads(capture.decode("utf-8")).get("frames", [])
    except (ValueError, AttributeError) as error:
        raise CaptureRejected("capture_not_usable", "frames JSON unreadable") from error
    if not isinstance(items, list) or not items:
        raise CaptureRejected("capture_not_usable", "frames JSON has no frames")
    trace.update(codec="jpeg", decoded=0, sampled=0, undecodable=0)
    last = -1.0
    for item in items[:120]:
        trace["stage"] = "decode"
        try:
            stamp = float(item.get("timestamp", 0.0))
            data = str(item.get("data", ""))
            image = Image.open(io.BytesIO(base64.b64decode(data.split(",", 1)[-1])))
            image = ImageOps.exif_transpose(image).convert("RGB")
        except Exception:
            trace["undecodable"] += 1
            continue
        trace["decoded"] += 1
        trace["duration_s"] = round(stamp, 2)
        trace.setdefault("width", image.width)
        trace.setdefault("height", image.height)
        if stamp - last < 0.30:
            continue
        last = stamp
        if max(image.size) > 1280:
            image.thumbnail((1280, 1280))
        trace["sampled"] += 1
        yield np.asarray(image)[:, :, ::-1].copy()


def video_frames(capture: bytes, trace: dict[str, Any]) -> Iterator[np.ndarray]:
    import av

    try:
        container = av.open(io.BytesIO(capture))
    except Exception as error:
        raise CaptureRejected("capture_not_usable", f"container: {type(error).__name__}") from error
    try:
        if not container.streams.video:
            raise CaptureRejected("capture_not_usable", "no video stream")
        stream = container.streams.video[0]
        trace.update(
            demuxer=container.format.name,
            codec=stream.codec_context.name,
            width=stream.codec_context.width,
            height=stream.codec_context.height,
            decoded=0,
            sampled=0,
        )
        last = -1.0
        trace["stage"] = "decode"
        try:
            for frame in container.decode(stream):
                trace["decoded"] += 1
                if frame.time is not None and 0.0 <= float(frame.time) < 100.0:
                    stamp = float(frame.time)
                else:
                    stamp = trace["decoded"] / 30.0
                if stamp > 10.0 or trace["decoded"] > 480:
                    break  # Enough video: the capture is eight seconds.
                trace["duration_s"] = round(stamp, 2)
                if stamp - last < 0.35:
                    continue
                last = stamp
                rotation = int(getattr(frame, "rotation", 0) or 0)
                trace["rotation"] = rotation
                if max(frame.width, frame.height) > 1280:
                    scale = 1280.0 / max(frame.width, frame.height)
                    frame = frame.reformat(
                        width=int(frame.width * scale), height=int(frame.height * scale)
                    )
                trace["sampled"] += 1
                yield upright(frame.to_ndarray(format="bgr24"), rotation)
        except av.FFmpegError as error:
            # A truncated last cluster (the recorder stopped mid-write) still leaves the frames
            # decoded so far; only a capture with nothing usable is rejected.
            trace["decode_error"] = type(error).__name__
            if trace["sampled"] == 0:
                raise CaptureRejected(
                    "capture_not_usable", f"decode: {type(error).__name__}"
                ) from error
    finally:
        container.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        app.state.models = await anyio.to_thread.run_sync(CpuModels, Path("data/face-models"))
    except (OSError, ValueError, KeyError, ImportError):
        if os.getenv("FACE_REQUIRE_MODELS") == "true":
            raise RuntimeError("Required face models failed to initialize") from None
        app.state.models = None
    app.state.busy = asyncio.Lock()
    app.state.served = 0
    app.state.started = time.monotonic()
    log(logging.INFO, "face_worker_started", models_ready=app.state.models is not None)
    yield


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None)


def authorize(request: Request) -> str:
    token = os.getenv("FACE_WORKER_TOKEN", "")
    received = request.headers.get("authorization", "")
    if not token or not secrets.compare_digest(received, "Bearer " + token):
        raise HTTPException(401, "Private worker authentication required")
    uid = request.headers.get("x-owner", "")
    if not uid or len(uid) > 160:
        raise HTTPException(400, "Owner scope required")
    return uid


@app.get("/health")
async def health(request: Request):
    authorize(request)
    return {
        "models_ready": request.app.state.models is not None,
        "model": MODEL_ID,
        "stores_templates": False,
    }


@app.post("/evaluate")
async def evaluate(request: Request):
    authorize(request)
    if request.app.state.busy.locked():
        raise HTTPException(429, "Worker busy")
    async with request.app.state.busy:
        data = bytearray()
        start_time = time.perf_counter()
        try:
            async with asyncio.timeout(10):
                async for chunk in request.stream():
                    if len(data) + len(chunk) > MAX_BYTES:
                        raise HTTPException(413, "Capture too large")
                    data.extend(chunk)
            models_service = request.app.state.models
            if models_service is None:
                elapsed_ms = round((time.perf_counter() - start_time) * 1000, 1)
                log(logging.WARNING, "face_worker_models_unavailable", latency_ms=elapsed_ms)
                return {"status": "unavailable", "reason": "models_unavailable"}
            # A first request after a cold start explains a slow answer.
            trace: dict[str, Any] = {
                "bytes": len(data),
                "first_request": request.app.state.served == 0,
                "uptime_s": round(time.monotonic() - request.app.state.started, 1),
            }
            request.app.state.served += 1
            try:
                outcome, vector = await anyio.to_thread.run_sync(
                    models_service.analyze,
                    bytes(data),
                    request.headers.get("x-prompts", "").split(","),
                    trace,
                )
            except CaptureRejected as rejected:
                outcome, vector = {"status": "retry", "reason": rejected.reason}, None
                trace["failed"] = rejected.failed
            except Exception as exc:
                outcome, vector = {"status": "retry", "reason": "capture_not_usable"}, None
                trace["failed"] = f"unexpected {type(exc).__name__}"
            outcome.setdefault("liveness", "not_evaluated")
            trace.update(
                status=outcome["status"],
                reason=outcome["reason"],
                failed_prompt=outcome.get("failed_prompt"),
                score=outcome.get("score"),
                content_type=request.headers.get("content-type", ""),
                latency_ms=round((time.perf_counter() - start_time) * 1000, 1),
            )
            log(logging.INFO, "face_worker_verdict", **trace)
            # The trace goes back for the main app's own log line; it never reaches the owner.
            outcome = {**outcome, "trace": trace}
            return {**outcome, **({"template": vector, "model": MODEL_ID} if vector else {})}
        finally:
            data.clear()


@app.delete("/template")
async def delete(request: Request):
    """Kept for main-app revisions that still call it: the worker stores no templates."""
    authorize(request)
    return {"status": "deleted"}
