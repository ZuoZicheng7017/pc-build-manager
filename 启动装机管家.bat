@echo off
title PC Build Manager
cd /d "%~dp0"

echo ==========================================
echo          PC Build Manager Launcher
echo ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found. Install Node.js 22 or newer.
  pause
  exit /b 1
)

if not exist "node_modules\tsx" (
  echo [ERROR] Dependencies are not installed.
  echo Run: pnpm install
  pause
  exit /b 1
)

if not exist "dist\index.html" (
  echo [ERROR] Frontend build is missing.
  echo Run: pnpm build
  pause
  exit /b 1
)

powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
if not errorlevel 1 (
  echo Server is already running. Opening browser...
  start "" "http://127.0.0.1:8787"
  powershell -NoProfile -Command "Start-Sleep -Seconds 2"
  exit /b 0
)

echo Starting server, please wait...
echo Local:   http://127.0.0.1:8787
echo Account: xiaozuozhuangji
echo.
echo Close this window or press Ctrl+C to stop the server.
echo.

start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 10; Start-Process 'http://127.0.0.1:8787'"

node --env-file-if-exists=.env --import tsx server/index.ts
if errorlevel 1 (
  echo.
  echo [ERROR] Server exited. Check the log above.
  pause
)
