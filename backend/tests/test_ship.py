"""Exercise release guardrails with mocked commands; no git remote or cloud calls."""

import hashlib
import shutil
import subprocess
from pathlib import Path

import pytest

SHELL = shutil.which("pwsh") or shutil.which("powershell")
ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/ship.ps1"
FACE_SCRIPT = ROOT / "scripts/ship-face.ps1"
FACE_INPUTS = [
    "backend/face.Dockerfile",
    "backend/face_worker.py",
    "backend/scripts/fetch_face_models.py",
    "backend/pyproject.toml",
    "backend/uv.lock",
]

# Synthetic cloud answers. `gcloud` records every call; describe returns the running image.
GCLOUD = r"""
$global:gcloudCalls = @()
function gcloud {
  $global:gcloudCalls += ,($args -join ' ')
  $global:LASTEXITCODE = 0
  $line = $args -join ' '
  if ($line -like 'run services describe*--format=json*') {
    # $global:pinned: traffic stuck on an older revision (left by a no-traffic release).
    $first = '"latestRevision":true'
    if ($global:pinned) { $first = '"revisionName":"ogoogle-face-00001"' }
    $running = 'asia-south1-docker.pkg.dev/ichiropractic/ogoogle-ai/face:' + $global:runningTag
    '{"spec":{"template":{"spec":{"containers":[{"image":"' + $running + '"}]}}},' +
      '"status":{"url":"https://ogoogle-face-fixture.a.run.app","traffic":[' +
      '{"percent":100,' + $first + '},' +
      '{"revisionName":"ogoogle-face-00002","tag":"test","url":"https://test---ogoogle-face-fixture.a.run.app"}]}}'
  } elseif ($line -like 'artifacts docker images list*') {
    if ($global:imageBuilt) { 'sha256:fixture' }
  } elseif ($line -like 'run deploy*' -or $line -like 'builds submit*' -or
    $line -like 'run services update-traffic*') {
  } else { throw "Unexpected gcloud operation: $line" }
}
"""


def face_tag() -> str:
    """deploy.yml's tag: sha256 over the committed inputs, as a Linux checkout has them."""
    data = b"".join(
        subprocess.run(
            ["git", "show", f"HEAD:{name}"], cwd=ROOT, capture_output=True, check=True
        ).stdout
        for name in FACE_INPUTS
    )
    return "inputs-" + hashlib.sha256(data).hexdigest()[:16]


def run(code: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [SHELL, "-NoProfile", "-NonInteractive", "-Command", code],
        capture_output=True,
        text=True,
        timeout=60,
    )


def quoted(path: Path) -> str:
    return str(path).replace("'", "''")


@pytest.mark.skipif(not SHELL, reason="PowerShell is unavailable")
@pytest.mark.parametrize(
    "failure", ["dirty", "status", "tag", "ancestry", "remote", "dispatch", "none"]
)
def test_ship_checks_tag_and_clean_tree_before_dispatch(failure):
    # All outputs are synthetic fixture values. The mocks shadow executable commands.
    code = (
        GCLOUD
        + r"""
    $global:releaseFailure = 'FAILURE'
    $global:runningTag = 'TAG'
    $global:dispatchCalled = $false
    $realGit = Get-Command git -CommandType Application | Select-Object -First 1
    function git {
      $global:LASTEXITCODE = 0
      switch ($args[0]) {
        'status' {
          if ($global:releaseFailure -eq 'dirty') { '?? unsaved.txt' }
          if ($global:releaseFailure -eq 'status') { $global:LASTEXITCODE=1 }
        }
        'rev-parse' {
          if ($args[1] -eq '--verify' -and $global:releaseFailure -eq 'tag') { 'wrong' }
          else { 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }
        }
        'merge-base' { if ($global:releaseFailure -eq 'ancestry') { $global:LASTEXITCODE=1 } }
        'ls-remote' {
          if ($global:releaseFailure -eq 'remote') { "wrong`trefs/tags/release-fixture" }
          else { "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`trefs/tags/release-fixture" }
        }
        'diff' { }
        # The face worker's inputs come from the real HEAD (read-only).
        '-c' { & $realGit @args; $global:LASTEXITCODE = $LASTEXITCODE }
        default { throw 'Unexpected git operation' }
      }
    }
    function gh {
      $global:dispatchCalled = $true
      $expected = '*revision=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa*' +
        'release_tag=release-fixture'
      if (($args -join ' ') -notlike $expected) { throw 'Wrong dispatch SHA or tag' }
      $global:LASTEXITCODE = if ($global:releaseFailure -eq 'dispatch') { 1 } else { 0 }
    }
    try {
      & 'SCRIPT' -Tag release-fixture
      if ($global:releaseFailure -ne 'none') { exit 2 }
      if (-not $global:dispatchCalled) { exit 3 }
      # The worker already runs these inputs: it is only looked at, never rebuilt.
      if ($global:gcloudCalls | Where-Object { $_ -like 'run deploy*' -or $_ -like 'builds*' }) {
        exit 6
      }
    } catch {
      if ($global:releaseFailure -eq 'none') { Write-Output $_; exit 4 }
      if ($global:dispatchCalled -and $global:releaseFailure -ne 'dispatch') { exit 5 }
      # Guardrails fail before any cloud call.
      if ($global:releaseFailure -ne 'dispatch' -and $global:gcloudCalls.Count) { exit 7 }
    }
    exit 0
    """.replace("FAILURE", failure)
        .replace("SCRIPT", quoted(SCRIPT))
        .replace("TAG", face_tag())
    )
    result = run(code)
    assert result.returncode == 0, result.stdout + result.stderr


