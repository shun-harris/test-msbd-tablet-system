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
        
        # Create CNAME for test environment
        Write-Host "Setting up CNAME for test.tablet.msbdance.com..." -ForegroundColor Cyan
        "test.tablet.msbdance.com" | Out-File -FilePath "CNAME" -Encoding ASCII -NoNewline
        
        git add .
        git commit -m "v2.3.0: Improved admin panel UX with compact login and smooth expansion"
        git push test main
        Write-Host "Test deployment complete!" -ForegroundColor Green
    }
    "prod" {
        Write-Host "Deploying to PRODUCTION..." -ForegroundColor Yellow
        
        # Create CNAME for production environment
        Write-Host "Setting up CNAME for tablet.msbdance.com..." -ForegroundColor Cyan
        "tablet.msbdance.com" | Out-File -FilePath "CNAME" -Encoding ASCII -NoNewline
        
        git add .
        git commit -m "v2.3.0: Improved admin panel UX with compact login and smooth expansion"
        git push prod main
        Write-Host "Production deployment complete!" -ForegroundColor Green
    }
    "both" {
        Write-Host "Deploying to BOTH test and production..." -ForegroundColor Cyan
        
        # Deploy to test first
        Write-Host "Setting up CNAME for test.tablet.msbdance.com..." -ForegroundColor Cyan
        "test.tablet.msbdance.com" | Out-File -FilePath "CNAME" -Encoding ASCII -NoNewline
        git add .
        git commit -m "v2.3.0: Improved admin panel UX with compact login and smooth expansion"
        git push test main
        
        # Then deploy to prod with different CNAME
        Write-Host "Setting up CNAME for tablet.msbdance.com..." -ForegroundColor Cyan
        "tablet.msbdance.com" | Out-File -FilePath "CNAME" -Encoding ASCII -NoNewline
        git add CNAME
        git commit -m "Update CNAME for production deployment"
        git push prod main
        
        Write-Host "Both deployments complete!" -ForegroundColor Green
    }
}