# Deploy script for MSBD Tablet System
# Usage: .\deploy.ps1 [test|prod|both]

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("test", "prod", "both")]
    [string]$Target,
    [ValidateSet("auto","patch","minor","major")]
    [string]$BumpType = 'auto',
    [string]$Notes = '',
    [switch]$ForceLegacyProd
)

try {
switch ($Target) {
    "test" {
        # Enforce running from main branch for test deployments
        $currentBranch = git rev-parse --abbrev-ref HEAD 2>$null
        Write-Host "Current branch: $currentBranch" -ForegroundColor Cyan
        
        if ($currentBranch -ne 'main') {
            $status = git status --porcelain 2>$null
            if ($status) {
                Write-Host "❌ Cannot auto-switch branches: working tree not clean." -ForegroundColor Red
                Write-Host "Current branch: $currentBranch (need to switch to: main)" -ForegroundColor Yellow
                Write-Host "Please commit or stash your changes, then re-run." -ForegroundColor Yellow
                return
            }
            Write-Host "🔄 Auto-switching from '$currentBranch' to 'main' for test deploy..." -ForegroundColor Yellow
            git checkout main 2>&1 | Out-Null
            if ($LASTEXITCODE -ne 0) {
                Write-Host "❌ Failed to switch to main branch" -ForegroundColor Red
                return
            }
            Write-Host "✅ Switched to main branch" -ForegroundColor Green
        } else {
            Write-Host "✅ Already on main branch" -ForegroundColor Green
        }
        Write-Host "Bumping version ($BumpType) for TEST deployment..." -ForegroundColor Green
        $bumpNotes = if([string]::IsNullOrWhiteSpace($Notes)) { 'Test deployment' } else { $Notes }
        & powershell -ExecutionPolicy Bypass -File "$PSScriptRoot\bump-version.ps1" $BumpType -Notes $bumpNotes
        $ver = (Get-Content version.json -Raw | ConvertFrom-Json).version
        Write-Host "Deploying v$ver to TEST..." -ForegroundColor Green
        Write-Host "Auto-fixing CNAME for test environment..." -ForegroundColor Cyan
        & powershell -ExecutionPolicy Bypass -File "$PSScriptRoot\auto-fix-cname.ps1"
        git add .
        git commit -m "v${ver}: Test deploy"
        git tag -f "v${ver}"
        git push test main --follow-tags
        Write-Host "Test deployment complete!" -ForegroundColor Green
    }
    "prod" {
        if (-not $ForceLegacyProd) {
            Write-Host "🚫 Direct 'deploy.ps1 prod' path is deprecated." -ForegroundColor Red
            Write-Host "Use ./promote-to-prod.ps1 after deploying & soaking TEST." -ForegroundColor Yellow
            Write-Host "If you REALLY need legacy behavior: add -ForceLegacyProd" -ForegroundColor DarkYellow
            return
        }
        Write-Host "⚠ LEGACY PROD DEPLOY (bypasses promotion gate)" -ForegroundColor Red
        $ver = (Get-Content version.json -Raw | ConvertFrom-Json).version
        Write-Host "Deploying existing v$ver directly to PRODUCTION..." -ForegroundColor Yellow
        Write-Host "Auto-fixing CNAME for production environment..." -ForegroundColor Cyan
        & powershell -ExecutionPolicy Bypass -File "$PSScriptRoot\auto-fix-cname.ps1"
        git add CNAME
        git commit -m "v${ver}: Legacy direct prod deploy" 2>$null | Out-Null
        git tag -f "v${ver}" 2>$null | Out-Null
        git push prod main --follow-tags
        Write-Host "Legacy production deployment complete. (Consider using promotion flow next time.)" -ForegroundColor Green
    }
    "both" {
        if (-not $ForceLegacyProd) {
            Write-Host "🚫 'both' target deprecated. Run test deploy first, then promote via promote-to-prod.ps1" -ForegroundColor Red
            Write-Host "To force old combined flow, add -ForceLegacyProd (not recommended)." -ForegroundColor Yellow
            return
        }
        Write-Host "⚠ LEGACY BOTH DEPLOY (combined)" -ForegroundColor Red
        Write-Host "Auto-fixing CNAME for test environment..." -ForegroundColor Cyan
        & powershell -ExecutionPolicy Bypass -File "$PSScriptRoot\auto-fix-cname.ps1"
        git add .
        $bumpNotes = if([string]::IsNullOrWhiteSpace($Notes)) { 'Legacy both deployment' } else { $Notes }
        & powershell -ExecutionPolicy Bypass -File "$PSScriptRoot\bump-version.ps1" $BumpType -Notes $bumpNotes
        $ver = (Get-Content version.json -Raw | ConvertFrom-Json).version
        git commit -m "v${ver}: Legacy both test deploy"
        git tag -f "v${ver}"
        git push test main --follow-tags
        Write-Host "Auto-fixing CNAME for production environment..." -ForegroundColor Cyan
        & powershell -ExecutionPolicy Bypass -File "$PSScriptRoot\auto-fix-cname.ps1"
        git add CNAME
        git commit -m "v${ver}: Legacy both prod deploy" 2>$null | Out-Null
        git tag -f "v${ver}" 2>$null | Out-Null
        git push prod main --follow-tags
        Write-Host "Legacy BOTH deployment complete for v$ver." -ForegroundColor Green
    }
}
}
catch {
    Write-Host "Deployment failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}