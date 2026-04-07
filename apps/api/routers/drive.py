"""
Google Drive router — OAuth flow + folder scanning scaffolding.
Requires GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI in .env
Without credentials: auth-url returns a placeholder URL (UI still renders).
"""

import os
import json
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import RedirectResponse

import httpx

from db.database import get_db, row_to_dict
from routers.auth import get_current_user
from services.queue import job_queue
from models.schemas import DriveAuthUrlResponse, DriveScanRequest, DriveScanResponse

router = APIRouter()

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:3000/api/drive/callback")
SCOPES = "https://www.googleapis.com/auth/drive.readonly"

DRIVE_CREDENTIALS_CONFIGURED = bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)


def _get_auth_url(state: str) -> str:
    if not DRIVE_CREDENTIALS_CONFIGURED:
        return "/settings?drive_error=not_configured"
    params = (
        f"client_id={GOOGLE_CLIENT_ID}"
        f"&redirect_uri={REDIRECT_URI}"
        f"&response_type=code"
        f"&scope={SCOPES}"
        f"&access_type=offline"
        f"&prompt=consent"
        f"&state={state}"
    )
    return f"https://accounts.google.com/o/oauth2/v2/auth?{params}"


@router.get("/auth-url", response_model=DriveAuthUrlResponse)
async def get_drive_auth_url(current_user: dict = Depends(get_current_user)):
    """Returns the Google OAuth URL to initiate Drive connection."""
    state = current_user["id"]  # use user ID as state for CSRF protection
    return DriveAuthUrlResponse(authUrl=_get_auth_url(state))


@router.get("/callback")
async def drive_callback(
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
):
    """
    Handle Google OAuth callback.
    Exchanges auth code for tokens and saves to user record.
    """
    if error:
        return RedirectResponse(url=f"/settings?drive_error={error}")

    if not DRIVE_CREDENTIALS_CONFIGURED:
        return RedirectResponse(url="/settings?drive_error=not_configured")

    if not code or not state:
        return RedirectResponse(url="/settings?drive_error=missing_params")

    # Exchange code for tokens
    async with httpx.AsyncClient() as client:
        resp = await client.post("https://oauth2.googleapis.com/token", data={
            "code": code,
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "redirect_uri": REDIRECT_URI,
            "grant_type": "authorization_code",
        })

    if resp.status_code != 200:
        return RedirectResponse(url="/settings?drive_error=token_exchange_failed")

    tokens = resp.json()
    user_id = state  # state = user id

    with get_db() as conn:
        conn.execute(
            "UPDATE users SET drive_tokens=?, drive_connected=1, updated_at=? WHERE id=?",
            (json.dumps(tokens), datetime.utcnow().isoformat(), user_id)
        )

    return RedirectResponse(url="/settings?drive_connected=true")


@router.get("/folders")
async def list_drive_folders(current_user: dict = Depends(get_current_user)):
    """List top-level folders in user's Google Drive."""
    user = row_to_dict(current_user)
    if not user.get("drive_tokens"):
        raise HTTPException(status_code=403, detail="Google Drive not connected")

    tokens = json.loads(user["drive_tokens"])
    access_token = tokens.get("access_token")

    if not access_token:
        raise HTTPException(status_code=403, detail="Invalid Drive tokens")

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://www.googleapis.com/drive/v3/files",
            params={
                "q": "mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false",
                "fields": "files(id,name,mimeType)",
                "pageSize": 100,
            },
            headers={"Authorization": f"Bearer {access_token}"},
        )

    if resp.status_code == 401:
        raise HTTPException(status_code=403, detail="Drive token expired. Please reconnect.")

    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Failed to fetch Drive folders")

    files = resp.json().get("files", [])
    return {"folders": [{"id": f["id"], "name": f["name"], "mimeType": f["mimeType"]} for f in files]}


