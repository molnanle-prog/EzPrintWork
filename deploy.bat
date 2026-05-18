@echo off
title EzPrintWork One-Click Deploy Script

echo ===================================================
echo [1/3] Building EzPrintWork Web Version...
echo ===================================================
if exist dist rmdir /s /q dist
call npx vite build --config vite.config.ts

if %errorlevel% neq 0 (
    echo [ERROR] Build failed! Please check Vite errors.
    pause
    exit /b %errorlevel%
)

echo ===================================================
echo [2/3] Copying built files and compiling Homepage...
echo ===================================================
set CURRENT_DIR=%~dp0
set HOMEPAGE_DIR=%CURRENT_DIR%..\..\ez-hub-homepage

:: Copy to public (for automatic inclusion in homepage build output)
if not exist "%HOMEPAGE_DIR%\public\ezpw" mkdir "%HOMEPAGE_DIR%\public\ezpw"
robocopy "%CURRENT_DIR%dist" "%HOMEPAGE_DIR%\public\ezpw" /e /ndl /nfl /njh /njs /xx

:: Compile the homepage so that both the homepage and ezpw app are built together in 'dist'
cd /d "%HOMEPAGE_DIR%"
call npm run build

if %errorlevel% neq 0 (
    echo [ERROR] Homepage build failed!
    cd /d "%CURRENT_DIR%"
    pause
    exit /b %errorlevel%
)

echo ===================================================
echo [3/3] Deploying to Google Firebase Hosting...
echo ===================================================
call npx firebase-tools deploy --only hosting
cd /d "%CURRENT_DIR%"

echo ===================================================
echo [SUCCESS] Deploy complete!
echo ===================================================
pause
