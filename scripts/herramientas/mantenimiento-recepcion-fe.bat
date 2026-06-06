@echo off
setlocal
cd /d "%~dp0..\.."
echo.
echo === Mantenimiento FE - Entrada de facturas ===
echo.
echo  1. Diagnostico (check)
echo  2. Refresh completo (sync + datos + bundle)
echo  3. Evaluacion rapida (14 PDFs)
echo  4. Entrenamiento lote (83 PDFs)
echo  5. Entrenamiento completo + reintentos
echo  6. Mapa QR + datos
echo  0. Salir
echo.
set /p OPC=Opcion: 
if "%OPC%"=="1" node scripts\maintain-recepcion-fe.mjs check & goto fin
if "%OPC%"=="2" node scripts\maintain-recepcion-fe.mjs refresh & goto fin
if "%OPC%"=="3" node scripts\maintain-recepcion-fe.mjs eval & goto fin
if "%OPC%"=="4" node scripts\train-recepcion-fe.mjs & goto fin
if "%OPC%"=="5" node scripts\train-recepcion-fe.mjs --full --retry-failed & goto fin
if "%OPC%"=="6" node scripts\maintain-recepcion-fe.mjs build-data & goto fin
if "%OPC%"=="0" goto fin
echo Opcion invalida
:fin
echo.
pause
endlocal
