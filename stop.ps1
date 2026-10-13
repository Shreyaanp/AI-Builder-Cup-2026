$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'backend\stop.ps1')
$taskPidFile = Join-Path $PSScriptRoot 'artifacts\dev.pid'
if (-not (Test-Path -LiteralPath $taskPidFile)) { Write-Output 'No starter process recorded.'; exit 0 }
$taskProcessId = [int](Get-Content -LiteralPath $taskPidFile)
$taskProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$taskProcessId"
if ($taskProcess -and $taskProcess.Name -eq 'node.exe' -and $taskProcess.CommandLine.Contains((Join-Path $PSScriptRoot 'node_modules\vite\bin\vite.js'))) {
  Stop-Process -Id $taskProcessId
  Write-Output 'Stopped oGoogle AI frontend.'
} elseif ($taskProcess) { throw 'Recorded PID belongs to another process; it was left running.' }
Remove-Item -LiteralPath $taskPidFile
