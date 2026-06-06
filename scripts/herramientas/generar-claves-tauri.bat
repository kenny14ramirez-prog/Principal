@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0..\.."
echo.
echo  Claves de firma para actualizaciones Tauri
echo  Se guardan en: %USERPROFILE%\.tauri\crozzo-pos.key
echo.
set CI=true
call npm run tauri -- signer generate -w "%USERPROFILE%\.tauri\crozzo-pos.key" -f --ci
echo.
echo  Siguiente: en GitHub Actions cree el secret TAURI_SIGNING_PRIVATE_KEY
echo  con el CONTENIDO del archivo .key (no lo suba al repositorio).
echo.
pause
