$ErrorActionPreference = "Stop"

$repoRoot = $PSScriptRoot
Set-Location $repoRoot

python scripts/update_hyie_state_now.py
python scripts/export_hyie_live.py --out-dir live

Write-Output "Refreshed live state:"
Write-Output " - state/hyie_state.json"
Write-Output " - live/latest.json"
Write-Output " - live/hyie_state.json"
Write-Output " - live/last_updated.json"
Write-Output " - live/v/<version>/state-lite.json"


