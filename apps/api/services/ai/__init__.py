"""
AI adapter factory — returns the configured adapter based on AI_ADAPTER env var.
"""

import os
from services.ai.base import AIAdapter


def get_ai_adapter() -> AIAdapter:
    adapter_name = os.getenv("AI_ADAPTER", "mock").lower()

    if adapter_name == "mock":
        from services.ai.mock_adapter import MockAdapter
        return MockAdapter()

    elif adapter_name == "deepface":
        from services.ai.deepface_adapter import DeepFaceAdapter
        return DeepFaceAdapter()

    elif adapter_name == "openai":
        # Future: OpenAI GPT-4o Vision adapter
        raise NotImplementedError("OpenAI adapter not yet implemented. Set AI_ADAPTER=mock or deepface.")

    else:
        raise ValueError(f"Unknown AI_ADAPTER: {adapter_name}. Options: mock | deepface | openai")
