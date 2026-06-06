@echo off
chcp 65001 >nul 2>&1
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0..\.."

set "CROZZO_ERR=0"

echo.
echo   Crozzo POS - Requisitos del entorno
echo   ==================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo   [X] Node.js no encontrado — instale LTS desde https://nodejs.org
  set "CROZZO_ERR=1"
) else (
  for /f "delims=" %%N in ('node -v 2^>nul') do echo   [OK] Node.js %%N
)

where git >nul 2>&1
if errorlevel 1 (
  echo   [X] Git no encontrado — instale Git for Windows
  set "CROZZO_ERR=1"
) else (
  for /f "delims=" %%G in ('git --version 2^>nul') do echo   [OK] %%G
)

if not exist "%~dp0..\..\node_modules" (
  echo   [!] node_modules ausente
  set /p CROZZO_NPM=   Instalar dependencias ahora? ^(S/N^): 
  if /i "!CROZZO_NPM!"=="S" (
    call npm install
    if errorlevel 1 set "CROZZO_ERR=1"
  ) else (
    set "CROZZO_ERR=1"
  )
) else (
  echo   [OK] node_modules
)

if not exist "%~dp0..\..\app\Crozzo_POS_Completo.html" (
  echo   [X] Falta app\Crozzo_POS_Completo.html
  set "CROZZO_ERR=1"
) else (
  echo   [OK] app\Crozzo_POS_Completo.html
)

if not exist "%~dp0..\..\app\infra\CrozzoSystemUpdates.js" (
  echo   [X] Falta app\infra\CrozzoSystemUpdates.js
  set "CROZZO_ERR=1"
) else (
  echo   [OK] app\infra\ actualizaciones
)

if not exist "%~dp0..\..\src\core" (
  echo   [!] src\ sin sincronizar — use opcion [1] del menu
  set "CROZZO_ERR=1"
) else (
  echo   [OK] src\ sincronizado
)

echo.
if "%CROZZO_ERR%"=="1" (
  echo   Hay problemas. Corrijalos antes de publicar o compilar.
) else (
  echo   Entorno listo para usar las herramientas.
)
echo.
set "CROZZO_EXIT=%CROZZO_ERR%"
endlocal & exit /b %CROZZO_EXIT%
