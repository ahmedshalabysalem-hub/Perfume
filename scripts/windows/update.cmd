@echo off
rem Double-click to update the Perfume site (download the latest code, update the database, start).
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0update.ps1"
if errorlevel 1 if not defined PERFUME_CI pause
