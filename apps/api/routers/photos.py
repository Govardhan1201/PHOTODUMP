"""
Photos router — gallery CRUD, category move, manual review actions.
"""

import json
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Query
from db.database import get_db, row_to_dict, rows_to_list
from routers.auth import get_current_user
from models.schemas import MoveCategoryRequest, PhotoListResponse, PhotoOut

router = APIRouter()

VALID_CATEGORIES = {
    "WITH_ME", "PEOPLE", "NATURE", "ITEMS",
    "FOOD", "VEHICLES", "BUILDINGS", "MIXED", "UNCERTAIN"
}


def _photo_to_out(p: dict) -> dict:
    """Convert raw DB row to API-safe dict."""
    return {
        **p,
        "hasFaces": bool(p.get("has_faces")),
        "hasUser": bool(p.get("has_user")),
        "reviewFlag": bool(p.get("review_flag")),
        "faceClusterIds": json.loads(p.get("face_cluster_ids") or "[]"),
        "tags": json.loads(p.get("tags") or "[]"),
        "storageUrl": p.get("storage_url", ""),
        "thumbnailUrl": p.get("thumbnail_url"),
        "originalName": p.get("original_name", ""),
        "fileSize": p.get("file_size"),
        "createdAt": p.get("created_at"),
    }


@router.get("/", response_model=dict)
async def list_photos(
    category: Optional[str] = Query(None),
    has_faces: Optional[bool] = Query(None, alias="hasFaces"),
    has_user: Optional[bool] = Query(None, alias="hasUser"),
    review_flag: Optional[bool] = Query(None, alias="reviewFlag"),
    search: Optional[str] = Query(None),
    session_id: Optional[str] = Query(None, alias="sessionId"),
    page: int = Query(1, ge=1),
    page_size: int = Query(40, ge=1, le=200, alias="pageSize"),
    current_user: dict = Depends(get_current_user),
):
    """List photos with filters and pagination."""
    conditions = ["user_id = ?"]
    params = [current_user["id"]]

    if category and category in VALID_CATEGORIES:
        conditions.append("category = ?")
        params.append(category)
    if has_faces is not None:
        conditions.append("has_faces = ?")
        params.append(int(has_faces))
    if has_user is not None:
        conditions.append("has_user = ?")
        params.append(int(has_user))
    if review_flag is not None:
        conditions.append("review_flag = ?")
        params.append(int(review_flag))
    if session_id:
        conditions.append("session_id = ?")
        params.append(session_id)
    if search:
        conditions.append("(original_name LIKE ? OR tags LIKE ?)")
        term = f"%{search}%"
        params.extend([term, term])

    where = " AND ".join(conditions)
    offset = (page - 1) * page_size

    with get_db() as conn:
        total = conn.execute(f"SELECT COUNT(*) as c FROM photos WHERE {where}", params).fetchone()["c"]
        rows = conn.execute(
            f"SELECT * FROM photos WHERE {where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
            params + [page_size, offset]
        ).fetchall()

    photos = [_photo_to_out(row_to_dict(r)) for r in rows]
    return {"photos": photos, "total": total, "page": page, "pageSize": page_size}


@router.get("/counts")
async def get_category_counts(current_user: dict = Depends(get_current_user)):
    """Return photo counts per category for sidebar badges."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT category, COUNT(*) as count FROM photos WHERE user_id=? GROUP BY category",
            (current_user["id"],)
        ).fetchall()
        total = conn.execute(
            "SELECT COUNT(*) as c FROM photos WHERE user_id=?",
            (current_user["id"],)
        ).fetchone()["c"]

    counts = {r["category"]: r["count"] for r in rows}
    return {"total": total, "counts": counts}


@router.get("/{photo_id}")
async def get_photo(photo_id: str, current_user: dict = Depends(get_current_user)):
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM photos WHERE id=? AND user_id=?",
            (photo_id, current_user["id"])
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Photo not found")
    return _photo_to_out(row_to_dict(row))


@router.patch("/{photo_id}/category")
async def move_category(
    photo_id: str,
    req: MoveCategoryRequest,
    current_user: dict = Depends(get_current_user),
):
    """Manually move a photo to a different category."""
    if req.category.value not in VALID_CATEGORIES:
        raise HTTPException(status_code=422, detail="Invalid category")
    with get_db() as conn:
        result = conn.execute(
            "UPDATE photos SET category=?, updated_at=datetime('now') WHERE id=? AND user_id=?",
            (req.category.value, photo_id, current_user["id"])
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Photo not found")
    return {"success": True, "category": req.category.value}


@router.patch("/{photo_id}/flag")
async def toggle_review_flag(photo_id: str, current_user: dict = Depends(get_current_user)):
    """Toggle the review flag on a photo."""
    with get_db() as conn:
        row = conn.execute(
            "SELECT review_flag FROM photos WHERE id=? AND user_id=?",
            (photo_id, current_user["id"])
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Photo not found")
        new_flag = 1 - (row["review_flag"] or 0)
        conn.execute(
            "UPDATE photos SET review_flag=?, updated_at=datetime('now') WHERE id=?",
            (new_flag, photo_id)
        )
    return {"success": True, "reviewFlag": bool(new_flag)}


@router.delete("/{photo_id}")
async def delete_photo(photo_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a photo record (storage file cleanup in production)."""
    with get_db() as conn:
        result = conn.execute(
            "DELETE FROM photos WHERE id=? AND user_id=?",
            (photo_id, current_user["id"])
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Photo not found")
    return {"success": True}
