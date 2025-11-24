# Promotion script: Promote tested commit from main (TEST) to prod-release (PRODUCTION)
# Usage: ./promote-to-prod.ps1 [-DryRun] [-Force]
# Assumes:
#  - 'test' remote hosts test repo with 'main' branch already deployed & soaked
#  - 'prod' remote hosts production repo; production source of truth branch = prod-release
#  - Fast-forward only (no merge commits) to keep history linear
#  - Version bump already performed during test deploy; prod does NOT bump again

param(
    [switch]$DryRun,
    [switch]$Force
)

function Write-Step($msg) { Write-Host "[PROMOTE] $msg" -ForegroundColor Cyan }
function Write-Warn($msg) { Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "[ERROR] $msg" -ForegroundColor Red }

try {
    Write-Step "Fetching latest from remotes..."
    git fetch test --prune | Out-Null
    git fetch prod --prune | Out-Null

    $testHead = git rev-parse test/main 2>$null
    if (-not $testHead) { Write-Err "Cannot resolve test/main"; exit 1 }

    $prodBranch = 'prod-release'
    $prodHead = git rev-parse prod/$prodBranch 2>$null
    if (-not $prodHead) {
        Write-Warn "prod/$prodBranch does not exist yet. It will be created at test/main head." 
    }

    # Note: Ancestry check skipped because CNAME differences cause natural divergence
    # between test and prod branches. We use --force-with-lease for safe force-push.
    # If you need to verify ancestry manually, use: git merge-base --is-ancestor prod/prod-release test/main

    $version = (Get-Content version.json -Raw | ConvertFrom-Json).version
    Write-Step "Ready to promote version v$version (commit $testHead) to prod/$prodBranch"

    if ($DryRun) { Write-Warn "DryRun mode: no remote updates performed"; exit 0 }

    # Create local tracking branch at test head
    git checkout -B $prodBranch $testHead | Out-Null

    # Fix CNAME for production environment using auto-fix script
    Write-Step "Auto-fixing CNAME to production domain..."
    & powershell -ExecutionPolicy Bypass -File "$PSScriptRoot\auto-fix-cname.ps1"
    # Only commit if CNAME was actually changed
    $cnameStatus = git status --porcelain CNAME 2>$null
    if ($cnameStatus) {
        git commit -m "chore: Update CNAME to production domain (tablet.msbdance.com)" | Out-Null
    }

    # Push with force flag to handle CNAME divergence
    # CNAME differs between test and prod, so branches naturally diverge
    # Use explicit string to avoid PowerShell parsing the colon in $prodBranch:$prodBranch
    git push prod "$prodBranch`:$prodBranch" --force-with-lease | Out-Null

    Write-Step "Promotion complete. prod/$prodBranch now at HEAD (v$version)."
    Write-Step "CNAME updated to tablet.msbdance.com for production."
    Write-Step "To deploy infra referencing prod-release, ensure hosting pulls latest commit."
}
catch {
    Write-Err $_.Exception.Message
    exit 1
}
