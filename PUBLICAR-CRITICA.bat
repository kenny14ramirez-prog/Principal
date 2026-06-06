@echo off
chcp 65001 >nul 2>&1
title Crozzo POS - Publicar CRITICA
cd /d "%~dp0"
call scripts\herramientas\publicar-actualizacion-critica.bat
