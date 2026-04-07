"""
Uploads router — handles local file uploads (folder or file selection).
Validates file types + minimum count, saves files, creates session + jobs.
"""

import io
import json
import uuid
from datetime import datetime
from typing import List

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from PIL import Image

from db.database import get_db
from routers.auth import get_current_user
from services.storage import storage
from services.queue import job_queue
from workers.process_photo import process_photo_job

router = APIRouter()

SUPPORTED_TYPES = {"image/jpeg", "image/jpg", "image/png", "image/heic", "image/heif"}
SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".heic", ".heif"}
MIN_PHOTOS = 10


def validate_file(file: UploadFile) -> bool:
    """Check MIME type and file extension."""
    if file.content_type and file.content_type.lower() in SUPPORTED_TYPES:
        return True
    if file.filename:
        ext = "." + file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
        if ext in SUPPORTED_EXTENSIONS:
            return True
    return False


async def convert_heic(file_bytes: bytes) -> bytes:
    """Convert HEIC to JPEG using Pillow (basic support)."""
    try:
        img = Image.open(io.BytesIO(file_bytes))
        buf = io.BytesIO()
        img.convert("RGB").save(buf, format="JPEG", quality=90)
        return buf.getvalue()
    except Exception:
        return file_bytes


@router.post("/upload")
async def upload_photos(
    files: List[UploadFile] = File(...),
    source_type: str = Form("LOCAL_FILES"),  # LOCAL_FOLDER | LOCAL_FILES
    session_name: str = Form(""),
    current_user: dict = Depends(get_current_user),
):
    """
    Upload local images.
    - Validates file types on server side
    - Enforces minimum count (>10 for folder, >=10 for files)
    - Creates a session + per-photo jobs
    - Enqueues background processing
    """
    # Filter valid files
    valid_files = [f for f in files if validate_file(f)]
    invalid_count = len(files) - len(valid_files)

    # Enforce minimums
    min_required = 11 if source_type == "LOCAL_FOLDER" else 10
    if len(valid_files) < min_required:
        raise HTTPException(
            status_code=422,
            detail={
                "message": f"Not enough valid images. Got {len(valid_files)}, need {'more than 10' if source_type == 'LOCAL_FOLDER' else 'at least 10'}.",
                "validCount": len(valid_files),
                "invalidCount": invalid_count,
                "required": min_required,
            }
        )

    user_id = current_user["id"]
    session_id = f"s_{uuid.uuid4().hex[:16]}"
    now = datetime.utcnow().isoformat()

    # Create session
    with get_db() as conn:
        conn.execute(
            """INSERT INTO sessions (id, user_id, source_type, status, total_photos, name, created_at, updated_at)
               VALUES (?, ?, ?, 'PROCESSING', ?, ?, ?, ?)""",
            (session_id, user_id, source_type, len(valid_files),
             session_name or f"Upload {now[:10]}", now, now)
        )

    # Process each file: save, create DB record, enqueue job
    for f in valid_files:
        file_bytes = await f.read()

        # Convert HEIC if needed
        fname = f.filename or "photo.jpg"
        if fname.lower().endswith(".heic") or fname.lower().endswith(".heif"):
            file_bytes = await convert_heic(file_bytes)
            fname = fname.rsplit(".", 1)[0] + ".jpg"

        # Save original to storage
        storage_url = await storage.upload(
            file_bytes, fname, folder=f"photos/{user_id}", content_type="image/jpeg"
        )

        photo_id = f"p_{uuid.uuid4().hex[:16]}"
        job_id = f"j_{uuid.uuid4().hex[:16]}"

        with get_db() as conn:
            conn.execute(
                """INSERT INTO photos
                   (id, session_id, user_id, filename, original_name, storage_url,
                    category, source_type, file_size, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, 'UNCERTAIN', ?, ?, ?, ?)""",
                (photo_id, session_id, user_id, fname, f.filename or fname,
                 storage_url, source_type, len(file_bytes), now, now)
            )
            conn.execute(
                "INSERT INTO jobs (id, session_id, photo_id, status, created_at, updated_at) VALUES (?, ?, ?, 'QUEUED', ?, ?)",
                (job_id, session_id, photo_id, now, now)
            )

        # Enqueue background processing
        job_queue.enqueue(
            process_photo_job,
            job_id, photo_id, session_id, file_bytes, fname, source_type, user_id
        )

    return {
        "sessionId": session_id,
        "totalPhotos": len(valid_files),
        "invalidSkipped": invalid_count,
        "message": f"Processing {len(valid_files)} photos. Check /api/jobs/{session_id} for progress.",
    }
