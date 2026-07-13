@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================
echo   Upload project to GitHub
echo ========================================
echo.

where git >nul 2>&1
if errorlevel 1 (
  echo Git is not installed.
  echo Install from: https://git-scm.com/download/win
  echo Or run: winget install Git.Git
  echo.
  echo After install, close this window, open a NEW one, and run this file again.
  pause
  exit /b 1
)

where gh >nul 2>&1
if errorlevel 1 (
  echo GitHub CLI ^(gh^) is not installed. Installing is recommended.
  echo You can install with: winget install GitHub.cli
  echo.
  echo Without gh you can still push if the repo already exists on GitHub.
  echo.
)

if not exist ".git\" (
  echo Initializing git repository...
  git init
  git branch -M main
)

echo.
echo Staging files...
git add .
git status

echo.
set /p MSG="Commit message (or Enter for default): "
if "%MSG%"=="" set MSG=Initial commit: WHACHAT app

git diff --cached --quiet
if errorlevel 1 (
  git commit -m "%MSG%"
) else (
  echo No new changes to commit.
)

echo.
where gh >nul 2>&1
if not errorlevel 1 (
  gh auth status >nul 2>&1
  if errorlevel 1 (
    echo Login to GitHub...
    gh auth login
  )
  echo.
  echo Creating GitHub repo and pushing...
  gh repo create --source=. --public --push --remote=origin
  if errorlevel 1 (
    echo.
    echo If the repo already exists, trying git push...
    git push -u origin main
  )
) else (
  echo.
  echo Create an empty repo on https://github.com/new
  echo Then run these commands ^(replace USER/REPO^):
  echo   git remote add origin https://github.com/USER/REPO.git
  echo   git push -u origin main
  echo.
)

echo.
echo Done.
pause
