@echo off
title EzPrintWork One-Click Deploy Script

echo ===================================================
echo [1/3] Building EzPrintWork Web Version...
echo ===================================================
call npx vite build --config vite.config.ts

if %errorlevel% neq 0 (
    echo [ERROR] Build failed! Please check Vite errors.
    pause
    exit /b %errorlevel%
)

echo ===================================================
echo [2/3] Copying built files to Homepage path...
echo ===================================================
set CURRENT_DIR=%~dp0
set HOMEPAGE_DIR=%CURRENT_DIR%..\ez-hub-homepage

:: Copy to public (for future homepage builds)
if not exist "%HOMEPAGE_DIR%\public\ezpw" mkdir "%HOMEPAGE_DIR%\public\ezpw"
robocopy "%CURRENT_DIR%dist" "%HOMEPAGE_DIR%\public\ezpw" /e /ndl /nfl /njh /njs /xx

:: Copy directly to dist (for immediate Firebase deployment)
if not exist "%HOMEPAGE_DIR%\dist\ezpw" mkdir "%HOMEPAGE_DIR%\dist\ezpw"
robocopy "%CURRENT_DIR%dist" "%HOMEPAGE_DIR%\dist\ezpw" /e /ndl /nfl /njh /njs /xx

echo ===================================================
echo [3/3] Deploying to Google Firebase Hosting...
echo ===================================================
cd /d "%HOMEPAGE_DIR%"
call npx firebase-tools deploy --only hosting

echo ===================================================
echo [SUCCESS] Deploy complete!
echo ===================================================
pause
