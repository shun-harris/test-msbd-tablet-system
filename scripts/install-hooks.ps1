$ErrorActionPreference = "Stop"
Write-Host "Installing Git hooks..." -ForegroundColor Cyan
$hookDest = Join-Path $PSScriptRoot "..\.git\hooks\pre-commit"
$hooksDir = Split-Path -Parent $hookDest
if (-not (Test-Path $hooksDir)) { New-Item -ItemType Directory -Path $hooksDir -Force | Out-Null }
$hookContent = @"
#!/usr/bin/env pwsh
`$scriptPath = Join-Path `$PSScriptRoot "..\scripts\auto-fix-cname.ps1"
if (Test-Path `$scriptPath) { & powershell -ExecutionPolicy Bypass -File `$scriptPath }
exit 0
"@
Set-Content -Path $hookDest -Value $hookContent -NoNewline
Write-Host "Pre-commit hook installed at: $hookDest" -ForegroundColor Green