@router.post("/scan", response_model=DriveScanResponse)
async def scan_drive_folder(
    req: DriveScanRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Start scanning a Google Drive folder.
    Lists all supported image files and enqueues processing jobs.
    """
    user = row_to_dict(current_user)
    if not user.get("drive_tokens"):
        raise HTTPException(status_code=403, detail="Google Drive not connected")

    tokens = json.loads(user["drive_tokens"])
    access_token = tokens.get("access_token")
    user_id = current_user["id"]

    # List image files in the folder
    SUPPORTED_MIME = {
        "image/jpeg", "image/jpg", "image/png",
        "image/heic", "image/heif",
    }

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://www.googleapis.com/drive/v3/files",
            params={
                "q": f"'{req.folderId}' in parents and trashed=false",
                "fields": "files(id,name,mimeType,size)",
                "pageSize": 1000,
            },
            headers={"Authorization": f"Bearer {access_token}"},
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Failed to list Drive folder contents")

    all_files = resp.json().get("files", [])
    image_files = [f for f in all_files if f.get("mimeType", "") in SUPPORTED_MIME]

    if len(image_files) == 0:
        raise HTTPException(status_code=422, detail="No supported images found in the selected folder.")

    now = datetime.utcnow().isoformat()
    session_id = f"s_{uuid.uuid4().hex[:16]}"

    with get_db() as conn:
        conn.execute(
            """INSERT INTO sessions
               (id, user_id, source_type, drive_folder_id, drive_folder_name, status, total_photos, name, created_at, updated_at)
               VALUES (?, ?, 'GOOGLE_DRIVE', ?, ?, 'PROCESSING', ?, ?, ?, ?)""",
            (session_id, user_id, req.folderId, req.folderName,
             len(image_files), f"Drive: {req.folderName}", now, now)
        )

    # Enqueue download + process job for each image
    for drive_file in image_files:
        photo_id = f"p_{uuid.uuid4().hex[:16]}"
        job_id = f"j_{uuid.uuid4().hex[:16]}"

        with get_db() as conn:
            conn.execute(
                """INSERT INTO photos
                   (id, session_id, user_id, filename, original_name, storage_url,
                    category, source_type, drive_file_id, mime_type, file_size, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, '', 'UNCERTAIN', 'GOOGLE_DRIVE', ?, ?, ?, ?, ?)""",
                (photo_id, session_id, user_id,
                 drive_file["name"], drive_file["name"],
                 drive_file["id"], drive_file.get("mimeType"),
                 int(drive_file.get("size", 0)),
                 now, now)
            )
            conn.execute(
                "INSERT INTO jobs (id, session_id, photo_id, status, created_at, updated_at) VALUES (?, ?, ?, 'QUEUED', ?, ?)",
                (job_id, session_id, photo_id, now, now)
            )

        job_queue.enqueue(
            _download_and_process_drive_file,
            job_id, photo_id, session_id, drive_file["id"],
            drive_file["name"], access_token, user_id
        )

    return DriveScanResponse(
        sessionId=session_id,
        totalFiles=len(image_files),
        message=f"Scanning {len(image_files)} images from Drive folder '{req.folderName}'",
    )


async def _download_and_process_drive_file(
    job_id: str,
    photo_id: str,
    session_id: str,
    drive_file_id: str,
    filename: str,
    access_token: str,
    user_id: str,
):
    """Download a Drive file then run the standard photo processing pipeline."""
    from workers.process_photo import process_photo_job

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"https://www.googleapis.com/drive/v3/files/{drive_file_id}",
            params={"alt": "media"},
            headers={"Authorization": f"Bearer {access_token}"},
        )

    if resp.status_code != 200:
        from db.database import get_db
        from datetime import datetime
        with get_db() as conn:
            conn.execute(
                "UPDATE jobs SET status='FAILED', error_msg=?, updated_at=? WHERE id=?",
                (f"Download failed: HTTP {resp.status_code}", datetime.utcnow().isoformat(), job_id)
            )
        return

    file_bytes = resp.content

    # Save to storage
    storage_url = await __import__("services.storage", fromlist=["storage"]).storage.upload(
        file_bytes, filename, folder=f"photos/{user_id}", content_type="image/jpeg"
    )
    with get_db() as conn:
        conn.execute(
            "UPDATE photos SET storage_url=?, updated_at=? WHERE id=?",
            (storage_url, datetime.utcnow().isoformat(), photo_id)
        )

    await process_photo_job(job_id, photo_id, session_id, file_bytes, filename, "GOOGLE_DRIVE", user_id)


@router.delete("/disconnect")
async def disconnect_drive(current_user: dict = Depends(get_current_user)):
    """Remove stored Drive tokens."""
    with get_db() as conn:
        conn.execute(
            "UPDATE users SET drive_tokens=NULL, drive_connected=0, updated_at=? WHERE id=?",
            (datetime.utcnow().isoformat(), current_user["id"])
        )
    return {"success": True}
