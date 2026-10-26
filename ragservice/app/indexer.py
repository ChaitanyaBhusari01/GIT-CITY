"""Repository indexing: Tree-sitter chunks -> embeddings -> Neon pgvector."""

from __future__ import annotations

import hashlib
import logging
import os
import re
import subprocess
import time
from pathlib import Path
from typing import Any

from app.chunker import chunk_code
from app.embeddings import EMBEDDING_MODEL, embed_texts
from app.file_filter import IGNORED_DIRECTORIES, classify_file
from app.parser import parse_code
from app.vector_store import ensure_schema, replace_commit_chunks


logger = logging.getLogger(__name__)

MAX_FILE_BYTES = 1_000_000
MAX_EMBEDDING_CHARS = 12_000
FALLBACK_CHUNK_LINES = 100
FALLBACK_OVERLAP_LINES = 12
DEFAULT_MAX_INDEXED_CHUNKS = 10_000
MAX_INDEXED_CHUNKS_LIMIT = 50_000


def _configured_chunk_limit() -> int:
    try:
        configured = int(os.getenv("GITCITY_MAX_INDEXED_CHUNKS", str(DEFAULT_MAX_INDEXED_CHUNKS)))
    except (TypeError, ValueError):
        configured = DEFAULT_MAX_INDEXED_CHUNKS
    return max(1, min(configured, MAX_INDEXED_CHUNKS_LIMIT))


MAX_INDEXED_CHUNKS = _configured_chunk_limit()


def _git_output(repo_root: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", "-C", str(repo_root), *args],
        capture_output=True,
        text=True,
        check=True,
        timeout=15,
    )
    return result.stdout.strip()


def resolve_repository_id(repo_root: Path) -> str:
    """Prefer a stable remote identity; fall back to the directory name."""
    try:
        remote = _git_output(repo_root, "config", "--get", "remote.origin.url")
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
        return repo_root.name

    remote = remote.removesuffix(".git")
    match = re.search(r"(?:github\.com[:/])([^/]+/[^/]+)$", remote, re.IGNORECASE)
    return match.group(1).lower() if match else remote


def resolve_commit_sha(repo_root: Path) -> str:
    try:
        sha = _git_output(repo_root, "rev-parse", "HEAD")
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        raise ValueError(
            f"{repo_root} must be a Git repository with at least one commit."
        ) from exc

    if not re.fullmatch(r"[0-9a-fA-F]{40,64}", sha):
        raise ValueError("Could not resolve a valid Git commit SHA.")
    return sha.lower()


def _split_oversized_chunk(chunk: dict[str, Any]) -> list[dict[str, Any]]:
    """Keep embedding inputs bounded while preserving exact line ranges."""
    code = chunk["code"]
    if len(code) <= MAX_EMBEDDING_CHARS:
        return [chunk]

    lines = code.splitlines()
    results = []
    start = 0

    while start < len(lines):
        end = start
        char_count = 0
        while end < len(lines) and end - start < FALLBACK_CHUNK_LINES:
            line_size = len(lines[end]) + 1
            if end > start and char_count + line_size > MAX_EMBEDDING_CHARS:
                break
            char_count += line_size
            end += 1

        if end == start:
            end += 1

        piece = dict(chunk)
        piece["type"] = "line_segment"
        piece["start_line"] = chunk["start_line"] + start
        piece["end_line"] = chunk["start_line"] + end - 1
        piece["code"] = "\n".join(lines[start:end])
        results.append(piece)

        if end >= len(lines):
            break
        start = max(start + 1, end - FALLBACK_OVERLAP_LINES)

    return results


def _embedding_input(chunk: dict[str, Any]) -> str:
    symbol = chunk.get("name") or "unnamed"
    return (
        f"Repository file: {chunk['file_path']}\n"
        f"Language: {chunk['language']}\n"
        f"Code unit: {chunk['type']}\n"
        f"Symbol: {symbol}\n"
        f"Lines: {chunk['start_line']}-{chunk['end_line']}\n"
        "Source code:\n"
        f"{chunk['code']}"
    )


def _chunk_hash(chunk: dict[str, Any]) -> str:
    identity = (
        f"{chunk['file_path']}\0{chunk['start_line']}\0"
        f"{chunk['end_line']}\0{chunk['code']}"
    )
    return hashlib.sha256(identity.encode("utf-8")).hexdigest()


