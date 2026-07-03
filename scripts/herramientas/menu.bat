@echo off

chcp 65001 >nul 2>&1

title Crozzo POS - Herramientas

cd /d "%~dp0..\.."



if not defined CROZZO_REQ_OK (

  call "%~dp0verificar-requisitos.bat"

  if errorlevel 1 (

    echo.

    pause

  )

  set "CROZZO_REQ_OK=1"

)



:menu

cls

echo.

echo   ============================================

echo     Crozzo POS - Herramientas

echo   ============================================

echo.



for /f "usebackq delims=" %%C in (`node scripts\bump-tauri-version.mjs --current 2^>nul`) do set "CROZZO_VER=%%C"

for /f "usebackq delims=" %%N in (`node scripts\bump-tauri-version.mjs 2^>nul`) do set "CROZZO_NEXT=%%N"

if defined CROZZO_VER (

  echo   Version maxima ^(GitHub^) : v%CROZZO_VER%

  echo   Siguiente publicacion     : v%CROZZO_NEXT%

) else (

  echo   Version: no detectada — revise Node.js

)

echo.

echo   PUBLICAR TODO ^(version + interfaz + OTA + GitHub + CI^)

echo   [2] Actualizacion CRITICA   ^(recomendado — obliga instalar^)

echo   [3] Actualizacion OPCIONAL  ^(el cliente decide^)

echo.

echo   OTROS

echo   [1] Solo sync app -^> src ^(sin publicar^)

echo   [8] Verificar publicacion ^(local vs GitHub^)

echo   [4] Configurar GitHub remoto

echo   [5] Compilar .exe local ^(sin GitHub^)

echo   [7] Compilar .apk local ^(mismo que GitHub, prueba en tablet^)

echo   [6] Claves firma Tauri

echo   [B] Keystore Android ^(APK^)

echo   [0] Salir

echo.

set /p CROZZO_OP=Opcion: 



if "%CROZZO_OP%"=="1" call "%~dp0sync-frontend.bat" & goto menu

if "%CROZZO_OP%"=="2" call "%~dp0publicar-actualizacion-critica.bat" & goto menu

if "%CROZZO_OP%"=="3" call "%~dp0publicar-actualizacion-opcional.bat" & goto menu

if "%CROZZO_OP%"=="4" call "%~dp0configurar-github-remoto.bat" & goto menu

if "%CROZZO_OP%"=="5" call "%~dp0compilar-instalador.bat" & goto menu

if "%CROZZO_OP%"=="7" call "%~dp0compilar-apk.bat" & goto menu

if "%CROZZO_OP%"=="6" call "%~dp0generar-claves-tauri.bat" & goto menu

if /i "%CROZZO_OP%"=="B" call "%~dp0generar-keystore-android.bat" & goto menu

if "%CROZZO_OP%"=="8" call "%~dp0verificar-publicacion.bat" & goto menu

if "%CROZZO_OP%"=="0" exit /b 0

goto menu

