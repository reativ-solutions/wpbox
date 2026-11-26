@echo off
rem Windows shortcut: runs wpdev.ps1 without PowerShell ExecutionPolicy issues.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0wpdev.ps1" %*
exit /b %ERRORLEVEL%
