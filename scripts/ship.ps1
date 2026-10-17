# One release path: validate a clean tagged main commit, then dispatch checked CI.
# No credentials or generated runtime files are read by this script.
param([Parameter(Mandatory = $true)][ValidatePattern('^release-[a-zA-Z0-9._-]+$')][string]$Tag)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

$sha = (git rev-parse HEAD).Trim()
if ($LASTEXITCODE) { throw 'Cannot resolve HEAD.' }
$changes = @(git status --porcelain --untracked-files=all)
if ($LASTEXITCODE) { throw 'Cannot verify the checkout is clean.' }
if ($changes.Count) { throw 'Release requires a clean checkout, including untracked files.' }
$tagSha = git rev-parse --verify "refs/tags/${Tag}^{commit}" 2>$null
if ($LASTEXITCODE -or $tagSha -ne $sha) { throw 'Release tag must point at HEAD.' }
git merge-base --is-ancestor $sha origin/main
if ($LASTEXITCODE) { throw 'Release commit must belong to origin/main.' }

# Only published tags may release. Do not refresh the checkout or remote history here.
$remoteTag = @(git ls-remote --tags origin "refs/tags/$Tag" "refs/tags/$Tag^{}")
if ($LASTEXITCODE) { throw 'Cannot verify the published tag.' }
$remoteSha = if ($remoteTag.Count) { ($remoteTag[-1] -split '\s+')[0] } else { '' }
if ($remoteSha -ne $sha) { throw 'Publish the exact release tag before shipping.' }

# The private face worker first, when its inputs changed since the image it runs (deploy.yml's
# face step then finds it current). Main releases that skipped it left an old worker behind.
& (Join-Path $PSScriptRoot 'ship-face.ps1')

# CI gates this SHA, builds its image, applies runtime-config.py, and verifies health/SHA.
# Capacity is deliberately managed separately (docs/release-checklist.md).
gh workflow run deploy.yml --ref main -f "revision=$sha" -f "release_tag=$Tag"
if ($LASTEXITCODE) { throw 'Release dispatch failed.' }
Write-Host "Queued release $Tag ($sha). Dispatch is not deployment success."
Write-Host 'Use gh run list --workflow deploy.yml, then gh run watch <run-id> --exit-status.'
