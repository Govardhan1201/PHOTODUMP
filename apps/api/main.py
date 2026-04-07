"""
PhotoMind FastAPI Backend — main.py
Starts the API server, registers routers, and configures CORS.
"""

import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

from routers import uploads, sessions, jobs, photos, people, drive, auth
from services.queue import job_queue
from db.database import init_db

load_dotenv()

UPLOAD_DIR = os.getenv("LOCAL_UPLOAD_DIR", "./uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(f"{UPLOAD_DIR}/thumbnails", exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown hooks."""
    init_db()
    await job_queue.start()
    yield
    await job_queue.stop()


app = FastAPI(
    title="PhotoMind API",
    version="1.0.0",
    description="AI-powered photo organization backend",
    lifespan=lifespan,
)

# CORS — allow Next.js dev server and production domain
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        os.getenv("FRONTEND_URL", "http://localhost:3000"),
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve uploaded images directly in dev mode
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# Register all routers
app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(sessions.router, prefix="/api/sessions", tags=["Sessions"])
app.include_router(uploads.router, prefix="/api/photos", tags=["Uploads"])
app.include_router(jobs.router, prefix="/api/jobs", tags=["Jobs"])
app.include_router(photos.router, prefix="/api/photos", tags=["Photos"])
app.include_router(people.router, prefix="/api/people", tags=["People"])
app.include_router(drive.router, prefix="/api/drive", tags=["Drive"])


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "PhotoMind API"}
