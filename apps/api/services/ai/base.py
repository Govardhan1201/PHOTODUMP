"""
Abstract base class for AI adapters.
All AI operations go through this interface so real models can be plugged in
by swapping the adapter (AI_ADAPTER env var).
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import List, Optional, Tuple


@dataclass
class BoundingBox:
    x: int
    y: int
    w: int
    h: int


@dataclass
class FaceResult:
    bbox: BoundingBox
    confidence: float
    embedding: List[float] = field(default_factory=list)
    # cluster_id assigned later during clustering step
    cluster_id: Optional[str] = None


@dataclass
class SceneResult:
    """Classification result for a full image."""
    category: str           # WITH_ME | PEOPLE | NATURE | ITEMS | FOOD | VEHICLES | BUILDINGS | MIXED | UNCERTAIN
    confidence: float       # 0.0 – 1.0
    tags: List[str]         # descriptive tags e.g. ["outdoor", "beach", "sunset"]
    has_faces: bool
    face_count: int


@dataclass
class ImageAnalysisResult:
    faces: List[FaceResult]
    scene: SceneResult


class AIAdapter(ABC):
    """
    Abstract interface for all AI operations.
    Implementations: MockAdapter, DeepFaceAdapter, OpenAIAdapter
    """

    @abstractmethod
    async def analyze_image(self, image_bytes: bytes, filename: str = "") -> ImageAnalysisResult:
        """Full pipeline: face detection + scene classification in one call."""
        ...

    @abstractmethod
    async def get_face_embedding(self, image_bytes: bytes, bbox: BoundingBox) -> List[float]:
        """Extract a face embedding vector for a given bounding box."""
        ...

    @abstractmethod
    async def cluster_faces(
        self,
        embeddings: List[Tuple[str, List[float]]]  # (photo_id, embedding)
    ) -> List[List[str]]:
        """
        Group photo_ids by face similarity.
        Returns list of clusters, each cluster is a list of photo_ids.
        """
        ...

    @abstractmethod
    async def match_face(
        self,
        reference_embeddings: List[List[float]],
        candidate_embedding: List[float],
        threshold: float = 0.6,
    ) -> bool:
        """Returns True if candidate matches any reference face."""
        ...
