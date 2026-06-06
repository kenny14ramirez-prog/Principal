@echo off
chcp 65001 >nul 2>&1
title Crozzo POS - Subir scripts CI
cd /d "%~dp0..\.."
echo.
echo   Sube verify-release-multiplatform.mjs y dependencias a GitHub.
echo   Use esto si Actions falla con "Cannot find module verify-release-multiplatform".
echo.
call "%~dp0..\_git-push-ci-scripts.bat"
echo.
pause
