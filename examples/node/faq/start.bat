@echo off
title Nook bot
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Opening the download page...
  start https://nodejs.org
  pause
  exit /b
)
echo Getting the newest Nook library and your packages...
call npm install --no-package-lock --no-audit --no-fund --prefer-online --silent
if errorlevel 1 (
  echo Could not install the packages. Check your internet connection.
  pause
  exit /b
)
:again
node mybot.mjs
echo.
echo The bot stopped. Restarting in 5 seconds. Close this window to stop it for good.
timeout /t 5 >nul
goto again
