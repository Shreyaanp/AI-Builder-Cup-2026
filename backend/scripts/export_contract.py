import json
from pathlib import Path

from app.contracts import StreamEvent, VoiceControl
from app.features import FeatureFlags
from app.main import create_app
from app.settings import Settings

# Schema export uses offline settings and never runs startup/provider calls.
app = create_app(Settings(app_env="test", coach_mode="offline", auth_mode="local", _env_file=None))
schema = app.openapi()
schema.setdefault("components", {}).setdefault("schemas", {}).update(
    {
        "StreamEvent": StreamEvent.model_json_schema(),
        "VoiceControl": VoiceControl.model_json_schema(),
        "FeatureFlags": FeatureFlags.model_json_schema(),
    }
)
target = Path("openapi.json")
target.parent.mkdir(exist_ok=True)
target.write_text(json.dumps(schema, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("Exported offline OpenAPI and streaming event contracts.")
