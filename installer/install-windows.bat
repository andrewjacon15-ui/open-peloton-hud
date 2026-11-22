@echo off
rem Peloton HUD installer: double-click me. Runs install.ps1 in this folder (no admin needed).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
echo.
pause
