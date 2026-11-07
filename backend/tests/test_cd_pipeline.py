"""Release pipeline guards: OB-15 (CD drops live settings), OB-93 (pinned traffic)."""

import json
import runpy
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEPLOY = (ROOT / ".github/workflows/deploy.yml").read_text(encoding="utf-8")


def _render_config(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    (tmp_path / "deployment").mkdir()
    (tmp_path / "deployment/target.json").write_text((ROOT / "deployment/target.json").read_text())
    monkeypatch.setenv("FIREBASE_WEB_API_KEY", "fixture-key")
    monkeypatch.setenv("FIREBASE_WEB_APP_ID", "fixture-app")
    monkeypatch.setenv("FACE_WORKER_URL", "https://fixture-worker.example/")
    runpy.run_path(str(ROOT / "deployment/runtime-config.py"))
    return json.loads((tmp_path / ".deployment/runtime.json").read_text())


def _live(plain, secrets):
    env = [{"name": n, "value": v} for n, v in plain.items()]
    env += [{"name": n, "valueFrom": {"secretKeyRef": {"name": "x", "key": "1"}}} for n in secrets]
    return {"spec": {"template": {"spec": {"containers": [{"env": env}]}}}}


def _drift(tmp_path, live):
    live_file = tmp_path / "live.json"
    live_file.write_text(json.dumps(live))
    return subprocess.run(
        [
            sys.executable,
            str(ROOT / "scripts/check-env-drift.py"),
            "--live-file",
            str(live_file),
            "--rendered",
            str(tmp_path / ".deployment/runtime.json"),
            "--secrets",
            str(ROOT / "deployment/secrets.json"),
        ],
        capture_output=True,
        text=True,
    )


def test_ob15_update_env_vars_file_carries_every_rendered_setting(monkeypatch, tmp_path):
    config = _render_config(monkeypatch, tmp_path)
    flag = (tmp_path / ".deployment/update-env-vars.txt").read_text()
    assert flag.startswith("^|^")
    names = {part.split("=", 1)[0] for part in flag[3:].split("|")}
    assert names == set(config)
    # The live-only settings the old --env-vars-file release would have dropped.
    assert {"WEB_PUSH_ENABLED", "REMINDERS_CALLER", "GEMINI_CONTEXT_CACHE"} <= names
    assert config["LANDING_VARIANT"] == "new"
    assert "candidate---" in config["ALLOWED_ORIGINS"]
    secrets = json.loads((ROOT / "deployment/secrets.json").read_text())
    assert not set(secrets) & set(config)


def test_ob15_drift_check_fails_on_a_live_variable_the_release_would_drop(monkeypatch, tmp_path):
    config = _render_config(monkeypatch, tmp_path)
    secrets = json.loads((ROOT / "deployment/secrets.json").read_text())
    ok = _drift(tmp_path, _live(config, secrets))
    assert ok.returncode == 0, ok.stdout + ok.stderr
    drifted = _drift(tmp_path, _live({**config, "SET_BY_HAND": "1"}, secrets))
    assert drifted.returncode == 1
    assert "SET_BY_HAND" in drifted.stdout


def test_ob15_ob93_deploy_workflow_is_a_candidate_first_rollout():
    assert "workflow_run:" in DEPLOY and "'oGoogle AI checks'" in DEPLOY
    assert "--env-vars-file" not in DEPLOY
    assert "--update-env-vars" in DEPLOY and "--update-secrets" in DEPLOY
    for kept in ("--min=1", "--max=20", "--no-cpu-throttling", "--session-affinity", "--cpu-boost"):
        assert kept in DEPLOY
    order = [
        DEPLOY.index(marker)
        for marker in (
            "--no-traffic --tag=candidate",
            "scripts/prod-smoke.mjs",
            "--to-revisions=",
            "--to-latest --quiet\n          gcloud run services update-traffic ogoogle-ai",
        )
    ]
    assert order == sorted(order)
    # Traffic ends on "latest" so the next deploy is not silently dark (OB-93).
    assert "--remove-tags=candidate" in DEPLOY
    assert "PREVIOUS_REVISION" in DEPLOY
