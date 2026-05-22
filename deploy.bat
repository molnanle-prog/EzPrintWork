@echo off
title EzPrintWork Deploy System
cls

echo ===================================================
echo    EzPrintWork One-Click Smart Deploy System
echo ===================================================
echo.
echo  [1] Web Version Deploy (Fast: 10s)
echo  [2] Desktop App (.exe) and Web Deploy (Full: 1m)
echo.
echo ===================================================
set /p choice="Enter deploy number (1 or 2): "

if "%choice%"=="1" goto DEPLOY_WEB
if "%choice%"=="2" goto DEPLOY_APP

echo.
echo [ERROR] Invalid choice. Please close and try again.
goto FINISH

:DEPLOY_WEB
echo.
echo Starting Web Version Deploy...
node scripts/deploy.js
goto FINISH

:DEPLOY_APP
echo.
echo Starting Desktop App and Web Deploy...
node scripts/deploy-app.js
goto FINISH

:FINISH
echo.
echo ===================================================
echo Deploy finished.
echo ===================================================
pause
