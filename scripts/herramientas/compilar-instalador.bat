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
  echo Se compilara el .exe sin firmar artefactos updater ^(instalacion manual OK^).
  echo Para OTA firmado ejecute antes: generar-claves-tauri.bat
  echo.
)
node scripts\run-tauri-build-local.mjs
if errorlevel 1 (
  echo [ERROR] tauri build
  echo Revise que Rust, NSIS y WebView2 esten instalados.
  pause
  exit /b 1
)
echo.
node scripts\compilar-instalador-local.mjs
if errorlevel 1 (
  echo [ERROR] No se encontro el .exe en src-tauri\target\release\bundle\nsis\
  echo Si el build termino bien, busque el instalador en la ruta que imprimio Tauri arriba.
  pause
  exit /b 1
)
echo.
echo  Instalador en src-tauri\target\release\bundle\nsis\
echo  Copia lista en dist\local\
echo  ^(Sin GitHub — para OTA publicada use opcion 2 o 3 del menu^)
echo.
pause
