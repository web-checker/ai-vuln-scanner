@echo off
cd /d "%~dp0"

REM ===== V-CHECKER dev run : backend(8000) + frontend(5173), auto-reload =====

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [!] Node.js LTS is required.
  echo     Install from https://nodejs.org  then run this again.
  echo.
  pause
  exit /b
)

if not exist "frontend\node_modules" (
  echo === first run: installing frontend packages ... ===
  pushd frontend
  call npm install
  popd
)

start "V-CHECKER backend"  cmd /k python -m uvicorn server.main:app --reload --port 8600
start "V-CHECKER frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"
timeout /t 4 >nul
start http://localhost:5173
