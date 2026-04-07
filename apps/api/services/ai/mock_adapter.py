"""
Mock AI adapter — returns realistic but randomly generated results.
Zero external dependencies. Perfect for local dev and UI testing.
Swap to DeepFaceAdapter or OpenAIAdapter by setting AI_ADAPTER env var.
"""

import random
import hashlib
from typing import List, Tuple

from services.ai.base import (
    AIAdapter, ImageAnalysisResult, FaceResult, SceneResult, BoundingBox
)

# Deterministic seed: same image filename → same result every run
def _seed_from_filename(filename: str) -> int:
    return int(hashlib.md5(filename.encode()).hexdigest(), 16) % (2**31)


CATEGORIES = ["WITH_ME", "PEOPLE", "NATURE", "ITEMS", "FOOD", "VEHICLES", "BUILDINGS", "MIXED", "UNCERTAIN"]

CATEGORY_TAGS = {
    "WITH_ME":    ["selfie", "portrait", "friends", "smile"],
    "PEOPLE":     ["group", "portrait", "crowd", "candid"],
    "NATURE":     ["outdoor", "landscape", "trees", "sky", "mountains", "beach"],
    "ITEMS":      ["object", "product", "still-life", "interior"],
    "FOOD":       ["meal", "restaurant", "cooking", "dessert"],
    "VEHICLES":   ["car", "street", "transport", "road"],
    "BUILDINGS":  ["architecture", "city", "urban", "travel"],
    "MIXED":      ["indoor", "outdoor", "varied"],
    "UNCERTAIN":  ["blurry", "unclear"],
}


class MockAdapter(AIAdapter):
    """
    Fully deterministic mock adapter.
    - Seeded by filename so repeated analysis gives same results.
    - 30% photos have faces, 15% have the user present.
    - Categories weighted toward Nature/People/With_Me for interesting demos.
    """

    async def analyze_image(self, image_bytes: bytes, filename: str = "") -> ImageAnalysisResult:
        rng = random.Random(_seed_from_filename(filename))

        # Weighted category distribution for realistic demos
        weights = [10, 15, 20, 10, 8, 7, 12, 8, 10]  # matches CATEGORIES order
        category = rng.choices(CATEGORIES, weights=weights, k=1)[0]

        has_faces = category in ("WITH_ME", "PEOPLE") or (
            category == "MIXED" and rng.random() < 0.4
        )
        face_count = rng.randint(1, 4) if has_faces else 0
        has_user = category == "WITH_ME" or (has_faces and rng.random() < 0.2)

        faces = []
        for _ in range(face_count):
            x = rng.randint(50, 300)
            y = rng.randint(50, 200)
            w = rng.randint(60, 120)
            h = rng.randint(60, 120)
            emb = [rng.uniform(-1, 1) for _ in range(128)]
            faces.append(FaceResult(
                bbox=BoundingBox(x, y, w, h),
                confidence=round(rng.uniform(0.75, 0.99), 2),
                embedding=emb,
            ))

        confidence = round(rng.uniform(0.72, 0.98), 2)
        tags = rng.sample(CATEGORY_TAGS.get(category, []), k=min(3, len(CATEGORY_TAGS.get(category, []))))

        scene = SceneResult(
            category=category,
            confidence=confidence,
            tags=tags,
            has_faces=has_faces,
            face_count=face_count,
        )

        return ImageAnalysisResult(faces=faces, scene=scene)

    async def get_face_embedding(self, image_bytes: bytes, bbox: BoundingBox) -> List[float]:
        rng = random.Random(bbox.x + bbox.y * 1000)
        return [rng.uniform(-1, 1) for _ in range(128)]

    async def cluster_faces(
        self,
        embeddings: List[Tuple[str, List[float]]]
    ) -> List[List[str]]:
        """Simple mock clustering: group by every 3 photos."""
        if not embeddings:
            return []
        clusters = []
        chunk = []
        for i, (photo_id, _) in enumerate(embeddings):
            chunk.append(photo_id)
            if len(chunk) == 3:
                clusters.append(chunk)
                chunk = []
        if chunk:
            clusters.append(chunk)
        return clusters

    async def match_face(
        self,
        reference_embeddings: List[List[float]],
        candidate_embedding: List[float],
        threshold: float = 0.6,
    ) -> bool:
        """Mock: randomly match ~40% of the time."""
        return random.random() < 0.4
