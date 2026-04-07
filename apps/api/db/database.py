"""
Database layer — SQLite via raw sqlite3 for zero-dependency local dev.
In production, swap this for Prisma Client or SQLAlchemy with PostgreSQL.
"""

import sqlite3
import os
import json
from contextlib import contextmanager
from datetime import datetime

DATABASE_PATH = os.getenv("DATABASE_URL", "file:./dev.db").replace("file:", "")

def _get_connection():
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn

@contextmanager
def get_db():
    conn = _get_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    """Create tables if they don't exist."""
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                name TEXT,
                image TEXT,
                password TEXT,
                drive_tokens TEXT,
                drive_connected INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                source_type TEXT NOT NULL,
                drive_folder_id TEXT,
                drive_folder_name TEXT,
                status TEXT DEFAULT 'QUEUED',
                total_photos INTEGER DEFAULT 0,
                processed_photos INTEGER DEFAULT 0,
                failed_photos INTEGER DEFAULT 0,
                name TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS photos (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                user_id TEXT NOT NULL,
                filename TEXT NOT NULL,
                original_name TEXT NOT NULL,
                storage_url TEXT NOT NULL,
                thumbnail_url TEXT,
                category TEXT DEFAULT 'UNCERTAIN',
                confidence REAL DEFAULT 0,
                has_faces INTEGER DEFAULT 0,
                has_user INTEGER DEFAULT 0,
                face_cluster_ids TEXT DEFAULT '[]',
                tags TEXT DEFAULT '[]',
                metadata TEXT,
                review_flag INTEGER DEFAULT 0,
                source_type TEXT NOT NULL,
                drive_file_id TEXT,
                mime_type TEXT,
                file_size INTEGER,
                width INTEGER,
                height INTEGER,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS face_clusters (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                label TEXT,
                is_user INTEGER DEFAULT 0,
                photo_count INTEGER DEFAULT 0,
                cover_photo_id TEXT,
                embedding TEXT DEFAULT '[]',
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS reference_faces (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                storage_url TEXT NOT NULL,
                embedding TEXT DEFAULT '[]',
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                photo_id TEXT,
                status TEXT DEFAULT 'QUEUED',
                error_msg TEXT,
                attempt INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_photos_user ON photos(user_id);
            CREATE INDEX IF NOT EXISTS idx_photos_session ON photos(session_id);
            CREATE INDEX IF NOT EXISTS idx_photos_category ON photos(category);
            CREATE INDEX IF NOT EXISTS idx_jobs_session ON jobs(session_id);
        """)
    print("✅ Database initialized")


def row_to_dict(row):
    if row is None:
        return None
    return dict(row)


def rows_to_list(rows):
    return [dict(r) for r in rows]
