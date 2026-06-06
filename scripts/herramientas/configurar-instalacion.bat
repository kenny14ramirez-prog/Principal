@echo off
chcp 65001 >nul 2>&1
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0..\.."

set "CROZZO_KEY=%USERPROFILE%\.tauri\crozzo-pos.key"
set "CROZZO_VER="
set "CROZZO_MSG="
set "CROZZO_TIPO=optional"

:asistente
cls
echo.
echo   ========================================================
echo     Crozzo POS - Configurar instalacion
echo   ========================================================
echo.

for /f "usebackq delims=" %%V in (`node scripts\read-tauri-version.mjs 2^>nul`) do set "CROZZO_VER_ACTUAL=%%V"
if not defined CROZZO_VER_ACTUAL set "CROZZO_VER_ACTUAL=?"
echo   Version en tauri.conf.json : !CROZZO_VER_ACTUAL!

if exist "!CROZZO_KEY!" (
  echo   Clave firma Tauri          : OK ^(!CROZZO_KEY!^)
) else (
  echo   Clave firma Tauri          : FALTA ^(ejecute opcion 6 del menu^)
)

where node >nul 2>&1
if errorlevel 1 (
  echo   Node.js                    : NO ENCONTRADO
) else (
  for /f "delims=" %%N in ('node -v 2^>nul') do echo   Node.js                    : %%N
)

git remote get-url origin >nul 2>&1
if errorlevel 1 (
  echo   Git remote origin          : NO CONFIGURADO
) else (
  for /f "delims=" %%R in ('git remote get-url origin 2^>nul') do echo   Git remote origin          : %%R
)

echo.
echo   Que desea hacer?
echo.
echo   [1] Primera vez - claves + GitHub + instrucciones
echo   [2] Publicar version NUEVA completa ^(version + sync + aviso + .exe + tag^)
echo   [3] Solo compilar .exe ^(sin publicar en GitHub^)
echo   [4] Solo configurar GitHub remoto
echo   [0] Volver al menu
echo.
set /p CROZZO_ASIS=Opcion: 

if "%CROZZO_ASIS%"=="1" goto :primera_vez
if "%CROZZO_ASIS%"=="2" goto :publicar_completa
if "%CROZZO_ASIS%"=="3" goto :solo_compilar
if "%CROZZO_ASIS%"=="4" call "%~dp0configurar-github-remoto.bat" & goto :asistente
if "%CROZZO_ASIS%"=="0" exit /b 0
goto :asistente

:primera_vez
cls
echo.
echo   === Primera vez - instalacion y actualizaciones ===
echo.
echo   Paso 1: Generar claves de firma Tauri
echo.
set /p CROZZO_GEN=Generar claves ahora? ^(S/N^): 
if /i "!CROZZO_GEN!"=="S" call "%~dp0generar-claves-tauri.bat"

echo.
echo   Paso 2: Configurar repositorio GitHub
echo.
set /p CROZZO_GH=Configurar remote origin? ^(S/N^): 
if /i "!CROZZO_GH!"=="S" call "%~dp0configurar-github-remoto.bat"

echo.
echo   Paso 3: Secretos en GitHub Actions ^(repo Principal^)
echo   ------------------------------------------------------
echo   Settings - Secrets and variables - Actions:
echo     TAURI_SIGNING_PRIVATE_KEY  = contenido de !CROZZO_KEY!
echo     TAURI_SIGNING_PRIVATE_KEY_PASSWORD = vacio si no puso clave
echo.
echo   Paso 4: Para publicar un .exe nuevo use opcion [2] de este asistente.
echo   El workflow "Tauri Release" crea el instalador al subir el tag vX.Y.Z
echo.
pause
goto :asistente

:publicar_completa
call "%~dp0publicar-actualizacion-auto.bat" critical
goto :asistente

:solo_compilar
call "%~dp0compilar-instalador.bat"
goto :asistente
