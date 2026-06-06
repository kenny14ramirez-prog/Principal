@echo off
chcp 65001 >nul 2>&1
title Crozzo POS - Herramientas
cd /d "%~dp0"
call scripts\herramientas\menu.bat
