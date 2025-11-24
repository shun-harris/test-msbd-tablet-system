#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Validates CNAME file matches the current git branch
.DESCRIPTION
    Ensures test branch has test.tablet.msbdance.com
    and main/prod branch has tablet.msbdance.com
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
    Write-Host "✅ No CNAME file found (using Railway domains)" -ForegroundColor Green
    exit 0
}

# Read CNAME content
$cnameContent = (Get-Content $cnamePath -Raw).Trim()

# Define expected CNAME per branch
# NEW STRUCTURE: main = test environment, prod-release = production
$expectedCname = switch -Regex ($branch) {
    '^(prod-release|production)$' { 'tablet.msbdance.com' }
    '^(main|master)$' { 'test.tablet.msbdance.com' }
    default { 
        Write-Host "⚠️  Unknown branch '$branch', skipping CNAME validation" -ForegroundColor Yellow
        exit 0
    }
}

# Validate CNAME matches branch
if ($cnameContent -ne $expectedCname) {
    Write-Host "" 
    Write-Host "❌ CNAME MISMATCH!" -ForegroundColor Red
    Write-Host "   Branch: $branch" -ForegroundColor Cyan
    Write-Host "   Expected CNAME: $expectedCname" -ForegroundColor Green
    Write-Host "   Actual CNAME: $cnameContent" -ForegroundColor Red
    Write-Host ""
    Write-Host "💡 Fix options:" -ForegroundColor Yellow
    Write-Host "   1. Update CNAME: echo '$expectedCname' > CNAME" -ForegroundColor Gray
    Write-Host "   2. Delete CNAME: rm CNAME (Railway handles domains)" -ForegroundColor Gray
    Write-Host "   3. Switch branch: git checkout <correct-branch>" -ForegroundColor Gray
    Write-Host ""
    exit 1
}

Write-Host "✅ CNAME matches branch ($branch → $cnameContent)" -ForegroundColor Green
exit 0
