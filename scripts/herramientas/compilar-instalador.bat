@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0..\.."
echo.
echo  Crozzo POS - Compilar instalador (con artefactos updater)
echo.
if not exist node_modules (
  echo Instalando dependencias npm...
  call npm install
  if errorlevel 1 exit /b 1
)
node scripts\sync-frontend-to-src.mjs
if errorlevel 1 (
  echo [ERROR] Sync frontend
  pause
  exit /b 1
)
set "TAURI_SIGNING_PRIVATE_KEY_PATH=%USERPROFILE%\.tauri\crozzo-pos.key"
if not exist "%TAURI_SIGNING_PRIVATE_KEY_PATH%" (
  echo [AVISO] No hay clave en %TAURI_SIGNING_PRIVATE_KEY_PATH%
  echo Ejecute antes: generar-claves-tauri.bat
  pause
)
call npm run tauri build
echo.
echo  Instalador en src-tauri\target\release\bundle\
echo  Para publicar en GitHub: git tag vX.Y.Z ^&^& git push origin vX.Y.Z
echo.
pause
