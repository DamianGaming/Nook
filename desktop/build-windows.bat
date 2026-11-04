@echo off
setlocal
cd /d "%~dp0"
echo.
echo  Building the Nook Windows installer. This takes a few minutes the first time.
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo  Node.js is not installed. Get the LTS version from https://nodejs.org, install it, then run this again.
  pause
  exit /b 1
)
if not exist "..\.env" (
  echo  Missing the file ".env" in the main Nook folder. Copy ".env.example" to ".env" and fill in your Supabase keys, then run this again.
  pause
  exit /b 1
)
call npm install --no-audit --no-fund
if errorlevel 1 goto fail
call npm run dist
if errorlevel 1 goto fail
echo.
echo  Done. Your installer is in the "release" folder next to this file: Nook-Setup.exe
start "" "%~dp0release"
pause
exit /b 0
:fail
echo.
echo  Something went wrong. Scroll up to read the error.
pause
exit /b 1
