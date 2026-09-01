@echo off
setlocal
title SelahMC v8.3.6 Portable
cd /d "%~dp0"

set "SELAH_SERVER=bin\selah-portable-server-x64.exe"
if /I "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "SELAH_SERVER=bin\selah-portable-server-arm64.exe"
if /I "%PROCESSOR_ARCHITEW6432%"=="ARM64" set "SELAH_SERVER=bin\selah-portable-server-arm64.exe"

if not exist "%SELAH_SERVER%" (
  echo SelahMC could not find its portable server.
  echo Extract the entire ZIP before running this file.
  pause
  exit /b 1
)
"%SELAH_SERVER%" --root "%~dp0client" --port 3001 --open=true
if errorlevel 1 (
  echo.
  echo SelahMC could not start. Close any older SelahMC portable window and try again.
  pause
  exit /b 1
)
