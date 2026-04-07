"""
Database layer — Supports SQLite (local) or PostgreSQL (Supabase/Render) seamlessly.
Automatically detected via DATABASE_URL.
"""

import os
import sqlite3
from contextlib import contextmanager

DATABASE_URL = os.getenv("DATABASE_URL", "file:./dev.db")
IS_POSTGRES = DATABASE_URL.startswith("postgres")

if IS_POSTGRES:
    import psycopg2
    import psycopg2.extras


class PostgresWrapper:
    """Wraps psycopg2 connection to mimic sqlite3 behavior so existing code doesn't break."""
    def __init__(self, conn):
        self.conn = conn

    def execute(self, sql: str, params=()):
        # Convert SQLite '?' placeholders to PostgreSQL '%s'
        pg_sql = sql.replace("?", "%s")
        cur = self.conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(pg_sql, params)
        return cur

    def executescript(self, sql: str):
        # Postgres supports multiple statements in standard execute
        pg_sql = sql.replace("datetime('now')", "CURRENT_TIMESTAMP")
        cur = self.conn.cursor()
        cur.execute(pg_sql)
        self.conn.commit()

    def commit(self):
        self.conn.commit()

    def rollback(self):
        self.conn.rollback()

    def close(self):
        self.conn.close()


def _get_connection():
    if IS_POSTGRES:
        conn = psycopg2.connect(DATABASE_URL)
        # We don't set row_factory here, we handle it in PostgresWrapper.execute
        return PostgresWrapper(conn)
    else:
        path = DATABASE_URL.replace("file:", "")
        conn = sqlite3.connect(path)
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
