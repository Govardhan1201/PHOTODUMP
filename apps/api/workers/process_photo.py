"""
Core image processing worker.
Called by the job queue for each photo in a session.
"""

import io
import json
import logging
import uuid
from datetime import datetime
from typing import Optional

from PIL import Image

from db.database import get_db
from services.ai import get_ai_adapter
from services.storage import storage

logger = logging.getLogger(__name__)


def _make_thumbnail(image_bytes: bytes, max_size: int = 400) -> bytes:
    """Resize image to thumbnail maintaining aspect ratio."""
    img = Image.open(io.BytesIO(image_bytes))
    img.thumbnail((max_size, max_size), Image.LANCZOS)
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=80)
    return buf.getvalue()


def _get_image_dimensions(image_bytes: bytes):
    img = Image.open(io.BytesIO(image_bytes))
    return img.width, img.height


async def process_photo_job(
    job_id: str,
    photo_id: str,
    session_id: str,
    file_bytes: bytes,
    filename: str,
    source_type: str,
    user_id: str,
    drive_file_id: Optional[str] = None,
):
    """
    Full pipeline for a single photo:
    1. Mark job as PROCESSING
    2. Generate thumbnail
    3. Run AI analysis (face detection + scene classification)
    4. Determine category
    5. Store results in DB
    6. Mark job as DONE
    """
    adapter = get_ai_adapter()

    # 1. Mark job as PROCESSING
    with get_db() as conn:
        conn.execute(
            "UPDATE jobs SET status='PROCESSING', attempt=attempt+1, updated_at=? WHERE id=?",
            (datetime.utcnow().isoformat(), job_id)
        )

    try:
        # 2. Generate thumbnail & get dimensions
        thumb_bytes = _make_thumbnail(file_bytes)
        width, height = _get_image_dimensions(file_bytes)

        # 3. Save thumbnail
        thumb_url = await storage.upload(
            thumb_bytes, filename, folder="thumbnails", content_type="image/jpeg"
        )

        # 4. AI analysis
        logger.info("🤖 Analyzing photo %s (%s)", filename, source_type)
        analysis = await adapter.analyze_image(file_bytes, filename=filename)

        # 5. Determine category
        category = analysis.scene.category
        has_faces = analysis.scene.has_faces
        has_user = category == "WITH_ME"  # refined by find-me flow later

        # Build tags JSON
        tags = json.dumps(analysis.scene.tags)

        # Build face embeddings JSON (stored for clustering)
        face_embeddings = json.dumps([
            {
                "embedding": face.embedding,
                "bbox": [face.bbox.x, face.bbox.y, face.bbox.w, face.bbox.h],
                "confidence": face.confidence,
            }
            for face in analysis.faces
        ])

        # 6. Update photo record with results
        with get_db() as conn:
            conn.execute(
                """UPDATE photos SET
                    category=?, confidence=?, has_faces=?, has_user=?,
                    thumbnail_url=?, tags=?, metadata=?,
                    width=?, height=?, updated_at=?
                   WHERE id=?""",
                (
                    category,
                    analysis.scene.confidence,
                    int(has_faces),
                    int(has_user),
                    thumb_url,
                    tags,
                    face_embeddings,  # stored in metadata for later clustering
                    width,
                    height,
                    datetime.utcnow().isoformat(),
                    photo_id,
                )
            )
            # Mark job DONE
            conn.execute(
                "UPDATE jobs SET status='DONE', updated_at=? WHERE id=?",
                (datetime.utcnow().isoformat(), job_id)
            )
            # Increment session processed count
            conn.execute(
                "UPDATE sessions SET processed_photos=processed_photos+1, updated_at=? WHERE id=?",
                (datetime.utcnow().isoformat(), session_id)
            )
            # Check if session is complete
            row = conn.execute(
                "SELECT total_photos, processed_photos, failed_photos FROM sessions WHERE id=?",
                (session_id,)
            ).fetchone()
            if row and (row["processed_photos"] + row["failed_photos"]) >= row["total_photos"]:
                conn.execute(
                    "UPDATE sessions SET status='COMPLETED', updated_at=? WHERE id=?",
                    (datetime.utcnow().isoformat(), session_id)
                )
                logger.info("✅ Session %s COMPLETED", session_id)

    except Exception as e:
        logger.error("❌ Failed to process photo %s: %s", filename, e, exc_info=True)
        with get_db() as conn:
            conn.execute(
                "UPDATE jobs SET status='FAILED', error_msg=?, updated_at=? WHERE id=?",
                (str(e), datetime.utcnow().isoformat(), job_id)
            )
            conn.execute(
                "UPDATE sessions SET failed_photos=failed_photos+1, updated_at=? WHERE id=?",
                (datetime.utcnow().isoformat(), session_id)
            )
