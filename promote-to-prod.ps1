Param(
    [string]$SourceBranch = 'main',
    [string]$PromoteBranch = 'prod-release',
    [string]$ProdRemote = 'prod',          # remote pointing at production repo
    [switch]$SkipChecks,
    [switch]$AllowAhead                       # allow prod-release having extra commits (not recommended)
)

Write-Host "=== Promote $SourceBranch -> $PromoteBranch (fast-forward) ===" -ForegroundColor Cyan

function Fail($msg){ Write-Host $msg -ForegroundColor Red; exit 1 }

if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Fail "git not found in PATH" }

# Ensure clean tree
$status = git status --porcelain
if ($status) { Fail "Working tree not clean. Commit/stash changes first." }

Write-Host "Fetching all remotes..." -ForegroundColor DarkCyan
git fetch --all --prune | Out-Null

# Validate source branch exists locally
if (-not (git rev-parse --verify $SourceBranch 2>$null)) { Fail "Local source branch '$SourceBranch' not found." }

# Capture source SHA
$sourceSha = git rev-parse $SourceBranch

# Ensure promote branch exists (create if first time)
if (-not (git rev-parse --verify $PromoteBranch 2>$null)) {
    if (git rev-parse --verify $ProdRemote/$PromoteBranch 2>$null) {
        git checkout -b $PromoteBranch $ProdRemote/$PromoteBranch | Out-Null
        Write-Host "Checked out existing remote $ProdRemote/$PromoteBranch" -ForegroundColor Green
    } else {
        git checkout -b $PromoteBranch $SourceBranch | Out-Null
        Write-Host "Created $PromoteBranch from $SourceBranch (initial promotion)." -ForegroundColor Green
    }
} else {
    git checkout $PromoteBranch | Out-Null
}

if (-not $SkipChecks) {
    Write-Host "Validating fast-forward possibility..." -ForegroundColor DarkCyan
    $diffLines = git rev-list --left-right $PromoteBranch...$SourceBranch
    $behind = ($diffLines | Select-String '^>' | Measure-Object).Count  # commits in source not in promote
    $ahead  = ($diffLines | Select-String '^<' | Measure-Object).Count  # commits in promote not in source
    if ($ahead -gt 0 -and -not $AllowAhead) { Fail "$PromoteBranch has commits not in $SourceBranch. Use --AllowAhead to override after manual review." }
    if ($behind -eq 0) { Fail "$PromoteBranch already up to date with $SourceBranch. Nothing to promote." }
    Write-Host "$PromoteBranch is behind $SourceBranch by $behind commit(s); fast-forward is safe." -ForegroundColor Green
}

Write-Host "Fast-forwarding $PromoteBranch to $SourceBranch ($sourceSha)" -ForegroundColor Cyan
git merge --ff-only $SourceBranch || Fail "Fast-forward merge failed (history diverged)."

Write-Host "Pushing $PromoteBranch to $ProdRemote..." -ForegroundColor Cyan
git push $ProdRemote $PromoteBranch || Fail "Push failed."

Write-Host "Promotion complete. Production should deploy commit $sourceSha." -ForegroundColor Green

Write-Host "(Optional) Tag current version: git tag -f v$( (Get-Content version.json -Raw | ConvertFrom-Json).version ); git push $ProdRemote --tags" -ForegroundColor DarkGray
