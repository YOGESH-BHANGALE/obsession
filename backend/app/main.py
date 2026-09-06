"""
Main FastAPI Application — Criminal Network Analysis Platform
Run: uvicorn app.main:app --reload --port 8000
"""
import os
import sys
from pathlib import Path

# Ensure backend directory is in sys.path
_backend_dir = str(Path(__file__).resolve().parent.parent)
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

import asyncio
import json
import datetime
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import get_server_config
from app.database import init_db, SessionLocal
from app.routes import router
from app.models import User
from app.auth import hash_password
from app.graph_store import get_graph_store


# ─── WebSocket Manager ───
class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, list[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, case_id: str):
        await websocket.accept()
        if case_id not in self.active_connections:
            self.active_connections[case_id] = []
        self.active_connections[case_id].append(websocket)

    def disconnect(self, websocket: WebSocket, case_id: str):
        if case_id in self.active_connections:
            self.active_connections[case_id] = [
                c for c in self.active_connections[case_id] if c != websocket
            ]

    async def broadcast(self, case_id: str, message: dict):
        if case_id in self.active_connections:
            dead = []
            for connection in self.active_connections[case_id]:
                try:
                    await connection.send_json(message)
                except Exception:
                    dead.append(connection)
            for d in dead:
                self.active_connections[case_id].remove(d)


manager = ConnectionManager()


# ─── Lifespan ───
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    init_db()
    _create_default_users()
    yield
    # Shutdown
    pass


def _create_default_users():
    """Create default demo users if they don't exist."""
    db = SessionLocal()
    try:
        if not db.query(User).filter(User.username == "admin").first():
            db.add(User(
                username="admin", email="admin@cnap.local",
                hashed_password=hash_password("admin123"),
                full_name="System Administrator", role="admin"
            ))
        if not db.query(User).filter(User.username == "investigator").first():
            db.add(User(
                username="investigator", email="investigator@cnap.local",
                hashed_password=hash_password("invest123"),
                full_name="Det. Rajesh Kumar", role="investigator"
            ))
        if not db.query(User).filter(User.username == "senior").first():
            db.add(User(
                username="senior", email="senior@cnap.local",
                hashed_password=hash_password("senior123"),
                full_name="DCP Priya Sharma", role="senior_authority"
            ))
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


# ─── App ───
app = FastAPI(
    title="Criminal Network Analysis Platform",
    description="AI-Powered investigation platform for law enforcement",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
server_config = get_server_config()
cors_env = os.environ.get("CORS_ORIGINS")
configured_origins = list(server_config.get("cors_origins", ["http://localhost:5173", "http://127.0.0.1:5173"]))
if cors_env:
    for origin in cors_env.split(","):
        trimmed = origin.strip()
        if trimmed and trimmed not in configured_origins:
            configured_origins.append(trimmed)

app.add_middleware(
    CORSMiddleware,
    allow_origins=configured_origins,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include REST routes
app.include_router(router)


# ─── Health Check ───
@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.datetime.utcnow().isoformat(),
        "version": "1.0.0"
    }


# ─── WebSocket: Live Graph Updates ───
@app.websocket("/ws/graph/{case_id}")
async def graph_websocket(websocket: WebSocket, case_id: str):
    await manager.connect(websocket, case_id)
    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)

            if msg.get("type") == "request_graph":
                store = get_graph_store()
                graph = store.get_graph(case_id)
                await websocket.send_json({"type": "graph_update", "data": graph})

            elif msg.get("type") == "ping":
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        manager.disconnect(websocket, case_id)


# ─── WebSocket: Location Tracking ───
@app.websocket("/ws/location/{case_id}")
async def location_websocket(websocket: WebSocket, case_id: str):
    await manager.connect(websocket, f"location_{case_id}")
    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            if msg.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        manager.disconnect(websocket, f"location_{case_id}")


# ─── Expose the manager for routes to use ───
app.state.ws_manager = manager
