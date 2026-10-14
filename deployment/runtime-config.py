"""Generate an ephemeral Cloud Run environment file without printing its contents."""

import json
import os
from pathlib import Path

target = json.loads(Path("deployment/target.json").read_text())
required = ["FIREBASE_WEB_API_KEY", "FIREBASE_WEB_APP_ID", "FACE_WORKER_URL"]
if any(not os.getenv(name) for name in required):
    raise SystemExit("Required Firebase or private face worker configuration is missing.")
origin = f"https://{target['service']}-{target['projectNumber']}.{target['region']}.run.app"
config = {
    "APP_ENV": "production",
    "AUTH_MODE": "firebase",
    "SESSION_BACKEND": "firestore",
    "COACH_MODE": "gemini",
    "GEMINI_BACKEND": "vertex",
    # Chat + photo reading: the model the live coach evaluation passed with.
    "GOOGLE_CLOUD_LOCATION": "global",
    "GOOGLE_TEXT_MODEL": "gemini-3.5-flash-lite",
    # Live voice models are regional (not served at `global`).
    "GOOGLE_LIVE_LOCATION": "us-central1",
    "GOOGLE_LIVE_MODEL": "gemini-3.8-live",
    "GOOGLE_EMBEDDING_LOCATION": "global",
    "V1_ENABLED": "true",
    "MERCHANT_BACKEND": "firestore",
    "MODERATION_MODE": "vision",
    "MEDIA_BUCKET": "ichiropractic-shop-photos",
    "GOOGLE_CLOUD_PROJECT": target["projectId"],
    "FIRESTORE_DATABASE": target["firestoreDatabase"],
    "FIRESTORE_NAMESPACE": target["firestoreNamespace"],
    "ALLOWED_ORIGINS": json.dumps([origin]),
    "FIREBASE_WEB_API_KEY": os.environ["FIREBASE_WEB_API_KEY"].strip(),
    "FIREBASE_WEB_APP_ID": os.environ["FIREBASE_WEB_APP_ID"].strip(),
    "FIREBASE_AUTH_DOMAIN": f"{target['projectId']}.firebaseapp.com",
    "RELEASE_COMMIT": os.environ.get("RELEASE_SHA", "local"),
    "MAX_ACTIVE_RUNS": "8",
    "MAX_TURN_SECONDS": "30",
    "MAX_VOICE_SECONDS": "120",
    "FACE_WORKER_URL": os.environ["FACE_WORKER_URL"].strip().rstrip("/"),
}
output = Path(".deployment/runtime.json")
output.parent.mkdir(exist_ok=True)
output.write_text(json.dumps(config), encoding="utf-8")
print("Prepared ignored Cloud Run runtime configuration; Vertex Gemini uses the runtime identity.")
