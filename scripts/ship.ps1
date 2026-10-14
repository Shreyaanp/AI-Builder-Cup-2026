# Ship from this machine: local checks in parallel → Cloud Build image → Cloud Run → smoke test.
# GitHub CI still runs on main as a second opinion, but nothing waits for it.
#   powershell -File scripts/ship.ps1            # checks, then release main's HEAD
#   powershell -File scripts/ship.ps1 -SkipChecks
param([switch]$SkipChecks)
$ErrorActionPreference = 'Stop'
$tools = "$env:LOCALAPPDATA\AIBuilderCupTools"
$env:Path = "$tools\node-v24.21.0-win-x64;$tools\mingit\cmd;$env:USERPROFILE\.local\bin;" +
  "$env:LOCALAPPDATA\Google\Cloud SDK\google-cloud-sdk\bin;$env:Path"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$sha = (git rev-parse HEAD).Trim()
if (git status --porcelain --untracked-files=no) { throw 'Commit your changes first: ship releases a commit.' }
$started = Get-Date

if (-not $SkipChecks) {
  Write-Host 'Checks (parallel): types, lint, format, contract, backend tests…'
  $jobs = @(
    Start-Job -Name types -ScriptBlock { param($r, $p) $env:Path = $p; Set-Location $r; npx tsc -b --noEmit 2>&1; if ($LASTEXITCODE) { throw 'tsc' } } -ArgumentList $root, $env:Path
    Start-Job -Name lint -ScriptBlock { param($r, $p) $env:Path = $p; Set-Location $r; npx eslint src --max-warnings 0 2>&1; if ($LASTEXITCODE) { throw 'eslint' } } -ArgumentList $root, $env:Path
    Start-Job -Name format -ScriptBlock { param($r, $p) $env:Path = $p; Set-Location $r; npx prettier --check src tests 2>&1; if ($LASTEXITCODE) { throw 'prettier' } } -ArgumentList $root, $env:Path
    Start-Job -Name backend -ScriptBlock {
      param($r, $p)
      $env:Path = $p; Set-Location "$r\backend"
      $env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8085'
      uv run ruff check app tests 2>&1; if ($LASTEXITCODE) { throw 'ruff' }
      uv run mypy app 2>&1; if ($LASTEXITCODE) { throw 'mypy' }
      uv run pytest -q -x 2>&1 | Select-Object -Last 3; if ($LASTEXITCODE) { throw 'pytest' }
    } -ArgumentList $root, $env:Path
  )
  $jobs | Wait-Job | Out-Null
  $failed = $jobs | Where-Object State -ne 'Completed'
  foreach ($job in $jobs) { Write-Host "  $($job.Name): $($job.State)" }
  if ($failed) {
    $failed | ForEach-Object { Write-Host "---- $($_.Name)"; Receive-Job $_ -ErrorAction SilentlyContinue | Select-Object -Last 25 }
    throw 'Checks failed: nothing released.'
  }
}

$image = "asia-south1-docker.pkg.dev/ichiropractic/ogoogle-ai/app:$sha"
Write-Host "Building $image on Cloud Build…"
gcloud builds submit --project ichiropractic --region asia-south1 --tag $image --quiet .
if ($LASTEXITCODE) { throw 'Cloud Build failed.' }

Write-Host 'Deploying to Cloud Run (existing settings and secrets are kept)…'
gcloud run deploy ogoogle-ai --project ichiropractic --region asia-south1 --image $image --quiet
if ($LASTEXITCODE) { throw 'Cloud Run deploy failed.' }

foreach ($url in 'https://chalkboard.shreyaan.work/', 'https://business.chalkboard.shreyaan.work/api/v1/health') {
  $status = (Invoke-WebRequest $url -UseBasicParsing).StatusCode
  Write-Host "  $url -> $status"
}
Write-Host ("Released {0} in {1:N1} min." -f $sha.Substring(0, 7), ((Get-Date) - $started).TotalMinutes)
