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
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import anyio
import numpy as np
from fastapi import FastAPI, HTTPException, Request

logger = logging.getLogger("face_worker")

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
    """A capture the owner can fix by trying again; `reason` picks the tip the app shows."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


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
        self, video: bytes, prompts: list[str]
    ) -> tuple[dict[str, Any], list[float] | None]:
        poses: list[tuple[float, float]] = []
        templates = []
        scores = []
        sampled = 0

        # Support client-sampled JPEG frames (JSON payload) or raw video container
        if video.lstrip().startswith(b"{"):
            try:
                payload = json.loads(video.decode("utf-8"))
                frame_items = payload.get("frames", [])
                if not frame_items or not isinstance(frame_items, list):
                    raise CaptureRejected("capture_not_usable")
                last = -1.0
                for item in frame_items:
                    ts = float(item.get("timestamp", 0.0))
                    if ts - last < 0.30:
                        continue
                    last = ts
                    data_str = item.get("data", "")
                    if "," in data_str:
                        data_str = data_str.split(",", 1)[1]
                    raw_bytes = base64.b64decode(data_str)
                    img = self.cv2.imdecode(
                        np.frombuffer(raw_bytes, dtype=np.uint8), self.cv2.IMREAD_COLOR
                    )
                    if img is None:
                        continue
                    h, w = img.shape[:2]
                    if max(h, w) > 1280:
                        scale = 1280.0 / max(h, w)
                        img = self.cv2.resize(img, (int(w * scale), int(h * scale)))
                    sampled += 1
                    seen = self.frame(img)
                    if seen is None:
                        continue
                    pose, vector, real = seen
                    poses.append(pose)
                    templates.append(vector)
                    scores.append(real)
            except CaptureRejected:
                raise
            except Exception as error:
                raise CaptureRejected("capture_not_usable") from error
        else:
            import av

            try:
                container = av.open(io.BytesIO(video))
            except Exception as error:
                raise CaptureRejected("capture_not_usable") from error
            try:
                if not container.streams.video:
                    raise CaptureRejected("capture_not_usable")
                frames = 0
                last = -1.0
                for frame in container.decode(video=0):
                    frames += 1
                    if frame.time is not None and 0.0 <= float(frame.time) < 100.0:
                        timestamp = float(frame.time)
                    else:
                        timestamp = frames / 30.0
                    if timestamp > 10.0 or frames > 480:
                        break  # Finished reading enough video
                    if timestamp - last < 0.35:
                        continue
                    last = timestamp
                    sampled += 1
                    bgr = frame.to_ndarray(format="bgr24")
                    h, w = bgr.shape[:2]
                    if max(h, w) > 1280:
                        scale = 1280.0 / max(h, w)
                        bgr = self.cv2.resize(bgr, (int(w * scale), int(h * scale)))
                    seen = self.frame(bgr)
                    if seen is None:
                        continue
                    pose, vector, real = seen
                    poses.append(pose)
                    templates.append(vector)
                    scores.append(real)
            except CaptureRejected:
                raise
            except Exception as error:
                raise CaptureRejected("capture_not_usable") from error
            finally:
                container.close()

        if sampled < MIN_FRAMES:
            raise CaptureRejected("too_short")
        if len(poses) < MIN_FRAMES or len(poses) < MIN_FACE_SHARE * sampled:
            raise CaptureRejected("no_face")

        ok, passed_prompts, failed_prompt = movement_evaluation(prompts, poses)
        if not ok:
            return {
                "status": "retry",
                "reason": "movement_not_seen",
                "liveness": "failed",
                "passed_prompts": passed_prompts,
                "failed_prompt": failed_prompt or "movement",
            }, None

        mean_score = float(np.mean(scores))
        if mean_score < REAL_MIN:
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        app.state.models = await anyio.to_thread.run_sync(CpuModels, Path("data/face-models"))
    except (OSError, ValueError, KeyError, ImportError):
        if os.getenv("FACE_REQUIRE_MODELS") == "true":
            raise RuntimeError("Required face models failed to initialize") from None
        app.state.models = None
    app.state.busy = asyncio.Lock()
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
                logger.warning("face_worker_models_unavailable latency_ms=%s", elapsed_ms)
                return {"status": "unavailable", "reason": "models_unavailable"}
            try:
                outcome, vector = await anyio.to_thread.run_sync(
                    models_service.analyze,
                    bytes(data),
                    request.headers.get("x-prompts", "").split(","),
                )
                elapsed_ms = round((time.perf_counter() - start_time) * 1000, 1)
                logger.info(
                    "face_worker_verdict status=%s reason=%s liveness=%s score=%s "
                    "failed_prompt=%s latency_ms=%s bytes=%d",
                    outcome.get("status"),
                    outcome.get("reason"),
                    outcome.get("liveness"),
                    outcome.get("score"),
                    outcome.get("failed_prompt"),
                    elapsed_ms,
                    len(data),
                )
            except CaptureRejected as rejected:
                elapsed_ms = round((time.perf_counter() - start_time) * 1000, 1)
                logger.info(
                    "face_worker_rejected reason=%s latency_ms=%s bytes=%d",
                    rejected.reason,
                    elapsed_ms,
                    len(data),
                )
                return {"status": "retry", "reason": rejected.reason, "liveness": "not_evaluated"}
            except Exception as exc:
                elapsed_ms = round((time.perf_counter() - start_time) * 1000, 1)
                logger.warning(
                    "face_worker_exception error=%s latency_ms=%s bytes=%d",
                    type(exc).__name__,
                    elapsed_ms,
                    len(data),
                )
                return {
                    "status": "retry",
                    "reason": "capture_not_usable",
                    "liveness": "not_evaluated",
                }
            return {**outcome, **({"template": vector, "model": MODEL_ID} if vector else {})}
        finally:
            data.clear()


@app.delete("/template")
async def delete(request: Request):
    """Kept for main-app revisions that still call it: the worker stores no templates."""
    authorize(request)
    return {"status": "deleted"}
