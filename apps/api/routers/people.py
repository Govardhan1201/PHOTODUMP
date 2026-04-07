"""
People router — face clusters, find-me flow, merge/split, label assignment.
"""

import json
import uuid
from datetime import datetime
from typing import List

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from db.database import get_db, row_to_dict, rows_to_list
from routers.auth import get_current_user
from services.ai import get_ai_adapter
from services.storage import storage
from models.schemas import MergeClustersRequest, LabelClusterRequest, FindMeResponse

router = APIRouter()


def _cluster_to_out(c: dict, cover_url: str = None) -> dict:
    return {
        "id": c["id"],
        "userId": c["user_id"],
        "label": c["label"],
        "isUser": bool(c["is_user"]),
        "photoCount": c["photo_count"],
        "coverPhotoId": c["cover_photo_id"],
        "coverPhotoUrl": cover_url,
        "createdAt": c["created_at"],
    }


@router.get("/clusters")
async def list_clusters(current_user: dict = Depends(get_current_user)):
    """Return all face clusters for the current user."""
    with get_db() as conn:
        clusters = conn.execute(
            "SELECT * FROM face_clusters WHERE user_id=? ORDER BY photo_count DESC",
            (current_user["id"],)
        ).fetchall()

    result = []
    for c in clusters:
        c_dict = row_to_dict(c)
        cover_url = None
        if c_dict.get("cover_photo_id"):
            with get_db() as conn:
                photo = conn.execute(
                    "SELECT thumbnail_url, storage_url FROM photos WHERE id=?",
                    (c_dict["cover_photo_id"],)
                ).fetchone()
            if photo:
                cover_url = photo["thumbnail_url"] or photo["storage_url"]
        result.append(_cluster_to_out(c_dict, cover_url))
    return {"clusters": result}


