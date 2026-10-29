@echo off
rem Builds the Windows installer (.exe). Result: dist\DualSSH-Setup-1.0.0.exe
cd /d "%~dp0"
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is needed once, to BUILD the installer. The installer itself needs nothing.
  echo Install it from https://nodejs.org then run this again.
  pause
  exit /b 1
)
call npm install --ignore-scripts
if errorlevel 1 ( echo npm install failed & pause & exit /b 1 )
call npm run dist:win
if errorlevel 1 ( echo build failed & pause & exit /b 1 )
echo.
echo Done. The installer is in the dist folder.
start "" dist
pause
