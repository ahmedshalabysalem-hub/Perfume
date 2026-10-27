@echo off
rem Double-click to update the Perfume site (download the latest code, update the database, start).
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0update.ps1"
set "PERFUME_EXIT=%errorlevel%"
if not "%PERFUME_EXIT%"=="0" if not defined PERFUME_CI pause
exit /b %PERFUME_EXIT%
