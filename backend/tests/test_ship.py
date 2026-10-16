"""Exercise release guardrails with mocked commands; no git remote or cloud calls."""

import shutil
import subprocess
from pathlib import Path

import pytest

SHELL = shutil.which("pwsh") or shutil.which("powershell")
SCRIPT = Path(__file__).resolve().parents[2] / "scripts/ship.ps1"


@pytest.mark.skipif(not SHELL, reason="PowerShell is unavailable")
@pytest.mark.parametrize(
    "failure", ["dirty", "status", "tag", "ancestry", "remote", "dispatch", "none"]
)
def test_ship_checks_tag_and_clean_tree_before_dispatch(failure):
    # All outputs are synthetic fixture values. The mocks shadow executable commands.
    code = r"""
    $global:releaseFailure = 'FAILURE'
    $global:dispatchCalled = $false
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
    function gcloud { throw 'Direct cloud operations are forbidden' }
    try {
      & 'SCRIPT' -Tag release-fixture
      if ($global:releaseFailure -ne 'none') { exit 2 }
      if (-not $global:dispatchCalled) { exit 3 }
    } catch {
      if ($global:releaseFailure -eq 'none') { Write-Output $_; exit 4 }
      if ($global:dispatchCalled -and $global:releaseFailure -ne 'dispatch') { exit 5 }
    }
    exit 0
    """.replace("FAILURE", failure).replace("SCRIPT", str(SCRIPT).replace("'", "''"))
    result = subprocess.run(
        [SHELL, "-NoProfile", "-NonInteractive", "-Command", code],
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert result.returncode == 0, result.stdout + result.stderr
