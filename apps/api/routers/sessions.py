"""
Sessions router — list and manage processing sessions.
"""

import json
from fastapi import APIRouter, HTTPException, Depends
from db.database import get_db, row_to_dict, rows_to_list
from routers.auth import get_current_user

router = APIRouter()


@router.get("/")
async def list_sessions(current_user: dict = Depends(get_current_user)):
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM sessions WHERE user_id=? ORDER BY created_at DESC LIMIT 50",
            (current_user["id"],)
        ).fetchall()
    return {"sessions": rows_to_list(rows)}


@router.get("/{session_id}")
async def get_session(session_id: str, current_user: dict = Depends(get_current_user)):
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM sessions WHERE id=? AND user_id=?",
            (session_id, current_user["id"])
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
    return row_to_dict(row)


@router.delete("/{session_id}")
async def delete_session(session_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a session and all its photos (cascades in DB)."""
    with get_db() as conn:
        result = conn.execute(
            "DELETE FROM sessions WHERE id=? AND user_id=?",
            (session_id, current_user["id"])
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Session not found")
    return {"success": True}
