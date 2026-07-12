@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================
echo   Deploy to Vercel
echo ========================================
echo.

where npm >nul 2>&1
if errorlevel 1 (
  echo npm was not found. Install Node.js: https://nodejs.org
  pause
  exit /b 1
)

echo This will open a browser to log in to Vercel if needed.
echo After deploy, add these Environment Variables in the Vercel dashboard:
echo   NEXT_PUBLIC_SUPABASE_URL
echo   NEXT_PUBLIC_SUPABASE_ANON_KEY
echo.
pause

echo.
echo Deploying (production)...
call npx --yes vercel@latest --prod

echo.
echo Done. Open the URL above, then set Supabase env vars if you have not yet:
echo   Project Settings -^> Environment Variables
echo Then Redeploy.
echo.
pause
