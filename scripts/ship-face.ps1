# Release the private face worker (ogoogle-face) when its inputs changed since the image it
# runs. Mirrors the face steps in .github/workflows/deploy.yml: the same inputs-<hash> image
# tag, runtime account, token secret and limits. scripts/ship.ps1 runs this before it
# dispatches the main release; on its own it can also stage a revision without traffic:
#   powershell -File scripts/ship-face.ps1                    # production, only if changed
#   powershell -File scripts/ship-face.ps1 -RevisionTag test  # https://test---ogoogle-face-…
param([ValidatePattern('^([a-z][a-z0-9-]{0,45})?$')][string]$RevisionTag = '')
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

$project = 'ichiropractic'
$region = 'asia-south1'
$repository = "$region-docker.pkg.dev/$project/ogoogle-ai/face"
# Same files, same order as deploy.yml's "Check face worker inputs".
$inputs = @(
  'backend/face.Dockerfile', 'backend/face_worker.py', 'backend/scripts/fetch_face_models.py',
  'backend/pyproject.toml', 'backend/uv.lock'
)

git diff --quiet HEAD -- @inputs
if ($LASTEXITCODE) { throw 'Commit the face worker changes first: the worker is built from HEAD.' }

# The committed bytes (LF, as CI's Linux checkout sees them), not a Windows CRLF working copy:
# what is hashed is exactly what Cloud Build receives.
$work = Join-Path ([System.IO.Path]::GetTempPath()) ('ogoogle-face-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory $work | Out-Null
try {
  $archive = Join-Path $work 'inputs.zip'
  git -c core.autocrlf=false archive --format=zip -o $archive HEAD @inputs
  if ($LASTEXITCODE) { throw 'Cannot export the face worker inputs at HEAD.' }
  Expand-Archive -Path $archive -DestinationPath $work
  Remove-Item $archive
  $all = New-Object System.IO.MemoryStream
  foreach ($file in $inputs) {
    $bytes = [System.IO.File]::ReadAllBytes((Join-Path $work $file))
    $all.Write($bytes, 0, $bytes.Length)
  }
  $digest = [System.Security.Cryptography.SHA256]::Create().ComputeHash($all.ToArray())
  $tag = 'inputs-' + (-join ($digest | ForEach-Object { $_.ToString('x2') })).Substring(0, 16)
  $image = "${repository}:$tag"

  $current = gcloud run services describe ogoogle-face "--project=$project" "--region=$region" `
    '--format=value(spec.template.spec.containers[0].image)'
  if ($LASTEXITCODE) { throw 'Cannot read the running face worker.' }
  if (-not $RevisionTag -and "$current".EndsWith(":$tag")) {
    Write-Host "Face worker already runs $tag; nothing to release."
    return
  }

  $built = gcloud artifacts docker images list $repository --include-tags "--filter=tags:$tag" `
    '--format=value(version)'
  if ($LASTEXITCODE) { throw 'Cannot list face worker images.' }
  if ($built) {
    Write-Host "Image $tag already built; releasing it."
  } else {
    Write-Host "Building $image on Cloud Build (models are fetched and verified in the image)…"
    Copy-Item (Join-Path $work 'backend/face.Dockerfile') (Join-Path $work 'Dockerfile')
    gcloud builds submit $work "--project=$project" "--region=$region" "--tag=$image" `
      '--timeout=1800s' --quiet
    if ($LASTEXITCODE) { throw 'Face worker build failed.' }
  }

  $deploy = @(
    'run', 'deploy', 'ogoogle-face', "--project=$project", "--region=$region", "--image=$image",
    '--service-account=ogoogle-face-runtime@ichiropractic.iam.gserviceaccount.com',
    '--set-secrets=FACE_WORKER_TOKEN=ogoogle-face-token:1',
    '--set-env-vars=FACE_REQUIRE_MODELS=true',
    '--no-allow-unauthenticated', '--min=0', '--max=1', '--concurrency=1',
    '--cpu=1', '--memory=2Gi', '--timeout=60', '--cpu-boost', '--quiet'
  )
  # A tagged revision gets its own URL and no share of production traffic.
  if ($RevisionTag) { $deploy += @('--no-traffic', "--tag=$RevisionTag") }
  gcloud @deploy
  if ($LASTEXITCODE) { throw 'Face worker release failed.' }

  $service = gcloud run services describe ogoogle-face "--project=$project" "--region=$region" `
    '--format=json' | ConvertFrom-Json
  $url = if ($RevisionTag) {
    ($service.status.traffic | Where-Object { $_.tag -eq $RevisionTag }).url
  } else { $service.status.url }
  if (-not $url) { throw 'The released face worker has no URL.' }
  Write-Host "Face worker $tag released: $url"
} finally {
  Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
}
