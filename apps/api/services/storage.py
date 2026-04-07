"""
Storage service abstraction.
STORAGE_ADAPTER=local  → saves to LOCAL_UPLOAD_DIR on disk
STORAGE_ADAPTER=supabase → uploads to Supabase Storage bucket
STORAGE_ADAPTER=s3    → uploads to any S3-compatible bucket
"""

import os
import uuid
import aiofiles
from pathlib import Path
from typing import Optional


ADAPTER = os.getenv("STORAGE_ADAPTER", "local")
UPLOAD_DIR = Path(os.getenv("LOCAL_UPLOAD_DIR", "./uploads"))
API_BASE = os.getenv("NEXT_PUBLIC_API_URL", "http://localhost:8000")


class LocalStorageService:
    """Saves files to local disk. Served via FastAPI StaticFiles mount."""

    async def upload(
        self,
        file_bytes: bytes,
        filename: str,
        folder: str = "photos",
        content_type: str = "image/jpeg",
    ) -> str:
        dest_dir = UPLOAD_DIR / folder
        dest_dir.mkdir(parents=True, exist_ok=True)

        ext = Path(filename).suffix.lower() or ".jpg"
        unique_name = f"{uuid.uuid4().hex}{ext}"
        dest_path = dest_dir / unique_name

        async with aiofiles.open(dest_path, "wb") as f:
            await f.write(file_bytes)

        # Return a URL that the frontend can load
        return f"{API_BASE}/uploads/{folder}/{unique_name}"

    async def get_url(self, path: str) -> str:
        return path  # already a full URL for local storage

    async def delete(self, url: str) -> None:
        # Extract path from URL and delete file
        rel = url.replace(f"{API_BASE}/uploads/", "")
        full_path = UPLOAD_DIR / rel
        if full_path.exists():
            full_path.unlink()


class SupabaseStorageService:
    """Uploads to Supabase Storage. Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_KEY."""

    BUCKET = "photomind"

    def __init__(self):
        from supabase import create_client
        url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_KEY")
        if not url or not key:
            raise RuntimeError("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY required for Supabase storage")
        self.client = create_client(url, key)

    async def upload(self, file_bytes: bytes, filename: str, folder: str = "photos", content_type: str = "image/jpeg") -> str:
        ext = Path(filename).suffix.lower() or ".jpg"
        unique_name = f"{folder}/{uuid.uuid4().hex}{ext}"
        self.client.storage.from_(self.BUCKET).upload(unique_name, file_bytes, {"content-type": content_type})
        return self.client.storage.from_(self.BUCKET).get_public_url(unique_name)

    async def get_url(self, path: str) -> str:
        return path

    async def delete(self, url: str) -> None:
        # Extract path from public URL
        path = url.split(f"/{self.BUCKET}/")[1] if f"/{self.BUCKET}/" in url else url
        self.client.storage.from_(self.BUCKET).remove([path])


def get_storage_service():
    if ADAPTER == "supabase":
        return SupabaseStorageService()
    # Default: local disk
    return LocalStorageService()


# Singleton
storage = get_storage_service()
