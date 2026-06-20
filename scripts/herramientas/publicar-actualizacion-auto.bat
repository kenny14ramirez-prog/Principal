@echo off
chcp 65001 >nul 2>&1
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0..\.."

REM Uso: publicar-actualizacion-auto.bat critical|optional [version] [mensaje]
set "CROZZO_TIPO=%~1"
set "CROZZO_VER=%~2"
set "CROZZO_MSG=%~3"

if /i "%CROZZO_TIPO%"=="critica" set "CROZZO_TIPO=critical"
if /i "%CROZZO_TIPO%"=="crítica" set "CROZZO_TIPO=critical"
if /i not "%CROZZO_TIPO%"=="critical" if /i not "%CROZZO_TIPO%"=="optional" (
  echo [ERROR] Tipo invalido. Use: critical u optional
  pause
  exit /b 1
)

if /i "%CROZZO_TIPO%"=="critical" (
  set "CROZZO_TIPO_LABEL=CRITICA"
  set "CROZZO_GIT_LABEL=CRITICAL"
) else (
  set "CROZZO_TIPO_LABEL=OPCIONAL"
  set "CROZZO_GIT_LABEL=OPTIONAL"
)

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Instale Node.js LTS desde https://nodejs.org
  pause
  exit /b 1
)

if not exist node_modules (
  echo Instalando dependencias npm...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install fallo.
    pause
    exit /b 1
  )
)

cls
echo.
echo   ============================================================
echo     Crozzo POS - Publicar TODO ^(!CROZZO_TIPO_LABEL!^)
echo   ============================================================
echo.

for /f "usebackq delims=" %%C in (`node scripts\bump-tauri-version.mjs --current 2^>nul`) do set "CROZZO_ACTUAL=%%C"
for /f "usebackq delims=" %%N in (`node scripts\bump-tauri-version.mjs 2^>nul`) do set "CROZZO_SUGERIDA=%%N"
for /f "usebackq delims=" %%L in (`node scripts\bump-tauri-version.mjs --current --local 2^>nul`) do set "CROZZO_LOCAL=%%L"
if not defined CROZZO_ACTUAL set "CROZZO_ACTUAL=?"
if not defined CROZZO_SUGERIDA set "CROZZO_SUGERIDA=?"
if not defined CROZZO_LOCAL set "CROZZO_LOCAL=?"

echo   Version maxima ^(GitHub+OTA^) : v!CROZZO_ACTUAL!
echo   Version solo archivos locales  : v!CROZZO_LOCAL!
echo   Version nueva ^(automatica^)    : v!CROZZO_SUGERIDA!
echo.
echo   Este asistente hace TODO:
echo     [1] Version en tauri.conf + Android versionCode
echo     [2] Manifiesto OTA releases\latest.json
echo     [3] Sync interfaz app\ -^> src\
echo     [4] Push a GitHub main + tag vX.Y.Z
echo     [5] GitHub Actions compila .exe + .dmg + .apk
echo.

if not defined CROZZO_MSG (
  echo.
  echo   Escriba cada cambio separado con + ^(recomendado^):
  echo   Ej: Correccion menu + Correccion mesas + Cola nube
  echo   Tambien acepta: 1, cambio uno, 2, cambio dos
  echo.
  set /p CROZZO_MSG=Mensaje para clientes: 
)
if not defined CROZZO_MSG (
  echo [ERROR] Falta el mensaje.
  pause
  exit /b 1
)

if not defined CROZZO_VER (
  set /p CROZZO_VER=Version ^(Enter = v!CROZZO_SUGERIDA!^): 
)
if not defined CROZZO_VER set "CROZZO_VER=!CROZZO_SUGERIDA!"

echo.
echo   ----------------------------------------------------------
echo   Tipo     : !CROZZO_TIPO_LABEL!
echo   Version  : v!CROZZO_VER! ^(max actual v!CROZZO_ACTUAL!^)
echo   Mensaje  : !CROZZO_MSG!
echo   ----------------------------------------------------------
echo.
set /p CROZZO_OK=Publicar ahora? ^(Enter = Si / N = cancelar^): 
if /i "!CROZZO_OK!"=="N" (
  echo Cancelado.
  pause
  exit /b 0
)

echo.
echo   Sincronizando app\ -^> src\ ^(paso 3^)...
call npm run sync
if errorlevel 1 (
  echo.
  echo [ERROR] npm run sync fallo.
  pause
  exit /b 1
)

echo.
node scripts\health-check-updates.mjs
if errorlevel 1 (
  echo.
  echo [ERROR] Health check fallo. Corrija lo indicado arriba.
  pause
  exit /b 1
)

echo.
node scripts\publicar-actualizacion.mjs !CROZZO_TIPO! "!CROZZO_MSG!" !CROZZO_VER!
if errorlevel 1 (
  echo.
  echo [ERROR] Fallo la preparacion local.
  pause
  exit /b 1
)

echo.
echo   Subiendo a GitHub ^(codigo + OTA + tag v!CROZZO_VER!^)...
call "%~dp0..\_git-push-latest.bat" !CROZZO_VER! "!CROZZO_MSG!" !CROZZO_GIT_LABEL!
if errorlevel 1 (
  echo.
  echo [ERROR] No se pudo subir a GitHub.
  echo Ejecute: scripts\herramientas\configurar-github-remoto.bat
  pause
  exit /b 1
)

echo.
echo   ============================================================
echo   LISTO — v!CROZZO_VER! ^(!CROZZO_TIPO_LABEL!^)
echo   ============================================================
echo.
echo   1. Revise CI: https://github.com/kenny14ramirez-prog/Principal/actions
echo   2. En ~10 min: Release con .exe, .dmg y .apk
echo   3. Clientes veran aviso v!CROZZO_VER! en la app
echo.
node scripts\verificar-publicacion.mjs
echo.
pause
endlocal
