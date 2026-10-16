"""Private CPU inference worker. Raw captures never enter a file or a model prompt.

The worker keeps nothing: it answers whether a short capture shows one live person following
the prompted head movements and, only then, returns that capture's face template. The main app
encrypts templates and keeps the gallery (a worker instance is ephemeral and per instance, so a
gallery here lost every template on scale-down and duplicate owners were never found).
"""

import asyncio
import hashlib
import io
import json
import os
import secrets
from contextlib import asynccontextmanager
from pathlib import Path

import anyio
import numpy as np
from fastapi import FastAPI, HTTPException, Request

MODEL_ID = "intel-face-reidentification-retail-0095-fp32-v1"
MAX_BYTES = 8 * 1024 * 1024
# anti-spoof-mn3 class 0 is "real person" (model README). Its mean over the sampled frames must
# reach this; one bad frame does not decide. A screen or print scores near zero.
REAL_MIN = 0.5
# Frames without exactly one clear face (motion blur, a turned head) are skipped, but most
# sampled frames must show the face.
MIN_FRAMES = 6
MIN_FACE_SHARE = 0.6


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


def movement_seen(prompts: list[str], poses: list[tuple[float, float]]) -> bool:
    """Each prompted movement, in order: a head turn is |yaw| > 15 degrees, looking up is
    |pitch| > 10. Turn direction is not tied to one sign convention (not yet checked on real
    video); a left-then-right challenge needs its two turns on opposite sides instead."""
    position = 0
    turns: list[float] = []
    for prompt in prompts:
        for index in range(position, len(poses)):
            yaw, pitch = poses[index]
            if prompt in {"turn_left", "turn_right"} and abs(yaw) > 15:
                turns.append(yaw)
                break
            if prompt == "look_up" and abs(pitch) > 10:
                break
        else:
            return False
        position = index + 1
    return len(turns) < 2 or (turns[0] > 0) != (turns[1] > 0)


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
        faces = [d for d in detections if d[2] > 0.8]
        if len(faces) > 1:
            # Someone else in view is never skipped: the check is about one person.
            raise CaptureRejected("several_faces")
        if not faces:
            return None
        face = faces[0]
        height, width = image.shape[:2]
        x1, y1, x2, y2 = [int(v) for v in face[3:7] * [width, height, width, height]]
        crop = image[max(0, y1) : min(height, y2), max(0, x1) : min(width, x2)]
        if min(crop.shape[:2]) < 60:
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
    ) -> tuple[dict[str, str], list[float] | None]:
        import av

        poses: list[tuple[float, float]] = []
        templates = []
        scores = []
        sampled = 0
        try:
            container = av.open(io.BytesIO(video))
        except Exception as error:
            raise CaptureRejected("capture_not_usable") from error
        try:
            stream = container.streams.video[0]
            # Landscape or portrait (phones record 720x1280 upright): up to 1280 x 720.
            short, long = sorted((stream.width, stream.height))
            if not (100 <= short <= 720 and long <= 1280):
                raise CaptureRejected("capture_not_usable")
            frames = 0
            last = -1.0
            for frame in container.decode(video=0):
                frames += 1
                timestamp = float(frame.time or 0)
                if frames > 480 or timestamp > 8.2:
                    raise CaptureRejected("capture_not_usable")
                if timestamp - last < 0.45:
                    continue
                last = timestamp
                sampled += 1
                seen = self.frame(frame.to_ndarray(format="bgr24"))
                if seen is None:
                    continue
                pose, vector, real = seen
                poses.append(pose)
                templates.append(vector)
                scores.append(real)
        finally:
            container.close()
        if sampled < MIN_FRAMES:
            raise CaptureRejected("too_short")
        if len(poses) < MIN_FRAMES or len(poses) < MIN_FACE_SHARE * sampled:
            raise CaptureRejected("no_face")
        if not movement_seen(prompts, poses):
            return {"status": "retry", "reason": "movement_not_seen", "liveness": "failed"}, None
        if float(np.mean(scores)) < REAL_MIN:
            return {"status": "retry", "reason": "not_live", "liveness": "failed"}, None
        # Liveness is measured, not certified: the app treats a pass as "checked", and any
        # match against another owner goes to a person, never to an automatic decision.
        return {"status": "live", "reason": "ok", "liveness": "passed"}, template(
            np.mean(templates, axis=0)
        )


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
        try:
            async with asyncio.timeout(10):
                async for chunk in request.stream():
                    if len(data) + len(chunk) > MAX_BYTES:
                        raise HTTPException(413, "Capture too large")
                    data.extend(chunk)
            models_service = request.app.state.models
            if models_service is None:
                return {"status": "unavailable", "reason": "models_unavailable"}
            try:
                outcome, vector = await anyio.to_thread.run_sync(
                    models_service.analyze,
                    bytes(data),
                    request.headers.get("x-prompts", "").split(","),
                )
            except CaptureRejected as rejected:
                return {"status": "retry", "reason": rejected.reason, "liveness": "not_evaluated"}
            except Exception:
                # No decoder/provider exception or capture content in logs/responses.
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
