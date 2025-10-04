@echo off@echo off

REM Deploy script for MSBD Tablet SystemREM Windows batch version of deploy script

REM Usage: deploy.bat [test|prod|both]REM Usage: deploy.bat test   or   deploy.bat prod



if "%1"=="test" (set ENVIRONMENT=%1

    echo Deploying v2.3.0 admin panel improvements to TEST...

    git add .if "%ENVIRONMENT%"=="test" (

    git commit -m "v2.3.0: Improved admin panel UX with compact login and smooth expansion"    echo 🚀 Deploying to TEST environment...

    git push test main    echo test.tablet.msbdance.com > CNAME

    echo Test deployment complete!    git add . -A

) else if "%1"=="prod" (    git commit -m "Deploy to test environment"

    echo Deploying to PRODUCTION...    git push test main

    git add .    echo ✅ Deployed to https://test.tablet.msbdance.com/

    git commit -m "v2.3.0: Improved admin panel UX with compact login and smooth expansion"    

    git push prod main) else if "%ENVIRONMENT%"=="prod" (

    echo Production deployment complete!    echo 🌟 Deploying to PRODUCTION environment...

) else if "%1"=="both" (    echo tablet.msbdance.com > CNAME

    echo Deploying to BOTH test and production...    git add . -A

    git add .    git commit -m "Deploy to production environment" 

    git commit -m "v2.3.0: Improved admin panel UX with compact login and smooth expansion"    git push prod main

    git push test main    echo ✅ Deployed to https://tablet.msbdance.com/

    git push prod main    

    echo Both deployments complete!) else (

) else (    echo ❌ Please specify environment: deploy.bat test or deploy.bat prod

    echo Usage: deploy.bat [test^|prod^|both]    exit /b 1

    echo   test - Deploy to test.tablet.msbdance.com + Railway)
    echo   prod - Deploy to tablet.msbdance.com
    echo   both - Deploy to both environments
)