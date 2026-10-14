"""OpenRouter chat-completion adapter for security reasoning."""

from __future__ import annotations

import os

import requests


OPENROUTER_BASE_URL = os.getenv(
    "OPENROUTER_BASE_URL",
    "https://openrouter.ai/api/v1",
).rstrip("/")
DEFAULT_LLM_MODEL = "anthropic/claude-3-haiku"
LLM_MODEL = os.getenv("GITCITY_LLM_MODEL", DEFAULT_LLM_MODEL)


def generate_chat_completion(
    messages: list[dict[str, str]],
    *,
    model: str | None = None,
    max_tokens: int = 1600,
    temperature: float = 0.2,
) -> str:
    """Generate a completion using the configured OpenRouter chat model."""
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise RuntimeError(
            "OPENROUTER_API_KEY is missing. Add it to ragservice/.env "
            "to enable embeddings and LLM analysis."
        )

    response = requests.post(
        f"{OPENROUTER_BASE_URL}/chat/completions",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://gitcity.app",
            "X-Title": "GitCity Security RAG",
        },
        json={
            "model": model or LLM_MODEL,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        },
        timeout=90,
    )

    if not response.ok:
        try:
            detail = response.json().get("error", {}).get("message")
        except (ValueError, AttributeError):
            detail = response.text[:500]
        raise RuntimeError(
            f"LLM request failed (HTTP {response.status_code}): "
            f"{detail or 'Unknown provider error'}"
        )

    payload = response.json()
    choices = payload.get("choices")
    if not choices:
        raise RuntimeError("LLM provider returned no completion choices.")

    message = choices[0].get("message", {})
    content = message.get("content")
    if isinstance(content, str) and content.strip():
        return content.strip()

    raise RuntimeError("LLM provider returned an empty or unsupported response.")