@router.get("/clusters/{cluster_id}/photos")
async def get_cluster_photos(
    cluster_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Return all photos belonging to a face cluster."""
    with get_db() as conn:
        cluster = conn.execute(
            "SELECT * FROM face_clusters WHERE id=? AND user_id=?",
            (cluster_id, current_user["id"])
        ).fetchone()
        if not cluster:
            raise HTTPException(status_code=404, detail="Cluster not found")

        # Photos store faceClusterIds as JSON array
        photos = conn.execute(
            "SELECT * FROM photos WHERE user_id=? AND face_cluster_ids LIKE ?",
            (current_user["id"], f"%{cluster_id}%")
        ).fetchall()

    return {"clusterId": cluster_id, "photos": rows_to_list(photos)}


@router.patch("/clusters/{cluster_id}/label")
async def label_cluster(
    cluster_id: str,
    req: LabelClusterRequest,
    current_user: dict = Depends(get_current_user),
):
    """Assign a name to a face cluster and optionally mark as the user themselves."""
    with get_db() as conn:
        result = conn.execute(
            "UPDATE face_clusters SET label=?, is_user=?, updated_at=? WHERE id=? AND user_id=?",
            (req.label, int(req.isUser), datetime.utcnow().isoformat(), cluster_id, current_user["id"])
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Cluster not found")

        if req.isUser:
            # Update all photos in this cluster to hasUser=True
            conn.execute(
                "UPDATE photos SET has_user=1, category='WITH_ME', updated_at=? WHERE user_id=? AND face_cluster_ids LIKE ?",
                (datetime.utcnow().isoformat(), current_user["id"], f"%{cluster_id}%")
            )
    return {"success": True}


@router.post("/clusters/merge")
async def merge_clusters(
    req: MergeClustersRequest,
    current_user: dict = Depends(get_current_user),
):
    """Merge multiple clusters into one target cluster."""
    now = datetime.utcnow().isoformat()
    with get_db() as conn:
        # Update all photos from source clusters to target
        for src_id in req.sourceClusterIds:
            if src_id == req.targetClusterId:
                continue
            photos = conn.execute(
                "SELECT id, face_cluster_ids FROM photos WHERE user_id=? AND face_cluster_ids LIKE ?",
                (current_user["id"], f"%{src_id}%")
            ).fetchall()
            for p in photos:
                ids = json.loads(p["face_cluster_ids"] or "[]")
                if src_id in ids:
                    ids.remove(src_id)
                if req.targetClusterId not in ids:
                    ids.append(req.targetClusterId)
                conn.execute(
                    "UPDATE photos SET face_cluster_ids=?, updated_at=? WHERE id=?",
                    (json.dumps(ids), now, p["id"])
                )
            # Delete source cluster
            conn.execute(
                "DELETE FROM face_clusters WHERE id=? AND user_id=?",
                (src_id, current_user["id"])
            )

        # Recalculate photo_count for target cluster
        count = conn.execute(
            "SELECT COUNT(*) as c FROM photos WHERE user_id=? AND face_cluster_ids LIKE ?",
            (current_user["id"], f"%{req.targetClusterId}%")
        ).fetchone()["c"]
        conn.execute(
            "UPDATE face_clusters SET photo_count=?, updated_at=? WHERE id=?",
            (count, now, req.targetClusterId)
        )
    return {"success": True, "targetClusterId": req.targetClusterId, "photoCount": count}


@router.post("/find-me", response_model=FindMeResponse)
async def find_me(
    files: List[UploadFile] = File(...),
    current_user: dict = Depends(get_current_user),
):
    """
    Upload 1-3 reference photos of yourself.
    App extracts embeddings and marks all matching photos as WITH_ME.
    """
    if not (1 <= len(files) <= 3):
        raise HTTPException(status_code=422, detail="Upload between 1 and 3 reference photos.")

    adapter = get_ai_adapter()
    user_id = current_user["id"]
    reference_embeddings = []

    for f in files:
        file_bytes = await f.read()
        # Upload reference photo
        url = await storage.upload(file_bytes, f.filename or "ref.jpg", folder=f"reference/{user_id}")

        # Extract embedding
        result = await adapter.analyze_image(file_bytes, filename=f.filename or "ref.jpg")
        if result.faces:
            emb = result.faces[0].embedding
        else:
            emb = await adapter.get_face_embedding(file_bytes, None)

        reference_embeddings.append(emb)

        # Save to DB
        ref_id = f"r_{uuid.uuid4().hex[:16]}"
        with get_db() as conn:
            conn.execute(
                "INSERT INTO reference_faces (id, user_id, storage_url, embedding, created_at) VALUES (?,?,?,?,?)",
                (ref_id, user_id, url, json.dumps(emb), datetime.utcnow().isoformat())
            )

    # Scan all user photos for face matches
    with get_db() as conn:
        face_photos = conn.execute(
            "SELECT id, metadata FROM photos WHERE user_id=? AND has_faces=1",
            (user_id,)
        ).fetchall()

    matched = 0
    now = datetime.utcnow().isoformat()
    for p in face_photos:
        meta = json.loads(p["metadata"] or "[]")
        if not isinstance(meta, list):
            continue
        for face_data in meta:
            emb = face_data.get("embedding", [])
            if not emb:
                continue
            is_match = await adapter.match_face(reference_embeddings, emb)
            if is_match:
                with get_db() as conn:
                    conn.execute(
                        "UPDATE photos SET has_user=1, category='WITH_ME', updated_at=? WHERE id=?",
                        (now, p["id"])
                    )
                matched += 1
                break

    # Create or update user cluster
    cluster_id = f"c_{uuid.uuid4().hex[:16]}"
    with get_db() as conn:
        existing = conn.execute(
            "SELECT id FROM face_clusters WHERE user_id=? AND is_user=1",
            (user_id,)
        ).fetchone()
        if not existing:
            conn.execute(
                "INSERT INTO face_clusters (id, user_id, label, is_user, photo_count, embedding, created_at, updated_at) VALUES (?,?,?,1,?,?,?,?)",
                (cluster_id, user_id, "Me", matched, json.dumps(reference_embeddings[0] if reference_embeddings else []), now, now)
            )
        else:
            cluster_id = existing["id"]
            conn.execute(
                "UPDATE face_clusters SET photo_count=?, updated_at=? WHERE id=?",
                (matched, now, cluster_id)
            )

    return FindMeResponse(matchedPhotos=matched, clusterId=cluster_id)
