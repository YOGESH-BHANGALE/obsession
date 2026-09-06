@echo off
setlocal enabledelayedexpansion

echo ======================================================================
echo    SHODH — Criminal Network Analysis Platform
echo    Smart India Hackathon | 100%% Local | High-Precision Intelligence
echo ======================================================================
echo.

REM 1. Check Python
where python >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Python is not installed or not in PATH.
    pause
    exit /b 1
)

REM 2. Setup Virtual Environment
if not exist "backend\venv" (
    echo [INFO] Creating Python virtual environment in backend\venv...
    python -m venv backend\venv
)

echo [INFO] Activating virtual environment...
call backend\venv\Scripts\activate.bat

REM 3. Install backend dependencies
echo [INFO] Installing Python dependencies...
python -m pip install --upgrade pip
pip install -r backend\requirements.txt

REM 4. Generate synthetic dataset if not already present
if not exist "data-generator\output\complete_case_data.json" (
    echo [INFO] Generating ~40 entity syndicate dataset with 12 seeded patterns...
    cd data-generator
    python generate.py
    cd ..
)

REM 5. Setup frontend
echo [INFO] Verifying frontend packages...
cd frontend
if not exist "node_modules" (
    echo [INFO] Installing frontend dependencies...
    call npm install
)
cd ..

REM 6. Launch Backend & Frontend in parallel
echo.
echo ======================================================================
echo [INFO] Starting Backend on http://localhost:8000 ...
echo [INFO] Starting Frontend on http://localhost:5173 ...
echo ======================================================================
echo.

start "CNAP Backend (FastAPI)" cmd /k "cd /d %~dp0backend && call venv\Scripts\activate.bat && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"
start "CNAP Frontend (Vite React)" cmd /k "cd /d %~dp0frontend && npm run dev"

timeout /t 3 >nul
start http://localhost:5173

echo System is running!
echo Login credentials:
echo   - Investigator: investigator / invest123
echo   - Senior Authority: senior / senior123
echo   - Admin: admin / admin123
echo.
pause
