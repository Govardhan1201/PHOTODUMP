"""
Pydantic schemas used across the API.
"""

from __future__ import annotations
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


# ─── Enums ───────────────────────────────────────────────────────────────────

class SourceType(str, Enum):
    LOCAL_FOLDER = "LOCAL_FOLDER"
    LOCAL_FILES  = "LOCAL_FILES"
    GOOGLE_DRIVE = "GOOGLE_DRIVE"


class SessionStatus(str, Enum):
    QUEUED     = "QUEUED"
    PROCESSING = "PROCESSING"
    COMPLETED  = "COMPLETED"
    FAILED     = "FAILED"


class Category(str, Enum):
    WITH_ME   = "WITH_ME"
    PEOPLE    = "PEOPLE"
    NATURE    = "NATURE"
    ITEMS     = "ITEMS"
    FOOD      = "FOOD"
    VEHICLES  = "VEHICLES"
    BUILDINGS = "BUILDINGS"
    MIXED     = "MIXED"
    UNCERTAIN = "UNCERTAIN"


class JobStatus(str, Enum):
    QUEUED     = "QUEUED"
    PROCESSING = "PROCESSING"
    DONE       = "DONE"
    FAILED     = "FAILED"


# ─── Auth ────────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: EmailStr
    name: str
    password: str = Field(min_length=8)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class UserOut(BaseModel):
    id: str
    email: str
    name: Optional[str]
    image: Optional[str]
    driveConnected: bool

    class Config:
        from_attributes = True


# ─── Sessions ────────────────────────────────────────────────────────────────

class SessionOut(BaseModel):
    id: str
    userId: str
    sourceType: str
    driveFolderId: Optional[str]
    driveFolderName: Optional[str]
    status: str
    totalPhotos: int
    processedPhotos: int
    failedPhotos: int
    name: Optional[str]
    createdAt: datetime

    class Config:
        from_attributes = True


class SessionProgress(BaseModel):
    sessionId: str
    status: str
    totalPhotos: int
    processedPhotos: int
    failedPhotos: int
    percent: float
    jobs: List[JobOut] = []


# ─── Jobs ────────────────────────────────────────────────────────────────────

class JobOut(BaseModel):
    id: str
    sessionId: str
    photoId: Optional[str]
    status: str
    errorMsg: Optional[str]

    class Config:
        from_attributes = True


# ─── Photos ──────────────────────────────────────────────────────────────────

class PhotoOut(BaseModel):
    id: str
    sessionId: str
    userId: str
    filename: str
    originalName: str
    storageUrl: str
    thumbnailUrl: Optional[str]
    category: str
    confidence: float
    hasFaces: bool
    hasUser: bool
    faceClusterIds: List[str] = []
    tags: List[str] = []
    reviewFlag: bool
    width: Optional[int]
    height: Optional[int]
    fileSize: Optional[int]
    createdAt: datetime

    class Config:
        from_attributes = True


class PhotoListResponse(BaseModel):
    photos: List[PhotoOut]
    total: int
    page: int
    pageSize: int


class MoveCategoryRequest(BaseModel):
    category: Category


class PhotoFilterParams(BaseModel):
    category: Optional[Category] = None
    reviewFlag: Optional[bool] = None
    hasFaces: Optional[bool] = None
    hasUser: Optional[bool] = None
    search: Optional[str] = None
    page: int = 1
    pageSize: int = 40


# ─── People / Face Clusters ───────────────────────────────────────────────────

class FaceClusterOut(BaseModel):
    id: str
    userId: str
    label: Optional[str]
    isUser: bool
    photoCount: int
    coverPhotoId: Optional[str]
    coverPhotoUrl: Optional[str]
    createdAt: datetime

    class Config:
        from_attributes = True


class MergeClustersRequest(BaseModel):
    sourceClusterIds: List[str]
    targetClusterId: str


class LabelClusterRequest(BaseModel):
    label: str
    isUser: bool = False


class FindMeResponse(BaseModel):
    matchedPhotos: int
    clusterId: Optional[str]


# ─── Drive ───────────────────────────────────────────────────────────────────

class DriveAuthUrlResponse(BaseModel):
    authUrl: str


class DriveFolderItem(BaseModel):
    id: str
    name: str
    mimeType: str
    itemCount: Optional[int]


class DriveScanRequest(BaseModel):
    folderId: str
    folderName: str


class DriveScanResponse(BaseModel):
    sessionId: str
    totalFiles: int
    message: str
