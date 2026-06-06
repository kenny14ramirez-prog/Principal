@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0..\.."
call "%~dp0publicar-actualizacion-auto.bat" critical %*
