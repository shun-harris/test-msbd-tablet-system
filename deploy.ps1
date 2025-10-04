# Deploy script for MSBD Tablet System
# Usage: .\deploy.ps1 [test|prod|both]

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("test", "prod", "both")]
    [string]$Target
)

switch ($Target) {
    "test" {
        Write-Host "Deploying v2.3.0 admin panel improvements to TEST..." -ForegroundColor Green
        git add .
        git commit -m "v2.3.0: Improved admin panel UX with compact login and smooth expansion"
        git push test main
        Write-Host "Test deployment complete!" -ForegroundColor Green
    }
    "prod" {
        Write-Host "Deploying to PRODUCTION..." -ForegroundColor Yellow
        git add .
        git commit -m "v2.3.0: Improved admin panel UX with compact login and smooth expansion"
        git push prod main
        Write-Host "Production deployment complete!" -ForegroundColor Green
    }
    "both" {
        Write-Host "Deploying to BOTH test and production..." -ForegroundColor Cyan
        git add .
        git commit -m "v2.3.0: Improved admin panel UX with compact login and smooth expansion"
        git push test main
        git push prod main
        Write-Host "Both deployments complete!" -ForegroundColor Green
    }
}