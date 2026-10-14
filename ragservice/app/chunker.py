"""Language-independent structural chunking using Tree-sitter language profiles."""

from __future__ import annotations

from app.language_profiles import LANGUAGE_PROFILES


def get_symbol_name(node, language: str, code: str) -> str | None:
    """Extract a symbol name through Tree-sitter's common 'name' field."""
    name_node = node.child_by_field_name("name")
    if name_node is None:
        return None
    return code[name_node.start_byte:name_node.end_byte]


def _walk_tree(node, language: str, code: str, file_path: str, chunks: list[dict]) -> None:
    profile = LANGUAGE_PROFILES.get(language, {})
    allowed_types = profile.get("chunk_nodes", set())

    if node.type in allowed_types:
        chunks.append(
            {
                "file_path": file_path,
                "language": language,
                "type": node.type,
                "name": get_symbol_name(node, language, code),
                "code": code[node.start_byte:node.end_byte],
                "start_line": node.start_point.row + 1,
                "end_line": node.end_point.row + 1,
            }
        )

    for child in node.named_children:
        _walk_tree(child, language, code, file_path, chunks)


def _line_chunks(
    code: str,
    file_path: str,
    language: str,
    *,
    max_lines: int = 100,
    overlap_lines: int = 15,
) -> list[dict]:
    """Language-neutral fallback for grammars without a structural profile."""
    lines = code.splitlines()
    if not lines:
        return []

    chunks = []
    start = 0
    while start < len(lines):
        end = min(start + max_lines, len(lines))
        source = "\n".join(lines[start:end])
        if source.strip():
            chunks.append(
                {
                    "file_path": file_path,
                    "language": language,
                    "type": "line_chunk",
                    "name": None,
                    "code": source,
                    "start_line": start + 1,
                    "end_line": end,
                }
            )
        if end >= len(lines):
            break
        start = max(start + 1, end - overlap_lines)

    return chunks


def chunk_code(tree, code: str, file_path: str, language: str) -> list[dict]:
    """Create structural chunks when profiled, else overlapping line chunks."""
    if language not in LANGUAGE_PROFILES:
        return _line_chunks(code, file_path, language)

    chunks: list[dict] = []
    _walk_tree(tree.root_node, language, code, file_path, chunks)

    # Files with no recognized top-level symbols still need to be indexable.
    if not chunks and code.strip():
        return _line_chunks(code, file_path, language)

    return chunks
