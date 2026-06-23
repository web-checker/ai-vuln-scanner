@echo off
cd /d "%~dp0"

REM ===== V-CHECKER easy run : one window, one URL (http://localhost:8000) =====

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

echo === building frontend ... ===
pushd frontend
call npm run build
popd

echo.
echo ===  Open  http://localhost:8600   ( press Ctrl+C to stop )  ===
start http://localhost:8600
python -m uvicorn server.main:app --port 8600
