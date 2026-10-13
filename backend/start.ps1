$ErrorActionPreference = 'Stop'
if (Get-NetTCPConnection -LocalPort 3300 -State Listen -ErrorAction SilentlyContinue) {
  Write-Output 'Backend port 3300 is already in use.'
  exit 0
}
$taskPython = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $taskPython)) { throw 'Run uv sync --locked in backend first.' }
$taskOutputDirectory = Join-Path $PSScriptRoot '..\artifacts'
New-Item -ItemType Directory -Force -Path $taskOutputDirectory | Out-Null
$taskEntry = Join-Path $PSScriptRoot 'run.py'
$taskSavedEnvironment = @{}
foreach ($taskName in @('COACH_MODE', 'AUTH_MODE', 'APP_ENV')) {
  $taskSavedEnvironment[$taskName] = [Environment]::GetEnvironmentVariable($taskName, 'Process')
}
try {
  $env:COACH_MODE = 'offline'
  $env:AUTH_MODE = 'local'
  $env:APP_ENV = 'local'
  $taskProcess = Start-Process -FilePath $taskPython -ArgumentList @(('"' + $taskEntry + '"')) -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskOutputDirectory 'backend.stdout.log') -RedirectStandardError (Join-Path $taskOutputDirectory 'backend.stderr.log') -PassThru
  $taskProcess.Id | Set-Content -LiteralPath (Join-Path $taskOutputDirectory 'backend.pid')
} finally {
  foreach ($taskName in $taskSavedEnvironment.Keys) {
    [Environment]::SetEnvironmentVariable($taskName, $taskSavedEnvironment[$taskName], 'Process')
  }
}
Write-Output 'oGoogle AI backend: http://127.0.0.1:3300/docs (offline review mode)'
