"""Private CPU inference worker. Raw captures never enter a file or a model prompt."""

import asyncio
import hashlib
import io
import json
import os
import secrets
import threading
from contextlib import asynccontextmanager
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

import anyio
import numpy as np
from fastapi import FastAPI, HTTPException, Request
from qdrant_client import QdrantClient, models

MODEL_ID = "intel-face-reidentification-retail-0095-fp32-v1"
MAX_BYTES = 8 * 1024 * 1024


class FaceGallery:
    collection = "face_templates_256_v1"

    def __init__(self, path: str) -> None:
        self.client = QdrantClient(path=path, force_disable_check_same_thread=True)
        self.lock = threading.RLock()
        if not self.client.collection_exists(self.collection):
            self.client.create_collection(
                self.collection,
                vectors_config=models.VectorParams(size=256, distance=models.Distance.COSINE),
            )

    @staticmethod
    def vector(values: np.ndarray) -> list[float]:
        value = np.asarray(values, dtype=np.float32).reshape(-1)
        if value.size != 256 or not np.isfinite(value).all() or np.linalg.norm(value) <= 1e-8:
            raise ValueError("Invalid biometric template")
        return (value / np.linalg.norm(value)).tolist()

    def compare_and_enroll(self, uid: str, vector: list[float], enroll: bool) -> dict[str, str]:
        owner = hashlib.sha256(uid.encode()).hexdigest()
        point_id = str(uuid5(NAMESPACE_URL, MODEL_ID + owner))
        with self.lock:
            own = self.client.retrieve(self.collection, [point_id], with_vectors=True)
            # Exact 1:1 cosine, separate from 1:N retrieval; neither is calibrated proof.
            own_score = float(np.dot(vector, own[0].vector)) if own else None
            others = self.client.query_points(
                self.collection,
                query=vector,
                limit=5,
                query_filter=models.Filter(
                    must_not=[
                        models.FieldCondition(key="owner", match=models.MatchValue(value=owner))
                    ]
                ),
            ).points
            if enroll:
                self.client.upsert(
                    self.collection,
                    [
                        models.PointStruct(
                            id=point_id,
                            vector=vector,
                            payload={
                                "owner": owner,
                                "model": MODEL_ID,
                                "state": "evaluation_candidate",
                            },
                        )
                    ],
                )
        return {
            "one_to_one": "scored_uncalibrated" if own_score is not None else "no_reference",
            "one_to_many": "scored_uncalibrated" if others else "no_candidates",
        }

    def delete(self, uid: str) -> None:
        owner = hashlib.sha256(uid.encode()).hexdigest()
        with self.lock:
            self.client.delete(self.collection, [str(uuid5(NAMESPACE_URL, MODEL_ID + owner))])


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

    def analyze(
        self, video: bytes, prompts: list[str]
    ) -> tuple[dict[str, str], list[float] | None]:
        import av

        poses: list[tuple[float, float]] = []
        templates = []
        scores = []
        container = av.open(io.BytesIO(video))
        try:
            stream = container.streams.video[0]
            if (
                stream.width > 1280
                or stream.height > 720
                or stream.width < 100
                or stream.height < 100
            ):
                raise ValueError("Capture dimensions out of bounds")
            frames = 0
            last = -1.0
            for frame in container.decode(video=0):
                frames += 1
                timestamp = float(frame.time or 0)
                if frames > 480 or timestamp > 8.2:
                    raise ValueError("Capture duration exceeds eight seconds")
                if timestamp - last < 0.45:
                    continue
                last = timestamp
                image = frame.to_ndarray(format="bgr24")
                detections = next(
                    iter(self.infer("face-detection-retail-0004", image).values())
                ).reshape(-1, 7)
                faces = [d for d in detections if d[2] > 0.8]
                if len(faces) != 1:
                    raise ValueError("Exactly one face must remain visible")
                face = faces[0]
                height, width = image.shape[:2]
                x1, y1, x2, y2 = [int(v) for v in face[3:7] * [width, height, width, height]]
                crop = image[max(0, y1) : min(height, y2), max(0, x1) : min(width, x2)]
                if min(crop.shape[:2]) < 60:
                    raise ValueError("Face too small")
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
                    raise ValueError("Face alignment failed")
                aligned = self.cv2.warpAffine(crop, matrix, (128, 128))
                template = next(
                    iter(self.infer("face-reidentification-retail-0095", aligned).values())
                )
                pose = self.infer("head-pose-estimation-adas-0001", crop)
                yaw = float(pose["angle_y_fc"].reshape(-1)[0])
                pitch = float(pose["angle_p_fc"].reshape(-1)[0])
                poses.append((yaw, pitch))
                rgb = self.cv2.cvtColor(
                    self.cv2.resize(crop, (128, 128)), self.cv2.COLOR_BGR2RGB
                ).astype(np.float32)
                normalized = (rgb - [151.2405, 119.5950, 107.8395]) / [63.0105, 56.4570, 55.0035]
                prediction = self.anti.run(
                    None,
                    {
                        self.anti.get_inputs()[0].name: normalized.transpose(2, 0, 1)[None].astype(
                            np.float32
                        )
                    },
                )[0].reshape(-1)
                scores.append(float(prediction[0]))
                templates.append(np.asarray(template).reshape(-1))
            if len(poses) < 6:
                raise ValueError("Capture too short")
            position = 0
            for prompt in prompts:
                found = False
                for index in range(position, len(poses)):
                    yaw, pitch = poses[index]
                    match = (
                        prompt == "turn_left"
                        and yaw > 15
                        or prompt == "turn_right"
                        and yaw < -15
                        or prompt == "look_up"
                        and pitch < -10
                    )
                    if match:
                        position = index + 1
                        found = True
                        break
                if not found:
                    return {
                        "status": "review_pending",
                        "reason": "challenge_not_completed",
                        "liveness": "movement_failed",
                    }, None
            vector = FaceGallery.vector(np.mean(templates, axis=0))
            # Model scores are measured, but no threshold is asserted as validated.
            # Candidate enrollment enables evaluation/recovery, never automatic registration.
            return {
                "status": "review_pending",
                "reason": "calibration_required",
                "liveness": "scored_uncalibrated",
            }, vector
        finally:
            container.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.gallery = FaceGallery("data/face-vectors")
    try:
        app.state.models = await anyio.to_thread.run_sync(CpuModels, Path("data/face-models"))
    except (OSError, ValueError, KeyError, ImportError):
        if os.getenv("FACE_REQUIRE_MODELS") == "true":
            app.state.gallery.client.close()
            raise RuntimeError("Required face models failed to initialize") from None
        app.state.models = None
    app.state.busy = asyncio.Lock()
    try:
        yield
    finally:
        app.state.gallery.client.close()


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
    return {"models_ready": request.app.state.models is not None, "automatic_verification": False}


@app.post("/evaluate")
async def evaluate(request: Request):
    uid = authorize(request)
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
                return {
                    "status": "review_pending",
                    "reason": "models_unavailable",
                    "liveness": "unavailable",
                    "one_to_one": "not_evaluated",
                    "one_to_many": "not_evaluated",
                }
            try:
                outcome, vector = await anyio.to_thread.run_sync(
                    models_service.analyze,
                    bytes(data),
                    request.headers.get("x-prompts", "").split(","),
                )
                if vector is not None:
                    outcome.update(request.app.state.gallery.compare_and_enroll(uid, vector, True))
                return outcome
            except Exception:
                # No decoder/provider exception or capture content in logs/responses.
                return {
                    "status": "review_pending",
                    "reason": "capture_not_usable",
                    "liveness": "not_evaluated",
                    "one_to_one": "not_evaluated",
                    "one_to_many": "not_evaluated",
                }
        finally:
            data.clear()


@app.delete("/template")
async def delete(request: Request):
    uid = authorize(request)
    async with request.app.state.busy:
        request.app.state.gallery.delete(uid)
    return {"status": "deleted"}
