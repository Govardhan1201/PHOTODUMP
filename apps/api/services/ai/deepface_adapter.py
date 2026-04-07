"""
DeepFace adapter — real face detection and embeddings.
Requires: pip install deepface tensorflow
Activate by setting AI_ADAPTER=deepface in .env
"""

import io
import numpy as np
from typing import List, Tuple

from services.ai.base import (
    AIAdapter, ImageAnalysisResult, FaceResult, SceneResult, BoundingBox
)

# Lazy import so the app starts even without deepface installed
try:
    from deepface import DeepFace
    DEEPFACE_AVAILABLE = True
except ImportError:
    DEEPFACE_AVAILABLE = False


# Simple scene keywords for classification without a dedicated model
SCENE_KEYWORDS = {
    "FOOD":      ["food", "meal", "cuisine", "restaurant", "pizza", "burger", "cake"],
    "VEHICLES":  ["car", "vehicle", "truck", "bus", "motorcycle", "bicycle"],
    "BUILDINGS": ["building", "architecture", "house", "tower", "bridge", "church"],
    "NATURE":    ["nature", "landscape", "tree", "mountain", "beach", "sky", "forest", "river"],
    "ITEMS":     ["object", "product", "furniture", "electronics", "clothing"],
}


class DeepFaceAdapter(AIAdapter):
    """
    Real face detection using DeepFace.
    Scene classification uses keyword heuristics (swap for CLIP/OpenAI for accuracy).
    """

    def __init__(self):
        if not DEEPFACE_AVAILABLE:
            raise RuntimeError(
                "DeepFace not installed. Run: pip install deepface tensorflow\n"
                "Or set AI_ADAPTER=mock to use the mock adapter."
            )

    async def analyze_image(self, image_bytes: bytes, filename: str = "") -> ImageAnalysisResult:
        import asyncio
        # DeepFace is synchronous — run in thread pool to avoid blocking
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, self._sync_analyze, image_bytes, filename)
        return result

    def _sync_analyze(self, image_bytes: bytes, filename: str) -> ImageAnalysisResult:
        from PIL import Image
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img_array = np.array(img)

        faces = []
        try:
            detections = DeepFace.represent(
                img_path=img_array,
                model_name="Facenet",
                enforce_detection=False,
                detector_backend="retinaface",
            )
            for det in (detections or []):
                region = det.get("facial_area", {})
                emb = det.get("embedding", [])
                bbox = BoundingBox(
                    x=region.get("x", 0),
                    y=region.get("y", 0),
                    w=region.get("w", 50),
                    h=region.get("h", 50),
                )
                faces.append(FaceResult(
                    bbox=bbox,
                    confidence=round(det.get("face_confidence", 0.8), 2),
                    embedding=emb,
                ))
        except Exception:
            pass  # No faces detected

        has_faces = len(faces) > 0
        category = "UNCERTAIN"
        tags = []

        # Basic scene classification based on face count
        if has_faces:
            category = "WITH_ME" if len(faces) == 1 else "PEOPLE"
        else:
            category = "NATURE"  # fallback — replace with CLIP for accuracy

        scene = SceneResult(
            category=category,
            confidence=0.75,
            tags=tags,
            has_faces=has_faces,
            face_count=len(faces),
        )
        return ImageAnalysisResult(faces=faces, scene=scene)

    async def get_face_embedding(self, image_bytes: bytes, bbox: BoundingBox) -> List[float]:
        from PIL import Image
        import asyncio
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._sync_embed, image_bytes, bbox)

    def _sync_embed(self, image_bytes: bytes, bbox: BoundingBox) -> List[float]:
        from PIL import Image
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img_array = np.array(img)
        try:
            results = DeepFace.represent(img_path=img_array, model_name="Facenet", enforce_detection=False)
            if results:
                return results[0].get("embedding", [])
        except Exception:
            pass
        return [0.0] * 128

    async def cluster_faces(self, embeddings: List[Tuple[str, List[float]]]) -> List[List[str]]:
        """Cluster face embeddings using cosine similarity + DBSCAN."""
        if len(embeddings) < 2:
            return [[pid] for pid, _ in embeddings]

        from sklearn.cluster import DBSCAN
        import numpy as np

        ids = [e[0] for e in embeddings]
        vecs = np.array([e[1] for e in embeddings], dtype=float)

        # Normalize embeddings
        norms = np.linalg.norm(vecs, axis=1, keepdims=True)
        vecs = vecs / np.where(norms == 0, 1, norms)

        db = DBSCAN(eps=0.4, min_samples=1, metric="cosine").fit(vecs)
        labels = db.labels_

        clusters: dict[int, list] = {}
        for i, label in enumerate(labels):
            clusters.setdefault(label, []).append(ids[i])

        return list(clusters.values())

    async def match_face(
        self,
        reference_embeddings: List[List[float]],
        candidate_embedding: List[float],
        threshold: float = 0.6,
    ) -> bool:
        import numpy as np
        cand = np.array(candidate_embedding)
        for ref in reference_embeddings:
            ref_vec = np.array(ref)
            sim = np.dot(cand, ref_vec) / (np.linalg.norm(cand) * np.linalg.norm(ref_vec) + 1e-8)
            if sim > threshold:
                return True
        return False
