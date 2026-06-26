@echo off
cd /d "%~dp0"

REM ===== V-CHECKER dev run : backend(8600) + frontend(5173), auto-reload =====

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [!] Node.js LTS is required.
  echo     Install from https://nodejs.org  then run this again.
  echo.
  pause
  exit /b
)

REM ── 파이썬 가상환경 준비(프로젝트 전용 .venv) ──
if not exist ".venv\Scripts\python.exe" (
  echo === first run: creating python venv ... ===
  py -3 -m venv .venv
  if errorlevel 1 python -m venv .venv
)
set "PY=%~dp0.venv\Scripts\python.exe"

REM ── 백엔드 의존성 설치(최초/누락 시) ──
"%PY%" -c "import uvicorn, fastapi" >nul 2>nul
if errorlevel 1 (
  echo === installing python packages ... ===
  "%PY%" -m pip install --upgrade pip
  "%PY%" -m pip install -r requirements.txt
)

if not exist "frontend\node_modules" (
  echo === first run: installing frontend packages ... ===
  pushd frontend
  call npm install
  popd
)

start "V-CHECKER backend"  cmd /k ""%PY%" -m uvicorn server.main:app --reload --port 8600"
start "V-CHECKER frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"
timeout /t 4 >nul
start http://localhost:5173
