@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0..\.."

echo.
echo  Configurar GitHub (remote origin)
echo  =================================
echo.
echo Repositorio de este proyecto:
echo   https://github.com/kenny14ramirez-prog/Principal.git
echo.

if "%~1"=="" (
  set /p CROZZO_REPO=URL del repositorio ^(Enter = Principal^): 
) else (
  set "CROZZO_REPO=%~1"
)

if not defined CROZZO_REPO set "CROZZO_REPO=https://github.com/kenny14ramirez-prog/Principal.git"

git remote remove origin 2>nul
git remote add origin "%CROZZO_REPO%"
if errorlevel 1 (
  echo [ERROR] No se pudo agregar origin.
  pause
  exit /b 1
)

echo.
echo Remote configurado:
git remote -v
echo.
pause
