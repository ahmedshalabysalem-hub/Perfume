@echo off
rem Double-click to stop the Perfume site.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop.ps1"
if errorlevel 1 if not defined PERFUME_CI pause
if not defined PERFUME_CI timeout /t 5
