@echo off
cd /d "%~dp0"

REM ===== V-CHECKER easy run : one window, one URL (http://localhost:8600) =====

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
set "PY=.venv\Scripts\python.exe"

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

echo === building frontend ... ===
pushd frontend
call npm run build
popd

REM ── 기존에 8600 포트를 잡고 있는 좀비 프로세스 정리 ──
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":8600" ^| findstr LISTENING') do taskkill /F /PID %%P >nul 2>nul

echo.
echo ===  Open  http://localhost:8600   ( press Ctrl+C to stop )  ===
REM 서버가 뜰 시간을 준 뒤(약 4초) 브라우저를 여는 자식 프로세스
start "" cmd /c "timeout /t 4 >nul & start http://localhost:8600"
"%PY%" -m uvicorn server.main:app --port 8600
echo.
echo [!] 서버가 종료되었습니다. 위 메시지를 확인하세요.
pause
