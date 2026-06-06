@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0..\.."
echo.
echo  Sincronizando app\ -^> src\index.html
echo.
if not exist node_modules (
  echo Instalando dependencias npm...
  call npm install
  if errorlevel 1 exit /b 1
)
node scripts\sync-frontend-to-src.mjs
if errorlevel 1 (
  echo [ERROR] Sincronizacion fallida.
  pause
  exit /b 1
)
echo.
echo Listo. Tauri y GitHub Actions usan la carpeta src\
echo.
pause
