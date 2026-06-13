@echo off
chcp 65001 >nul 2>&1
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0..\.."

echo.
echo  Crozzo POS - Compilar APK Android ^(local, sin GitHub^)
echo  ========================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Instale Node.js LTS.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Instalando dependencias npm...
  call npm install
  if errorlevel 1 exit /b 1
)

if not defined ANDROID_HOME (
  if exist "%LOCALAPPDATA%\Android\Sdk" set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
)
if not defined ANDROID_HOME (
  if exist "%USERPROFILE%\AppData\Local\Android\Sdk" set "ANDROID_HOME=%USERPROFILE%\AppData\Local\Android\Sdk"
)
if not defined ANDROID_HOME (
  echo [ERROR] ANDROID_HOME no encontrado.
  echo Instale Android Studio y el SDK, o defina ANDROID_HOME.
  pause
  exit /b 1
)
set "ANDROID_SDK_ROOT=%ANDROID_HOME%"
echo [OK] ANDROID_HOME=%ANDROID_HOME%

where java >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Java ^(JDK 17+^) no encontrado en PATH.
  pause
  exit /b 1
)

echo.
echo [1/6] Sync frontend app -^> src...
node scripts\sync-frontend-to-src.mjs
if errorlevel 1 (
  echo [ERROR] Sync frontend
  pause
  exit /b 1
)

if not exist "src-tauri\gen\android" (
  echo.
  echo [2/6] Inicializando proyecto Android ^(primera vez^)...
  call npx tauri android init --ci --skip-targets-install
  if errorlevel 1 (
    echo [ERROR] tauri android init
    pause
    exit /b 1
  )
) else (
  echo [2/6] Proyecto Android ya existe.
)

echo.
echo [3/6] Keystore y firma...
set "ANDROID_KEYSTORE_PATH=%USERPROFILE%\.crozzo\crozzo-android-upload.jks"
set "ANDROID_KEY_ALIAS=upload"
set "ANDROID_KEY_PASSWORD=crozzo-pos-tablet-2026"
if not exist "%ANDROID_KEYSTORE_PATH%" (
  echo [AVISO] No hay keystore en %ANDROID_KEYSTORE_PATH%
  echo Ejecute antes: menu.bat opcion [B] ^(generar-keystore-android.bat^)
  set /p CROZZO_KS=¿Continuar con keystore temporal? ^(S/N^): 
  if /i not "!CROZZO_KS!"=="S" exit /b 1
)
node scripts\prepare-android-keystore.mjs
if errorlevel 1 (
  pause
  exit /b 1
)

echo.
echo [4/6] Parches Gradle...
node scripts\patch-android-signing.mjs
if errorlevel 1 exit /b 1
node scripts\patch-android-apk-install.mjs
if errorlevel 1 exit /b 1

echo.
echo [5/6] Compilando APK ^(puede tardar varios minutos^)...
call npx tauri android build --target aarch64
if errorlevel 1 (
  echo [ERROR] tauri android build
  pause
  exit /b 1
)

echo.
echo [6/6] Copiando a dist\local\...
node scripts\compilar-apk-local.mjs
if errorlevel 1 (
  pause
  exit /b 1
)

echo.
echo  LISTO — APK local sin subir a GitHub.
echo  Carpeta: dist\local\
echo  Instale en tablet por USB, correo o carpeta compartida.
echo.
pause
endlocal
