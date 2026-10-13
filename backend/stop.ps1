$ErrorActionPreference = 'Stop'
$taskPidFile = Join-Path $PSScriptRoot '..\artifacts\backend.pid'
if (-not (Test-Path -LiteralPath $taskPidFile)) { Write-Output 'No backend process recorded.'; exit 0 }
$taskProcessId = [int](Get-Content -LiteralPath $taskPidFile)
$taskProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$taskProcessId"
if ($taskProcess -and $taskProcess.Name -eq 'python.exe' -and $taskProcess.CommandLine.Contains((Join-Path $PSScriptRoot 'run.py'))) {
  Stop-Process -Id $taskProcessId
  Write-Output 'Stopped oGoogle AI backend.'
} elseif ($taskProcess) { throw 'Recorded PID belongs to another process; it was left running.' }
Remove-Item -LiteralPath $taskPidFile
