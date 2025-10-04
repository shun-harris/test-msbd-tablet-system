# Deploy script for MSBD Tablet System
# Usage: .\deploy.ps1 [test|prod|both]

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("test", "prod", "both")]
    [string]$Target
)

try {
switch ($Target) {
    "test" {
    Write-Host "Bumping version (patch) for TEST deployment..." -ForegroundColor Green
    & powershell -ExecutionPolicy Bypass -File "$PSScriptRoot\bump-version.ps1" patch -Notes "Test deployment"
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
    Write-Host "Bumping version (patch) for PRODUCTION deployment..." -ForegroundColor Yellow
    & powershell -ExecutionPolicy Bypass -File "$PSScriptRoot\bump-version.ps1" patch -Notes "Production deployment"
    $ver = (Get-Content version.json -Raw | ConvertFrom-Json).version
    Write-Host "Deploying v$ver to PRODUCTION..." -ForegroundColor Yellow
        
        # Create CNAME for production environment
        Write-Host "Setting up CNAME for tablet.msbdance.com..." -ForegroundColor Cyan
        "tablet.msbdance.com" | Out-File -FilePath "CNAME" -Encoding ASCII -NoNewline
        
        git add .
    git commit -m "v${ver}: Prod deploy"
    git tag -f "v${ver}"
        git push prod main --follow-tags
        Write-Host "Production deployment complete!" -ForegroundColor Green
    }
    "both" {
        Write-Host "Deploying to BOTH test and production..." -ForegroundColor Cyan
        
        # Deploy to test first
        Write-Host "Setting up CNAME for test.tablet.msbdance.com..." -ForegroundColor Cyan
        "test.tablet.msbdance.com" | Out-File -FilePath "CNAME" -Encoding ASCII -NoNewline
        git add .
    & powershell -ExecutionPolicy Bypass -File "$PSScriptRoot\bump-version.ps1" patch -Notes "Test+Prod deployment"
    $ver = (Get-Content version.json -Raw | ConvertFrom-Json).version
    git commit -m "v${ver}: Test deploy"
    git tag -f "v${ver}"
        git push test main --follow-tags
        
        # Then deploy to prod with different CNAME
        Write-Host "Setting up CNAME for tablet.msbdance.com..." -ForegroundColor Cyan
        "tablet.msbdance.com" | Out-File -FilePath "CNAME" -Encoding ASCII -NoNewline
        git add CNAME
    git commit -m "v${ver}: Prod deploy (CNAME)"
    git tag -f "v${ver}"
        git push prod main --follow-tags
        
        Write-Host "Both deployments complete!" -ForegroundColor Green
    }
}
}
catch {
    Write-Host "Deployment failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}