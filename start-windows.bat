@echo off
REM ─────────────────────────────────────────────────────────────
REM  debasish. — Web Studio & Store · Windows / XAMPP launcher
REM  XAMPP does NOT include Node.js — install it first:
REM    https://nodejs.org  →  LTS (v22 or newer)  →  default options
REM  Then double-click this file (or run it from cmd).
REM ─────────────────────────────────────────────────────────────
setlocal
cd /d "%~dp0"

echo.
echo  debasish. — Web Studio ^& Store
echo  ─────────────────────────────────

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [X] Node.js is not installed or not on PATH.
  echo      Install the LTS build from https://nodejs.org
  echo      ^(version 22.5 or newer^), then run this again.
  echo.
  pause
  exit /b 1
)

for /f "delims=" %%v in ('node -v') do set NODEVER=%%v
echo  Node found: %NODEVER%

if not exist node_modules (
  echo  First run — installing dependencies…
  call npm install
  if errorlevel 1 (
    echo  [X] npm install failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)

echo.
echo  Starting → http://localhost:8000
echo  First visit on a fresh install redirects to /setup.html (the installer).
echo  Keep this window open; close it (or Ctrl+C) to stop the site.
echo.
call npm start
pause
