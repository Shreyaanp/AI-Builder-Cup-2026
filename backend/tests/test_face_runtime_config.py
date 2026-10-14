import json
import runpy
from pathlib import Path

import pytest


def test_runtime_config_requires_worker_url_and_keeps_token_out(monkeypatch, tmp_path):
    script = Path(__file__).resolve().parents[2] / "deployment/runtime-config.py"
    monkeypatch.chdir(tmp_path)
    deployment = tmp_path / "deployment"
    deployment.mkdir()
    (deployment / "target.json").write_text(
        json.dumps(
            {
                "service": "fixture-main",
                "projectNumber": "123",
                "region": "asia-south1",
                "projectId": "demo-fixture",
                "firestoreDatabase": "(default)",
                "firestoreNamespace": "ogoogle_ai_fixture",
            }
        )
    )
    monkeypatch.setenv("FIREBASE_WEB_API_KEY", "fixture-browser-key")
    monkeypatch.setenv("FIREBASE_WEB_APP_ID", "fixture-app")
    monkeypatch.setenv("FACE_WORKER_TOKEN", "fixture-only")
    monkeypatch.delenv("FACE_WORKER_URL", raising=False)
    with pytest.raises(SystemExit, match="private face worker configuration"):
        runpy.run_path(str(script))
    monkeypatch.setenv("FACE_WORKER_URL", "https://fixture-worker.example/")
    runpy.run_path(str(script))
    config = json.loads((tmp_path / ".deployment/runtime.json").read_text())
    assert config["FACE_WORKER_URL"] == "https://fixture-worker.example"
    assert "FACE_WORKER_TOKEN" not in config
