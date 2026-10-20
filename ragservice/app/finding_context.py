"""Attach exact source and AST context to normalized SARIF findings."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from app.anchor_mapper import (
    extract_location_snippet,
    find_anchor_context,
)
from app.file_filter import classify_file
from app.language_profiles import LANGUAGE_PROFILES
from app.parser import parse_code


def enrich_finding_with_source(
    finding: dict[str, Any],
    repo_root: str | Path,
) -> dict[str, Any]:
    """Enrich one parsed SARIF finding with source and AST context.

    The input finding is not mutated. Missing source or AST context is
    reported explicitly rather than fabricated.
    """
    if not isinstance(finding, dict):
        raise TypeError("finding must be a dictionary.")

    root = Path(repo_root).expanduser().resolve()
    if not root.is_dir():
        raise ValueError(f"Repository directory does not exist: {root}")

    enriched = dict(finding)
    enriched["source_snippet"] = None
    enriched["source_snippet_precision"] = None
    enriched["source_snippet_status"] = "unavailable"
    enriched["ast_context"] = None
    enriched["ast_context_status"] = "unavailable"

    file_path = finding.get("file_path")
    if not isinstance(file_path, str) or not file_path.strip():
        enriched["source_snippet_status"] = "missing_file_path"
        enriched["ast_context_status"] = "missing_file_path"
        return enriched

    # Resolve and constrain the SARIF path to the requested repository.
    source_path = (root / file_path).resolve()

    try:
        source_path.relative_to(root)
    except ValueError as exc:
        raise ValueError(
            "Finding path resolves outside the repository root."
        ) from exc

    if not source_path.is_file():
        enriched["source_snippet_status"] = "source_file_not_found"
        enriched["ast_context_status"] = "source_file_not_found"
        return enriched

    code = source_path.read_text(encoding="utf-8", errors="replace")
    location = finding.get("primary_location")

    if not isinstance(location, dict):
        location = {
            "start_line": finding.get("start_line"),
            "end_line": finding.get("end_line"),
        }

    snippet = extract_location_snippet(code, location)
    enriched["source_snippet"] = snippet

    if snippet is not None:
        if (
            location.get("start_column") is not None
            and location.get("end_column") is not None
        ):
            enriched["source_snippet_precision"] = "exact_region"
        else:
            enriched["source_snippet_precision"] = "line_range"

        enriched["source_snippet_status"] = "attached"
    else:
        enriched["source_snippet_status"] = "location_unextractable"

    start_line = location.get("start_line")
    if not isinstance(start_line, int) or isinstance(start_line, bool):
        enriched["ast_context_status"] = "missing_start_line"
        return enriched

    classification = classify_file(file_path)
    language = classification.get("language")

    if classification.get("action") != "parse" or not language:
        enriched["ast_context_status"] = "not_source_code"
        return enriched

    if language not in LANGUAGE_PROFILES:
        enriched["ast_context_status"] = "ast_profile_unavailable"
        return enriched

    try:
        tree = parse_code(code, language)
    except Exception as exc:
        enriched["ast_context_status"] = "parse_failed"
        enriched["ast_context_error"] = f"{type(exc).__name__}: {exc}"
        return enriched

    context = find_anchor_context(
        tree.root_node,
        start_line,
        language,
        code,
    )

    if context is None:
        enriched["ast_context_status"] = "anchor_not_found"
        return enriched

    enriched["ast_context"] = context
    enriched["ast_context_status"] = "attached"

    return enriched