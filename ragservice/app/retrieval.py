"""Vector similarity retrieval for code chunks stored in pgvector."""

from __future__ import annotations

from typing import Any

from app.vector_store import TABLE_NAME, connect_database


def search_chunks(
    repository_id: str,
    commit_sha: str,
    query_embedding: list[float],
    *,
    top_k: int = 6,
    exclude_file: str | None = None,
) -> list[dict[str, Any]]:
    """Return the most cosine-similar chunks for one repository revision."""
    if top_k < 1 or top_k > 50:
        raise ValueError("top_k must be between 1 and 50.")
    if not query_embedding:
        raise ValueError("query_embedding must not be empty.")

    filters = ["repository_id = %s", "commit_sha = %s"]
    params: list[Any] = [query_embedding, repository_id, commit_sha]

    if exclude_file:
        filters.append("file_path <> %s")
        params.append(exclude_file)

    params.extend([query_embedding, top_k])

    query = f"""
        SELECT
            file_path,
            language,
            symbol_type,
            symbol_name,
            start_line,
            end_line,
            code,
            metadata,
            1 - (embedding <=> %s) AS similarity
        FROM {TABLE_NAME}
        WHERE {' AND '.join(filters)}
        ORDER BY embedding <=> %s
        LIMIT %s
    """

    conn = connect_database()
    try:
        with conn.cursor() as cursor:
            cursor.execute(query, params)
            rows = cursor.fetchall()
            return [
                {**row, "similarity": float(row["similarity"])}
                for row in rows
            ]
    finally:
        conn.close()