@pytest.mark.skipif(not SHELL, reason="PowerShell is unavailable")
@pytest.mark.parametrize(("revision_tag", "built"), [("", False), ("", True), ("test", False)])
def test_face_worker_is_built_and_released_like_deploy_yml(revision_tag, built):
    code = (
        GCLOUD
        + r"""
    $global:runningTag = 'inputs-0000000000000000'
    $global:imageBuilt = BUILT
    $global:pinned = $true
    $realGit = Get-Command git -CommandType Application | Select-Object -First 1
    function git {
      $global:LASTEXITCODE = 0
      if ($args[0] -eq 'diff') { return }
      if ($args[0] -ne '-c') { throw 'Unexpected git operation' }
      & $realGit @args; $global:LASTEXITCODE = $LASTEXITCODE
    }
    try { & 'SCRIPT' REVISION } catch { Write-Output $_; exit 4 }
    $global:gcloudCalls | ForEach-Object { "CALL $_" }
    """.replace("SCRIPT", quoted(FACE_SCRIPT))
        .replace("REVISION", f"-RevisionTag {revision_tag}" if revision_tag else "")
        .replace("BUILT", "$true" if built else "$false")
    )
    result = run(code)
    assert result.returncode == 0, result.stdout + result.stderr
    calls = [line[5:] for line in result.stdout.splitlines() if line.startswith("CALL ")]
    image = "asia-south1-docker.pkg.dev/ichiropractic/ogoogle-ai/face:" + face_tag()
    builds = [call for call in calls if call.startswith("builds submit")]
    assert len(builds) == (0 if built else 1)
    if builds:
        assert f"--tag={image}" in builds[0] and "--region=asia-south1" in builds[0]
    (deploy,) = [call for call in calls if call.startswith("run deploy ogoogle-face")]
    # The same account, secret and limits as deploy.yml's "Release private face worker".
    for flag in [
        f"--image={image}",
        "--service-account=ogoogle-face-runtime@ichiropractic.iam.gserviceaccount.com",
        "--set-secrets=FACE_WORKER_TOKEN=ogoogle-face-token:1",
        "--set-env-vars=FACE_REQUIRE_MODELS=true",
        "--no-allow-unauthenticated --min=0 --max=1 --concurrency=1",
        "--cpu=1 --memory=2Gi --timeout=60 --cpu-boost",
    ]:
        assert flag in deploy
    if revision_tag:
        assert "--no-traffic --tag=test" in deploy
        assert "https://test---ogoogle-face-fixture.a.run.app" in result.stdout
        # A staged revision leaves production traffic where it is.
        assert not [call for call in calls if "update-traffic" in call]
    else:
        assert "--no-traffic" not in deploy and "--tag=" not in deploy
        assert "https://ogoogle-face-fixture.a.run.app" in result.stdout
        # Traffic follows the release even when an earlier staged revision pinned it.
        assert calls.index(deploy) < calls.index(
            "run services update-traffic ogoogle-face --project=ichiropractic "
            "--region=asia-south1 --to-latest --quiet"
        )


@pytest.mark.skipif(not SHELL, reason="PowerShell is unavailable")
@pytest.mark.parametrize("pinned", [False, True])
def test_a_current_worker_is_not_rebuilt_but_pinned_traffic_is_moved_to_it(pinned):
    """Regression: a no-traffic test release pinned traffic to the old worker, so the next
    release deployed the new image with no traffic and production kept the old one."""
    code = (
        GCLOUD
        + r"""
    $global:runningTag = 'TAG'
    $global:pinned = PINNED
    $realGit = Get-Command git -CommandType Application | Select-Object -First 1
    function git {
      $global:LASTEXITCODE = 0
      if ($args[0] -eq 'diff') { return }
      & $realGit @args; $global:LASTEXITCODE = $LASTEXITCODE
    }
    try { & 'SCRIPT' } catch { Write-Output $_; exit 4 }
    $global:gcloudCalls | ForEach-Object { "CALL $_" }
    """.replace("SCRIPT", quoted(FACE_SCRIPT))
        .replace("TAG", face_tag())
        .replace("PINNED", "$true" if pinned else "$false")
    )
    result = run(code)
    assert result.returncode == 0, result.stdout + result.stderr
    calls = [line[5:] for line in result.stdout.splitlines() if line.startswith("CALL ")]
    assert not [call for call in calls if call.startswith(("builds", "run deploy"))]
    moved = [call for call in calls if "update-traffic" in call and "--to-latest" in call]
    assert len(moved) == (1 if pinned else 0)
