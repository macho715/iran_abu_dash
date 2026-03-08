$ErrorActionPreference = "Stop"

$repoRoot = $PSScriptRoot
$logDir = Join-Path $PSScriptRoot "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$pythonExe = $null
$pythonPrefixArgs = @()
$pythonCandidates = @(
  "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe",
  "$env:LOCALAPPDATA\Programs\Python\Python312-arm64\python.exe",
  "$env:LOCALAPPDATA\Programs\Python\Python311-arm64\python.exe",
  "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
  "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe"
)
foreach ($candidate in $pythonCandidates) {
  if ($candidate -and (Test-Path $candidate)) {
    $pythonExe = $candidate
    break
  }
}
if (-not $pythonExe) {
  $pythonCmd = Get-Command python -ErrorAction SilentlyContinue
  if ($pythonCmd) {
    $pythonExe = $pythonCmd.Source
  }
}
if (-not $pythonExe) {
  $pyCmd = Get-Command py -ErrorAction SilentlyContinue
  if ($pyCmd) {
    $pythonExe = $pyCmd.Source
    $pythonPrefixArgs = @("-3")
  }
}
if (-not $pythonExe) {
  throw "Python executable not found."
}

$npmExe = $null
$npmCandidates = @("npm.cmd", "npm")
foreach ($candidate in $npmCandidates) {
  $npmCmd = Get-Command $candidate -ErrorAction SilentlyContinue
  if ($npmCmd) {
    $npmExe = $npmCmd.Source
    break
  }
}
if (-not $npmExe) {
  throw "npm executable not found."
}

$reactRoot = Join-Path $repoRoot "react"
$reactNodeModules = Join-Path $reactRoot "node_modules"
if (-not (Test-Path $reactNodeModules)) {
  throw "react\\node_modules not found. Run 'cd react; npm install' first."
}

$findPidsByPort = {
  param([int]$Port)
  try {
    return @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop | Select-Object -ExpandProperty OwningProcess -Unique)
  } catch {
    return @()
  }
}

# Avoid duplicate local servers on same ports.
foreach ($port in @(8000, 5173, 3000)) {
  $existing = & $findPidsByPort -Port $port
  foreach ($procId in $existing) {
    try {
      Stop-Process -Id $procId -Force -ErrorAction Stop
      Write-Output "Stopped existing listener on port $port (PID: $procId)"
    } catch {
      Write-Output "Could not stop existing listener on port $port (PID: $procId)"
    }
  }
}

$apiOut = Join-Path $logDir "api.out.log"
$apiErr = Join-Path $logDir "api.err.log"
$uiOut = Join-Path $logDir "ui.out.log"
$uiErr = Join-Path $logDir "ui.err.log"
$pidFile = Join-Path $logDir "local_dashboard_pids.json"

$apiArgs = @() + $pythonPrefixArgs + @("-m", "uvicorn", "src.iran_monitor.health:app", "--host", "127.0.0.1", "--port", "8000")
$uiArgs = @("run", "dev", "--", "--host", "127.0.0.1", "--port", "5173")

$apiProc = Start-Process -FilePath $pythonExe `
  -ArgumentList $apiArgs `
  -WorkingDirectory $repoRoot `
  -RedirectStandardOutput $apiOut `
  -RedirectStandardError $apiErr `
  -PassThru

$uiProc = Start-Process -FilePath $npmExe `
  -ArgumentList $uiArgs `
  -WorkingDirectory $reactRoot `
  -RedirectStandardOutput $uiOut `
  -RedirectStandardError $uiErr `
  -PassThru

Start-Sleep -Seconds 2

@{
  api_pid = $apiProc.Id
  ui_pid = $uiProc.Id
  started_at = (Get-Date).ToString("s")
} | ConvertTo-Json | Set-Content -Path $pidFile -Encoding UTF8

Write-Output "API  : http://127.0.0.1:8000/api/state (PID: $($apiProc.Id))"
Write-Output "Live : http://127.0.0.1:8000/api/live/latest"
Write-Output "React: http://127.0.0.1:5173 (PID: $($uiProc.Id))"
Write-Output "Legacy UI: $repoRoot\ui\index_v2.html"
Write-Output "Python: $pythonExe"
Write-Output "npm   : $npmExe"
Write-Output "PIDs : $pidFile"
