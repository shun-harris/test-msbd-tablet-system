#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Auto-fixes CNAME file to match the current git branch
.DESCRIPTION
    Automatically updates CNAME based on branch:
    - test/dev branches → test.tablet.msbdance.com
    - main/prod branches → tablet.msbdance.com
    
    If CNAME is updated, it stages the change automatically.
#>

$ErrorActionPreference = "Stop"

# Get current branch
$branch = git rev-parse --abbrev-ref HEAD 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Not in a git repository, skipping CNAME check" -ForegroundColor Yellow
    exit 0
}

# Check if CNAME file exists
$cnamePath = "CNAME"
if (-not (Test-Path $cnamePath)) {
    Write-Host "ℹ️  No CNAME file (Railway domains only)" -ForegroundColor Gray
    exit 0
}

# Read current CNAME content
$currentCname = (Get-Content $cnamePath -Raw).Trim()

# Define expected CNAME per branch
# NEW STRUCTURE: main = test environment, prod-release = production
$expectedCname = switch -Regex ($branch) {
    '^(prod-release|production)$' { 'tablet.msbdance.com' }
    '^(main|master)$' { 'test.tablet.msbdance.com' }
    default { 
        Write-Host "⚠️  Unknown branch '$branch', skipping CNAME check" -ForegroundColor Yellow
        exit 0
    }
}

# Check if CNAME needs updating
if ($currentCname -ne $expectedCname) {
    Write-Host ""
    Write-Host "🔧 Auto-fixing CNAME..." -ForegroundColor Yellow
    Write-Host "   Branch: $branch" -ForegroundColor Cyan
    Write-Host "   Old: $currentCname" -ForegroundColor Red
    Write-Host "   New: $expectedCname" -ForegroundColor Green
    
    # Update CNAME file
    Set-Content -Path $cnamePath -Value $expectedCname -NoNewline
    
    # Stage the change
    git add $cnamePath 2>$null
    
    Write-Host "✅ CNAME updated and staged!" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host "✅ CNAME already correct ($branch → $expectedCname)" -ForegroundColor Green
}

exit 0
