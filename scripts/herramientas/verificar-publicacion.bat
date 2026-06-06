@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0..\.."
echo.
node scripts\health-check-updates.mjs
echo.
node scripts\verificar-publicacion.mjs
echo.
pause
