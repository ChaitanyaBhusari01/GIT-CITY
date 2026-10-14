"""Repository indexing: Tree-sitter chunks -> embeddings -> Neon pgvector."""

from __future__ import annotations

import hashlib
import os
import re
import subprocess
from pathlib import Path
from typing import Any

from app.chunker import chunk_code
from app.embeddings import EMBEDDING_MODEL, embed_texts
from app.file_filter import IGNORED_DIRECTORIES, classify_file
from app.parser import parse_code
from app.vector_store import ensure_schema, replace_commit_chunks


MAX_FILE_BYTES = 1_000_000
MAX_EMBEDDING_CHARS = 12_000
FALLBACK_CHUNK_LINES = 100
FALLBACK_OVERLAP_LINES = 12


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
) -> dict[str, Any]:
    """Index the current Git revision of a local repository into Neon."""
    repo_root = Path(repo_path).expanduser().resolve()
    if not repo_root.is_dir():
        raise ValueError(f"Repository directory does not exist: {repo_root}")

    commit_sha = resolve_commit_sha(repo_root)
    resolved_repo_id = repository_id or resolve_repository_id(repo_root)

    chunks: list[dict[str, Any]] = []
    files_seen = 0
    files_skipped = 0
    file_errors: list[dict[str, str]] = []

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
                    chunks.extend(_split_oversized_chunk(chunk))

            except Exception as exc:
                files_skipped += 1
                if len(file_errors) < 30:
                    file_errors.append(
                        {
                            "file": str(source_path.relative_to(repo_root)),
                            "error": f"{type(exc).__name__}: {exc}",
                        }
                    )

    if not chunks:
        raise RuntimeError(
            "No source chunks were produced. Confirm the repository has "
            "supported source files and that Tree-sitter grammars are installed. "
            f"Files parsed: {files_seen}; skipped: {files_skipped}."
        )

    ensure_schema()

    embedding_inputs = [_embedding_input(chunk) for chunk in chunks]
    vectors = embed_texts(embedding_inputs)

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

    replace_commit_chunks(resolved_repo_id, commit_sha, rows)

    return {
        "repository_id": resolved_repo_id,
        "commit_sha": commit_sha,
        "files_parsed": files_seen,
        "files_skipped": files_skipped,
        "chunks_indexed": len(rows),
        "embedding_model": EMBEDDING_MODEL,
        "embedding_dimensions": len(vectors[0]),
        "file_errors": file_errors,
    }
