@echo off
REM Sube releases/*.json + frontend completo (app + src) a origin/main y tag vX.Y.Z

setlocal EnableExtensions

set "CROZZO_VER=%~1"
set "CROZZO_MSG=%~2"
set "CROZZO_LABEL=%~3"

if not defined CROZZO_VER exit /b 1
if not defined CROZZO_LABEL set "CROZZO_LABEL=RELEASE"

set "CROZZO_GIT_NAME=kenny14ramirez-prog"
set "CROZZO_GIT_EMAIL=kenny14ramirez-prog@users.noreply.github.com"
set "CROZZO_ROOT=%~dp0.."
set "CROZZO_WT=%TEMP%\crozzo-ota-wt-%RANDOM%"
set "CROZZO_STAGING=%TEMP%\crozzo-publish-staging-%RANDOM%"

cd /d "%CROZZO_ROOT%"

git remote get-url origin >nul 2>&1
if errorlevel 1 (
  echo [ERROR] No hay remote "origin". Ejecute: scripts\herramientas\configurar-github-remoto.bat
  exit /b 1
)

if not exist releases\latest.json (
  echo [ERROR] Falta releases\latest.json
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js no esta en el PATH. Instale Node LTS.
  exit /b 1
)

if not exist node_modules (
  echo [AVISO] Instalando dependencias npm...
  call npm install
  if errorlevel 1 exit /b 1
)

echo.
echo Sincronizando app\ -^> src\ ...
node scripts\sync-frontend-to-src.mjs
if errorlevel 1 exit /b 1

mkdir "%CROZZO_STAGING%" 2>nul
mkdir "%CROZZO_STAGING%\releases" 2>nul
mkdir "%CROZZO_STAGING%\src-tauri" 2>nul
mkdir "%CROZZO_STAGING%\scripts" 2>nul

copy /Y releases\latest.json "%CROZZO_STAGING%\releases\latest.json" >nul
if exist releases\registry.json copy /Y releases\registry.json "%CROZZO_STAGING%\releases\registry.json" >nul
copy /Y src-tauri\tauri.conf.json "%CROZZO_STAGING%\src-tauri\tauri.conf.json" >nul

call :mirror_frontend "%CROZZO_ROOT%\app" "%CROZZO_STAGING%\app"
call :mirror_frontend "%CROZZO_ROOT%\src" "%CROZZO_STAGING%\src"

copy /Y scripts\sync-frontend-to-src.mjs "%CROZZO_STAGING%\scripts\sync-frontend-to-src.mjs" >nul
copy /Y scripts\generate-release-json.mjs "%CROZZO_STAGING%\scripts\generate-release-json.mjs" >nul
copy /Y scripts\set-tauri-version.mjs "%CROZZO_STAGING%\scripts\set-tauri-version.mjs" >nul
if exist scripts\verificar-publicacion.mjs copy /Y scripts\verificar-publicacion.mjs "%CROZZO_STAGING%\scripts\verificar-publicacion.mjs" >nul
if exist scripts\sync-version-from-tag.mjs copy /Y scripts\sync-version-from-tag.mjs "%CROZZO_STAGING%\scripts\sync-version-from-tag.mjs" >nul
if exist scripts\verify-release-updater-json.mjs copy /Y scripts\verify-release-updater-json.mjs "%CROZZO_STAGING%\scripts\verify-release-updater-json.mjs" >nul
if exist .github\workflows (
  if not exist "%CROZZO_STAGING%\.github\workflows" mkdir "%CROZZO_STAGING%\.github\workflows"
  if exist .github\workflows\tauri-release.yml copy /Y .github\workflows\tauri-release.yml "%CROZZO_STAGING%\.github\workflows\tauri-release.yml" >nul
  if exist .github\workflows\README.md copy /Y .github\workflows\README.md "%CROZZO_STAGING%\.github\workflows\README.md" >nul
)

echo.
echo Publicando en GitHub (origin/main)...
git fetch origin
if errorlevel 1 (
  echo [ERROR] git fetch fallo.
  exit /b 1
)

if exist "%CROZZO_WT%" rmdir /s /q "%CROZZO_WT%" 2>nul
git worktree add "%CROZZO_WT%" origin/main
if errorlevel 1 (
  echo [ERROR] No se pudo crear worktree.
  exit /b 1
)

if not exist "%CROZZO_WT%\releases" mkdir "%CROZZO_WT%\releases"
if not exist "%CROZZO_WT%\scripts" mkdir "%CROZZO_WT%\scripts"
if not exist "%CROZZO_WT%\src-tauri" mkdir "%CROZZO_WT%\src-tauri"

copy /Y "%CROZZO_STAGING%\releases\latest.json" "%CROZZO_WT%\releases\latest.json" >nul
if exist "%CROZZO_STAGING%\releases\registry.json" copy /Y "%CROZZO_STAGING%\releases\registry.json" "%CROZZO_WT%\releases\registry.json" >nul
copy /Y "%CROZZO_STAGING%\src-tauri\tauri.conf.json" "%CROZZO_WT%\src-tauri\tauri.conf.json" >nul

call :mirror_frontend "%CROZZO_STAGING%\app" "%CROZZO_WT%\app"
call :mirror_frontend "%CROZZO_STAGING%\src" "%CROZZO_WT%\src"

copy /Y "%CROZZO_STAGING%\scripts\sync-frontend-to-src.mjs" "%CROZZO_WT%\scripts\sync-frontend-to-src.mjs" >nul
copy /Y "%CROZZO_STAGING%\scripts\generate-release-json.mjs" "%CROZZO_WT%\scripts\generate-release-json.mjs" >nul
if exist "%CROZZO_STAGING%\scripts\verificar-publicacion.mjs" copy /Y "%CROZZO_STAGING%\scripts\verificar-publicacion.mjs" "%CROZZO_WT%\scripts\verificar-publicacion.mjs" >nul
if exist "%CROZZO_STAGING%\.github\workflows\tauri-release.yml" (
  if not exist "%CROZZO_WT%\.github" mkdir "%CROZZO_WT%\.github"
  if not exist "%CROZZO_WT%\.github\workflows" mkdir "%CROZZO_WT%\.github\workflows"
  copy /Y "%CROZZO_STAGING%\.github\workflows\tauri-release.yml" "%CROZZO_WT%\.github\workflows\tauri-release.yml" >nul
)
if exist "%CROZZO_STAGING%\.github\workflows\README.md" (
  if not exist "%CROZZO_WT%\.github\workflows" mkdir "%CROZZO_WT%\.github\workflows"
  copy /Y "%CROZZO_STAGING%\.github\workflows\README.md" "%CROZZO_WT%\.github\workflows\README.md" >nul
)
if exist "%CROZZO_STAGING%\scripts\sync-version-from-tag.mjs" copy /Y "%CROZZO_STAGING%\scripts\sync-version-from-tag.mjs" "%CROZZO_WT%\scripts\sync-version-from-tag.mjs" >nul
if exist "%CROZZO_STAGING%\scripts\verify-release-updater-json.mjs" copy /Y "%CROZZO_STAGING%\scripts\verify-release-updater-json.mjs" "%CROZZO_WT%\scripts\verify-release-updater-json.mjs" >nul

pushd "%CROZZO_WT%"

REM Quitar workflow duplicado (compilaba 2x y rompia latest.json del updater)
if exist .github\workflows\release.yml git rm -f .github\workflows\release.yml

git add releases\ releases\*.json app\ src\ src-tauri\tauri.conf.json scripts\sync-frontend-to-src.mjs scripts\generate-release-json.mjs scripts\set-tauri-version.mjs
if exist scripts\verificar-publicacion.mjs git add scripts\verificar-publicacion.mjs
if exist scripts\sync-version-from-tag.mjs git add scripts\sync-version-from-tag.mjs
if exist scripts\verify-release-updater-json.mjs git add scripts\verify-release-updater-json.mjs
if exist .github\workflows git add .github\workflows\

git -c user.name=%CROZZO_GIT_NAME% -c user.email=%CROZZO_GIT_EMAIL% commit -m "release: v%CROZZO_VER% [%CROZZO_LABEL%] - sync frontend actual"
if errorlevel 1 (
  echo [AVISO] Sin cambios nuevos respecto a GitHub.
)

git push origin HEAD:main
if errorlevel 1 (
  echo [ERROR] Push a main fallo. Verifique login de git ^(git push origin main^).
  popd
  git worktree remove "%CROZZO_WT%" --force 2>nul
  rmdir /s /q "%CROZZO_STAGING%" 2>nul
  exit /b 1
)

git tag -f v%CROZZO_VER%
git push origin refs/tags/v%CROZZO_VER% --force
if errorlevel 1 (
  echo [ERROR] Push del tag v%CROZZO_VER% fallo.
  popd
  git worktree remove "%CROZZO_WT%" --force 2>nul
  rmdir /s /q "%CROZZO_STAGING%" 2>nul
  exit /b 1
)

popd
git worktree remove "%CROZZO_WT%" --force 2>nul
rmdir /s /q "%CROZZO_STAGING%" 2>nul

echo.
echo [OK] Frontend + manifiestos + tag v%CROZZO_VER% en GitHub.
echo GitHub Actions: solo "Tauri Release" ^(1 compilacion por tag^).
echo Verifique: scripts\herramientas\verificar-publicacion.bat
echo.
node scripts\verificar-publicacion.mjs
exit /b 0

:mirror_frontend
set "SRC_DIR=%~1"
set "DST_DIR=%~2"
if not exist "%SRC_DIR%" exit /b 0
if not exist "%DST_DIR%" mkdir "%DST_DIR%"
robocopy "%SRC_DIR%" "%DST_DIR%" /E /XD node_modules .git target /XF *.monolith.html /NFL /NDL /NJH /NJS /nc /ns /np >nul
exit /b 0