def index_repository(
    repo_path: str | Path,
    *,
    repository_id: str | None = None,
    commit_sha: str | None = None,
) -> dict[str, Any]:
    """Index a local source snapshot under its exact Git revision in Neon.

    When commit_sha is supplied, repo_path may be a verified source archive
    rather than a Git checkout. This lets security analysis index the exact
    revision CodeQL scanned without running repository code or requiring .git.
    """
    repo_root = Path(repo_path).expanduser().resolve()
    if not repo_root.is_dir():
        raise ValueError(f"Repository directory does not exist: {repo_root}")

    resolved_commit_sha = commit_sha or resolve_commit_sha(repo_root)
    if not re.fullmatch(r"[0-9a-fA-F]{40,64}", resolved_commit_sha):
        raise ValueError("commit_sha must be a full Git commit SHA.")
    commit_sha = resolved_commit_sha.lower()
    resolved_repo_id = repository_id or resolve_repository_id(repo_root)

    chunks: list[dict[str, Any]] = []
    chunks_truncated = False
    chunks_discarded = 0
    files_seen = 0
    files_skipped = 0
    file_errors: list[dict[str, str]] = []

    walk_started = time.perf_counter()
    logger.info(
        "[indexer] START source_walk repo=%s commit=%s max_chunks=%d",
        resolved_repo_id, commit_sha, MAX_INDEXED_CHUNKS,
    )
    for current_root, directory_names, file_names in os.walk(
        repo_root, topdown=True, followlinks=False
    ):
        directory_names[:] = [
            name for name in directory_names
            if name not in IGNORED_DIRECTORIES
        ]
        current_path = Path(current_root)

        for file_name in file_names:
            source_path = current_path / file_name
            try:
                relative_path = source_path.relative_to(repo_root).as_posix()
                classification = classify_file(relative_path)
                if classification["action"] != "parse":
                    files_skipped += 1
                    continue

                if source_path.is_symlink() or not source_path.is_file():
                    files_skipped += 1
                    continue

                size = source_path.stat().st_size
                if size > MAX_FILE_BYTES:
                    files_skipped += 1
                    continue

                code = source_path.read_text(
                    encoding="utf-8",
                    errors="replace",
                )
                if not code.strip():
                    files_skipped += 1
                    continue

                files_seen += 1
                if files_seen % 50 == 0:
                    logger.info(
                        "[indexer] source_walk_progress files_parsed=%d chunks_collected=%d duration=%.2fs",
                        files_seen, len(chunks), time.perf_counter() - walk_started,
                    )
                language = classification["language"]
                tree = parse_code(code, language)
                file_chunks = chunk_code(
                    tree,
                    code,
                    relative_path,
                    language,
                )

                for original_chunk in file_chunks:
                    chunk = dict(original_chunk)
                    chunk["repository_id"] = resolved_repo_id
                    chunk["commit_sha"] = commit_sha
                    split_chunks = _split_oversized_chunk(chunk)
                    available_slots = MAX_INDEXED_CHUNKS - len(chunks)
                    if available_slots <= 0:
                        chunks_truncated = True
                        chunks_discarded += len(split_chunks)
                        continue

                    chunks.extend(split_chunks[:available_slots])
                    if len(split_chunks) > available_slots:
                        chunks_truncated = True
                        chunks_discarded += len(split_chunks) - available_slots

            except Exception as exc:
                files_skipped += 1
                if len(file_errors) < 30:
                    file_errors.append(
                        {
                            "file": str(source_path.relative_to(repo_root)),
                            "error": f"{type(exc).__name__}: {exc}",
                        }
                    )

    logger.info(
        "[indexer] DONE source_walk files_parsed=%d files_skipped=%d chunks_collected=%d chunks_discarded=%d truncated=%s duration=%.2fs",
        files_seen, files_skipped, len(chunks), chunks_discarded,
        chunks_truncated, time.perf_counter() - walk_started,
    )

    if not chunks:
        raise RuntimeError(
            "No source chunks were produced. Confirm the repository has "
            "supported source files and that Tree-sitter grammars are installed. "
            f"Files parsed: {files_seen}; skipped: {files_skipped}."
        )

    schema_started = time.perf_counter()
    logger.info("[indexer] START ensure_schema")
    try:
        ensure_schema()
    except Exception:
        logger.exception("[indexer] ensure_schema failed")
        raise
    logger.info(
        "[indexer] DONE ensure_schema duration=%.2fs",
        time.perf_counter() - schema_started,
    )

    embedding_inputs = [_embedding_input(chunk) for chunk in chunks]
    embedding_started = time.perf_counter()
    logger.info(
        "[indexer] START embeddings chunks=%d batches_of=%d model=%s",
        len(embedding_inputs), 32, EMBEDDING_MODEL,
    )
    try:
        vectors = embed_texts(embedding_inputs)
    except Exception:
        logger.exception(
            "[indexer] embeddings failed after %.2fs for %d chunks",
            time.perf_counter() - embedding_started, len(embedding_inputs),
        )
        raise
    logger.info(
        "[indexer] DONE embeddings chunks=%d duration=%.2fs",
        len(vectors), time.perf_counter() - embedding_started,
    )

    if len(vectors) != len(chunks):
        raise RuntimeError("Embedding count did not match the source chunk count.")

    rows = []
    for chunk, vector in zip(chunks, vectors):
        rows.append(
            {
                "chunk_hash": _chunk_hash(chunk),
                "file_path": chunk["file_path"],
                "language": chunk["language"],
                "symbol_type": chunk.get("type"),
                "symbol_name": chunk.get("name"),
                "start_line": chunk["start_line"],
                "end_line": chunk["end_line"],
                "code": chunk["code"],
                "embedding_model": EMBEDDING_MODEL,
                "embedding": vector,
                "metadata": {
                    "repository_id": resolved_repo_id,
                    "commit_sha": commit_sha,
                    "relative_path": chunk["file_path"],
                    "chunk_type": chunk.get("type"),
                },
            }
        )

    persist_started = time.perf_counter()
    logger.info(
        "[indexer] START vector_persistence rows=%d repo=%s commit=%s",
        len(rows), resolved_repo_id, commit_sha,
    )
    try:
        replace_commit_chunks(resolved_repo_id, commit_sha, rows)
    except Exception:
        logger.exception(
            "[indexer] vector_persistence failed after %.2fs rows=%d",
            time.perf_counter() - persist_started, len(rows),
        )
        raise
    logger.info(
        "[indexer] DONE vector_persistence rows=%d duration=%.2fs",
        len(rows), time.perf_counter() - persist_started,
    )

    return {
        "repository_id": resolved_repo_id,
        "commit_sha": commit_sha,
        "files_parsed": files_seen,
        "files_skipped": files_skipped,
        "chunks_indexed": len(rows),
        "chunks_truncated": chunks_truncated,
        "chunks_discarded": chunks_discarded,
        "max_indexed_chunks": MAX_INDEXED_CHUNKS,
        "embedding_model": EMBEDDING_MODEL,
        "embedding_dimensions": len(vectors[0]),
        "file_errors": file_errors,
    }
