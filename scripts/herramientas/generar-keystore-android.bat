@echo off
chcp 65001 >nul 2>&1
setlocal EnableExtensions EnableDelayedExpansion
title Crozzo POS - Keystore Android
cd /d "%~dp0..\.."

set "KS=%USERPROFILE%\.crozzo\crozzo-android-upload.jks"
set "ALIAS=upload"
set /p CROZZO_PASS=Contraseña del keystore (Enter = crozzo-pos-tablet-2026): 
if not defined CROZZO_PASS set "CROZZO_PASS=crozzo-pos-tablet-2026"

where keytool >nul 2>&1
if errorlevel 1 (
  echo [ERROR] keytool no encontrado. Instale JDK 17+ y agregue keytool al PATH.
  pause
  exit /b 1
)

if not exist "%USERPROFILE%\.crozzo" mkdir "%USERPROFILE%\.crozzo"

if exist "%KS%" (
  echo.
  echo Ya existe: %KS%
  set /p CROZZO_OVER=¿Regenerar? ^(S/N^): 
  if /i not "!CROZZO_OVER!"=="S" goto :show_b64
)

echo.
echo Generando keystore Android...
keytool -genkeypair -v -keystore "%KS%" -storepass "%CROZZO_PASS%" -keypass "%CROZZO_PASS%" -alias %ALIAS% -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Crozzo POS, OU=Mobile, O=Crozzo, L=Colombia, C=CO"
if errorlevel 1 (
  echo [ERROR] keytool falló.
  pause
  exit /b 1
)

:show_b64
echo.
echo ============================================================
echo   Keystore: %KS%
echo   Alias:    %ALIAS%
echo ============================================================
echo.
echo Agregue estos SECRETS en GitHub ^(repo Principal → Settings → Secrets^):
echo.
echo   ANDROID_KEY_ALIAS = %ALIAS%
echo   ANDROID_KEY_PASSWORD = ^(su contraseña^)
echo.
echo   ANDROID_KEY_BASE64 = ^(pegue la salida base64 de abajo^)
echo.
echo --- BASE64 inicio ---
certutil -encode "%KS%" "%TEMP%\crozzo-ks.b64" >nul
findstr /v /c:"-----" "%TEMP%\crozzo-ks.b64"
echo --- BASE64 fin ---
echo.
echo Guarde una copia de %KS% en lugar seguro. Sin el keystore no podrá
echo publicar actualizaciones Android en Play Store ni firmar releases.
echo.
pause
