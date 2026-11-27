@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"
if errorlevel 1 (
  echo.
  echo SquadTimer konnte nicht gestartet werden. Details siehe oben.
  pause
)
