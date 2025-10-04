# Deploy script for MSBD Tablet System
# Usage: .\deploy.ps1 [test|prod|both]

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("test", "prod", "both")]
    [string]$Target,
    [ValidateSet("auto","patch","minor","major")]
    [string]$BumpType = 'auto',
    [string]$Notes = ''
)

try {
switch ($Target) {
    "test" {
    Write-Host "Bumping version ($BumpType) for TEST deployment..." -ForegroundColor Green
    $bumpNotes = if([string]::IsNullOrWhiteSpace($Notes)) { 'Test deployment' } else { $Notes }
    & powershell -ExecutionPolicy Bypass -File "$PSScriptRoot\bump-version.ps1" $BumpType -Notes $bumpNotes
        $ver = (Get-Content version.json -Raw | ConvertFrom-Json).version
        Write-Host "Deploying v$ver to TEST..." -ForegroundColor Green

        # Create CNAME for test environment
        Write-Host "Setting up CNAME for test.tablet.msbdance.com..." -ForegroundColor Cyan
        "test.tablet.msbdance.com" | Out-File -FilePath "CNAME" -Encoding ASCII -NoNewline

        git add .
        git commit -m "v${ver}: Test deploy"
        git tag -f "v${ver}"
        git push test main --follow-tags
        Write-Host "Test deployment complete!" -ForegroundColor Green
    }
    "prod" {
        Write-Host "Using existing version for PRODUCTION (no bump)." -ForegroundColor Yellow
        $ver = (Get-Content version.json -Raw | ConvertFrom-Json).version
        Write-Host "Deploying existing v$ver to PRODUCTION..." -ForegroundColor Yellow

        # Create CNAME for production environment
        Write-Host "Setting up CNAME for tablet.msbdance.com..." -ForegroundColor Cyan
        "tablet.msbdance.com" | Out-File -FilePath "CNAME" -Encoding ASCII -NoNewline

        git add CNAME
        git commit -m "v${ver}: Prod deploy (reuse version)" 2>$null | Out-Null
        # Re-tag (force) in case previous tag message differs; no bump
        git tag -f "v${ver}" 2>$null | Out-Null
        git push prod main --follow-tags
        Write-Host "Production deployment complete for v$ver (no version change)." -ForegroundColor Green
    }
    "both" {
        Write-Host "Deploying to BOTH test and production (single bump applied on TEST only)..." -ForegroundColor Cyan

        # --- Test leg with bump ---
        Write-Host "Setting up CNAME for test.tablet.msbdance.com..." -ForegroundColor Cyan
        "test.tablet.msbdance.com" | Out-File -FilePath "CNAME" -Encoding ASCII -NoNewline
        git add .
    $bumpNotes = if([string]::IsNullOrWhiteSpace($Notes)) { 'Test+Prod deployment' } else { $Notes }
    & powershell -ExecutionPolicy Bypass -File "$PSScriptRoot\bump-version.ps1" $BumpType -Notes $bumpNotes
        $ver = (Get-Content version.json -Raw | ConvertFrom-Json).version
        git commit -m "v${ver}: Test deploy"
        git tag -f "v${ver}"
        git push test main --follow-tags

        # --- Prod leg WITHOUT bump, reuse same version ---
        Write-Host "Setting up CNAME for tablet.msbdance.com..." -ForegroundColor Cyan
        "tablet.msbdance.com" | Out-File -FilePath "CNAME" -Encoding ASCII -NoNewline
        git add CNAME
        git commit -m "v${ver}: Prod deploy (reuse version)" 2>$null | Out-Null
        git tag -f "v${ver}" 2>$null | Out-Null
        git push prod main --follow-tags

        Write-Host "Both deployments complete for v$ver (single version)." -ForegroundColor Green
    }
}
}
catch {
    Write-Host "Deployment failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}