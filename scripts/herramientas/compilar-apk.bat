@echo off
chcp 65001 >nul 2>&1
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0..\.."

echo.
echo  Crozzo POS - Compilar APK ^(igual que GitHub CI, sin publicar^)
echo  =============================================================
echo  Genera dist\local\BONA_origen_X.Y.Z_arm64.apk
echo  Misma firma que releases de GitHub si existe .github\signing\android-upload.jks.b64
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
  echo Instale Android Studio y el SDK. Ver ANDROID-SETUP.md
  pause
  exit /b 1
)
set "ANDROID_SDK_ROOT=%ANDROID_HOME%"
echo [OK] ANDROID_HOME=%ANDROID_HOME%

if not defined JAVA_HOME (
  for /f "delims=" %%J in ('where java 2^>nul') do (
    for %%D in ("%%~dpJ..") do set "JAVA_HOME=%%~fD"
    goto :java_ok
  )
)
:java_ok
where java >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Java ^(JDK 17+^) no encontrado en PATH.
  echo Instale JDK 17 o Android Studio. Ver ANDROID-SETUP.md
  pause
  exit /b 1
)
if defined JAVA_HOME echo [OK] JAVA_HOME=%JAVA_HOME%

if not defined NDK_HOME (
  for /d %%D in ("%ANDROID_HOME%\ndk\*") do set "NDK_HOME=%%~fD"
)
if defined NDK_HOME (
  echo [OK] NDK_HOME=%NDK_HOME%
) else (
  echo [AVISO] NDK_HOME no detectado — instale NDK r26 desde Android Studio ^> SDK Manager.
)

where rustup >nul 2>&1
if not errorlevel 1 (
  rustup target list --installed | findstr /i "aarch64-linux-android" >nul 2>&1
  if errorlevel 1 (
    echo [AVISO] Instalando target Rust aarch64-linux-android...
    rustup target add aarch64-linux-android
    if errorlevel 1 (
      echo [ERROR] No se pudo instalar rustup target aarch64-linux-android
      pause
      exit /b 1
    )
  )
)

node scripts\build-android-apk.mjs
if errorlevel 1 (
  echo.
  echo [ERROR] Compilacion APK fallida. Ver ANDROID-SETUP.md
  pause
  exit /b 1
)

echo.
echo  LISTO — pruebe en tablet sin publicar a clientes:
echo    dist\local\BONA_origen_*_arm64.apk
echo  USB: adb install -r dist\local\BONA_origen_*_arm64.apk
echo.
pause
endlocal
