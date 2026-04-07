"""
Auth router — register, login, get current user.
Uses bcrypt passwords + JWT tokens.
"""

import os
import json
import uuid
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from passlib.context import CryptContext
from jose import jwt, JWTError

from db.database import get_db, init_db, row_to_dict
from models.schemas import RegisterRequest, LoginRequest, TokenResponse, UserOut

router = APIRouter()
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

SECRET = os.getenv("API_SECRET", "dev-secret-change-me")
ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 24 * 7  # 1 week


def hash_password(plain: str) -> str:
    return pwd_ctx.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_ctx.verify(plain, hashed)


def create_token(user_id: str) -> str:
    exp = datetime.utcnow() + timedelta(hours=TOKEN_EXPIRE_HOURS)
    return jwt.encode({"sub": user_id, "exp": exp}, SECRET, algorithm=ALGORITHM)


def decode_token(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, SECRET, algorithms=[ALGORITHM])
        return payload.get("sub")
    except JWTError:
        return None


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    user_id = decode_token(credentials.credentials)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    with get_db() as conn:
        row = conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=401, detail="User not found")
    return row_to_dict(row)


@router.post("/register", response_model=TokenResponse)
async def register(req: RegisterRequest):
    init_db()  # ensure tables exist on first run
    with get_db() as conn:
        existing = conn.execute("SELECT id FROM users WHERE email=?", (req.email,)).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="Email already registered")
        user_id = f"u_{uuid.uuid4().hex[:16]}"
        conn.execute(
            "INSERT INTO users (id, email, name, password) VALUES (?, ?, ?, ?)",
            (user_id, req.email, req.name, hash_password(req.password))
        )
    token = create_token(user_id)
    user = UserOut(id=user_id, email=req.email, name=req.name, image=None, driveConnected=False)
    return TokenResponse(access_token=token, user=user)


@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest):
    with get_db() as conn:
        row = conn.execute("SELECT * FROM users WHERE email=?", (req.email,)).fetchone()
    if not row or not verify_password(req.password, row["password"] or ""):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_token(row["id"])
    user = UserOut(
        id=row["id"], email=row["email"], name=row["name"],
        image=row["image"], driveConnected=bool(row["drive_connected"])
    )
    return TokenResponse(access_token=token, user=user)


@router.get("/me", response_model=UserOut)
async def me(current_user: dict = Depends(get_current_user)):
    return UserOut(
        id=current_user["id"],
        email=current_user["email"],
        name=current_user["name"],
        image=current_user["image"],
        driveConnected=bool(current_user["drive_connected"]),
    )
