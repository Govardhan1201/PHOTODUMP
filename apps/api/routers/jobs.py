"""
Jobs router — poll processing progress for a session.
"""

from fastapi import APIRouter, HTTPException, Depends
from db.database import get_db, row_to_dict, rows_to_list
from routers.auth import get_current_user
from models.schemas import SessionProgress

router = APIRouter()


@router.get("/{session_id}", response_model=SessionProgress)
async def get_session_progress(
    session_id: str,
    current_user: dict = Depends(get_current_user),
):
    with get_db() as conn:
        session = conn.execute(
            "SELECT * FROM sessions WHERE id=? AND user_id=?",
            (session_id, current_user["id"])
        ).fetchone()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        jobs = conn.execute(
            "SELECT id, session_id, photo_id, status, error_msg FROM jobs WHERE session_id=? ORDER BY created_at LIMIT 100",
            (session_id,)
        ).fetchall()

    s = row_to_dict(session)
    total = s["total_photos"] or 1  # avoid division by zero
    percent = round((s["processed_photos"] + s["failed_photos"]) / total * 100, 1)

    return SessionProgress(
        sessionId=session_id,
        status=s["status"],
        totalPhotos=s["total_photos"],
        processedPhotos=s["processed_photos"],
        failedPhotos=s["failed_photos"],
        percent=percent,
        jobs=[{
            "id": j["id"],
            "sessionId": j["session_id"],
            "photoId": j["photo_id"],
            "status": j["status"],
            "errorMsg": j["error_msg"],
        } for j in jobs],
    )


@router.get("/sessions/all")
async def list_sessions(current_user: dict = Depends(get_current_user)):
    """Return all sessions for the current user."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM sessions WHERE user_id=? ORDER BY created_at DESC LIMIT 20",
            (current_user["id"],)
        ).fetchall()
    return {"sessions": rows_to_list(rows)}
