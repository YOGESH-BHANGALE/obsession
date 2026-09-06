#!/usr/bin/env bash
set -e

echo "======================================================================"
echo "   SHODH — Criminal Network Analysis Platform"
echo "   Smart India Hackathon | 100% Local | High-Precision Intelligence"
echo "======================================================================"
echo ""

# 1. Check Python
if ! command -v python3 &> /dev/null; then
    echo "[ERROR] python3 is not installed or not in PATH."
    exit 1
fi

# 2. Virtual Environment
if [ ! -d "backend/venv" ]; then
    echo "[INFO] Creating Python virtual environment in backend/venv..."
    python3 -m venv backend/venv
fi

echo "[INFO] Activating virtual environment..."
source backend/venv/bin/activate

# 3. Dependencies
echo "[INFO] Installing Python dependencies..."
pip install --upgrade pip
pip install -r backend/requirements.txt

# 4. Data Generator
if [ ! -f "data-generator/output/complete_case_data.json" ]; then
    echo "[INFO] Generating fictional syndicate dataset (~40 entities)..."
    cd data-generator
    python3 generate.py
    cd ..
fi

# 5. Frontend
echo "[INFO] Setting up frontend..."
cd frontend
if [ ! -d "node_modules" ]; then
    npm install
fi
cd ..

# 6. Launch both
echo ""
echo "======================================================================"
echo "[INFO] Starting Backend on http://localhost:8000"
echo "[INFO] Starting Frontend on http://localhost:5173"
echo "======================================================================"
echo ""

(cd backend && source venv/bin/activate && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload) &
BACKEND_PID=$!

(cd frontend && npm run dev) &
FRONTEND_PID=$!

trap "kill $BACKEND_PID $FRONTEND_PID" EXIT

echo "Platform running. Press Ctrl+C to terminate."
wait
