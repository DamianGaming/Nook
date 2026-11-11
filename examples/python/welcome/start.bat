@echo off
title Nook bot
cd /d "%~dp0"
set PY=py
where py >nul 2>nul
if errorlevel 1 set PY=python
where %PY% >nul 2>nul
if errorlevel 1 (
  echo Python is not installed. Opening the download page...
  start https://www.python.org/downloads/
  pause
  exit /b
)
echo Getting the newest Nook library and your packages...
%PY% -m pip install --quiet --upgrade --force-reinstall --no-deps "https://YOUR-SITE/sdk/nook_bot-4.0.0-py3-none-any.whl"
%PY% -m pip install --quiet -r requirements.txt
if errorlevel 1 (
  echo Could not install the packages. Check your internet connection.
  pause
  exit /b
)
:again
%PY% mybot.py
echo.
echo The bot stopped. Restarting in 5 seconds. Close this window to stop it for good.
timeout /t 5 >nul
goto again
