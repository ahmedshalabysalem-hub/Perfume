@echo off
rem Double-click to start the Perfume site (database, updates, server, browser).
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"
if errorlevel 1 if not defined PERFUME_CI pause
