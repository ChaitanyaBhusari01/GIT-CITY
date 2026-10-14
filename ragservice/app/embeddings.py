"""OpenRouter embedding adapter for GitCity's language-independent RAG pipeline."""

from __future__ import annotations

import os
from typing import Sequence

import requests


OPENROUTER_BASE_URL = os.getenv(
    "OPENROUTER_BASE_URL",
    "https://openrouter.ai/api/v1",
).rstrip("/")
DEFAULT_EMBEDDING_MODEL = "openai/text-embedding-3-small"
EMBEDDING_MODEL = os.getenv(
    "GITCITY_EMBEDDING_MODEL",
    DEFAULT_EMBEDDING_MODEL,
)
EMBEDDING_DIMENSIONS = int(os.getenv("GITCITY_EMBEDDING_DIMENSIONS", "1536"))
DEFAULT_BATCH_SIZE = 32


def _api_key() -> str:
    key = os.getenv("OPENROUTER_API_KEY")
    if not key:
        raise RuntimeError(
            "OPENROUTER_API_KEY is missing. Add it to ragservice/.env "
            "to generate embeddings and run the security LLM."
        )
    return key


def embed_texts(
    texts: Sequence[str],
    *,
    model: str | None = None,
    batch_size: int = DEFAULT_BATCH_SIZE,
) -> list[list[float]]:
    """Embed text inputs in batches and preserve the input order."""
    inputs = list(texts)
    if not inputs:
        return []
    if batch_size < 1:
        raise ValueError("batch_size must be greater than zero.")
    if any(not isinstance(text, str) or not text.strip() for text in inputs):
        raise ValueError("Every embedding input must be a non-empty string.")

    api_key = _api_key()
    selected_model = model or EMBEDDING_MODEL
    vectors: list[list[float]] = []

    for offset in range(0, len(inputs), batch_size):
        batch = inputs[offset : offset + batch_size]
        response = requests.post(
            f"{OPENROUTER_BASE_URL}/embeddings",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://gitcity.app",
                "X-Title": "GitCity Security RAG",
            },
            json={
                "model": selected_model,
                "input": batch,
                "dimensions": EMBEDDING_DIMENSIONS,
            },
            timeout=90,
        )

        if not response.ok:
            try:
                detail = response.json().get("error", {}).get("message")
            except (ValueError, AttributeError):
                detail = response.text[:500]
            raise RuntimeError(
                f"Embedding request failed (HTTP {response.status_code}): "
                f"{detail or 'Unknown provider error'}"
            )

        payload = response.json()
        data = payload.get("data")
        if not isinstance(data, list) or len(data) != len(batch):
            raise RuntimeError(
                "Embedding provider returned an unexpected number of vectors."
            )

        data.sort(key=lambda item: item.get("index", 0))

        for item in data:
            vector = item.get("embedding")
            if not isinstance(vector, list):
                raise RuntimeError("Embedding provider returned an invalid vector.")
            if len(vector) != EMBEDDING_DIMENSIONS:
                raise RuntimeError(
                    f"Expected {EMBEDDING_DIMENSIONS}-dimensional embeddings, "
                    f"received {len(vector)}. Keep the model and database "
                    "dimensions aligned."
                )
            vectors.append([float(value) for value in vector])

    return vectors


def embed_text(text: str, *, model: str | None = None) -> list[float]:
    """Embed a single string."""
    return embed_texts([text], model=model)[0]
