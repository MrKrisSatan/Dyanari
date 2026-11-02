@echo off
cd /d "%~dp0"
if exist "%~dp0Dyanari.exe" (
start "Dyanari" "%~dp0Dyanari.exe"
exit /b
)
"%~dp0runtime\node.exe" start-services.mjs
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
start "Dyanari" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --app=http://127.0.0.1:17841/
) else (
start "Dyanari" "http://127.0.0.1:17841/"
)
