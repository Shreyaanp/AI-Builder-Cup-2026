param([int]$Port = 3200)
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'backend\start.ps1')
$taskNodePath = Join-Path $env:LOCALAPPDATA 'AIBuilderCupTools\node-v24.21.0-win-x64\node.exe'
if (-not (Test-Path -LiteralPath $taskNodePath)) { $taskNodePath = (Get-Command node -ErrorAction Stop).Source }
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
  Write-Output "Port $Port is already in use. Open http://127.0.0.1:$Port or choose another port."
  exit 0
}
$taskOutputDirectory = Join-Path $PSScriptRoot 'artifacts'
New-Item -ItemType Directory -Force -Path $taskOutputDirectory | Out-Null
$taskVitePath = Join-Path $PSScriptRoot 'node_modules\vite\bin\vite.js'
if (-not (Test-Path -LiteralPath $taskVitePath)) { throw 'Install dependencies with npm ci first.' }
$taskProcess = Start-Process -FilePath $taskNodePath -ArgumentList @(('"' + $taskVitePath + '"'), '--host', '127.0.0.1', '--port', $Port, '--strictPort') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskOutputDirectory 'dev.stdout.log') -RedirectStandardError (Join-Path $taskOutputDirectory 'dev.stderr.log') -PassThru
$taskProcess.Id | Set-Content -LiteralPath (Join-Path $taskOutputDirectory 'dev.pid')
Write-Output "oGoogle AI: http://127.0.0.1:$Port"
