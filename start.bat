@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo Starting WhaChat...
echo.

where npm >nul 2>&1
if errorlevel 1 (
  echo npm was not found. Install Node.js first: https://nodejs.org
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

if not exist ".env.local" (
  echo.
  echo WARNING: .env.local is missing.
  echo Copy .env.example to .env.local and fill in your Supabase keys.
  echo.
)

start "" "http://localhost:3000"
call npm run dev

pause
