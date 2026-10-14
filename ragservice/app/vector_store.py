"""Neon/PostgreSQL persistence for code chunks and pgvector embeddings."""

from __future__ import annotations

import os
from typing import Any

import psycopg
from pgvector.psycopg import register_vector
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from app.embeddings import EMBEDDING_DIMENSIONS, EMBEDDING_MODEL


TABLE_NAME = "gitcity_code_chunks"


def _database_url() -> str:
    url = (
        os.getenv("RAG_DATABASE_URL")
        or os.getenv("NEON_DATABASE_URL")
        or os.getenv("DATABASE_URL")
    )
    if not url:
        raise RuntimeError(
            "RAG_DATABASE_URL is missing. Put your Neon PostgreSQL connection "
            "string in ragservice/.env as RAG_DATABASE_URL."
        )
    return url


def connect_database() -> psycopg.Connection:
    """Open a connection and register pgvector's psycopg adapter."""
    conn = psycopg.connect(_database_url(), row_factory=dict_row)
    try:
        conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
        conn.commit()
        register_vector(conn)
        return conn
    except Exception:
        conn.close()
        raise


def ensure_schema() -> None:
    """Create the vector table and indexes if they do not already exist."""
    dimensions = int(EMBEDDING_DIMENSIONS)
    if dimensions < 1:
        raise ValueError("Embedding dimensions must be positive.")

    conn = connect_database()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
                    id BIGSERIAL PRIMARY KEY,
                    repository_id TEXT NOT NULL,
                    commit_sha TEXT NOT NULL,
                    chunk_hash TEXT NOT NULL,
                    file_path TEXT NOT NULL,
                    language TEXT NOT NULL,
                    symbol_type TEXT,
                    symbol_name TEXT,
                    start_line INTEGER NOT NULL,
                    end_line INTEGER NOT NULL,
                    code TEXT NOT NULL,
                    embedding_model TEXT NOT NULL,
                    embedding VECTOR({dimensions}) NOT NULL,
                    metadata JSONB NOT NULL DEFAULT '{{}}'::jsonb,
                    indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE (repository_id, commit_sha, chunk_hash)
                )
                """
            )
            cursor.execute(
                f"""
                CREATE INDEX IF NOT EXISTS gitcity_chunks_repo_commit_idx
                ON {TABLE_NAME} (repository_id, commit_sha)
                """
            )
            cursor.execute(
                f"""
                CREATE INDEX IF NOT EXISTS gitcity_chunks_embedding_hnsw_idx
                ON {TABLE_NAME}
                USING hnsw (embedding vector_cosine_ops)
                """
            )
        conn.commit()
    finally:
        conn.close()


def replace_commit_chunks(
    repository_id: str,
    commit_sha: str,
    chunks: list[dict[str, Any]],
) -> None:
    """Replace one repository revision atomically; a retry won't duplicate rows."""
    conn = connect_database()
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                f"DELETE FROM {TABLE_NAME} "
                "WHERE repository_id = %s AND commit_sha = %s",
                (repository_id, commit_sha),
            )

            if chunks:
                cursor.executemany(
                    f"""
                    INSERT INTO {TABLE_NAME} (
                        repository_id,
                        commit_sha,
                        chunk_hash,
                        file_path,
                        language,
                        symbol_type,
                        symbol_name,
                        start_line,
                        end_line,
                        code,
                        embedding_model,
                        embedding,
                        metadata
                    )
                    VALUES (
                        %s, %s, %s, %s, %s, %s, %s,
                        %s, %s, %s, %s, %s, %s
                    )
                    """,
                    [
                        (
                            repository_id,
                            commit_sha,
                            chunk["chunk_hash"],
                            chunk["file_path"],
                            chunk["language"],
                            chunk.get("symbol_type"),
                            chunk.get("symbol_name"),
                            chunk["start_line"],
                            chunk["end_line"],
                            chunk["code"],
                            chunk.get("embedding_model", EMBEDDING_MODEL),
                            chunk["embedding"],
                            Jsonb(chunk.get("metadata", {})),
                        )
                        for chunk in chunks
                    ],
                )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def count_chunks(repository_id: str, commit_sha: str | None = None) -> int:
    conn = connect_database()
    try:
        with conn.cursor() as cursor:
            if commit_sha:
                cursor.execute(
                    f"SELECT COUNT(*) AS total FROM {TABLE_NAME} "
                    "WHERE repository_id = %s AND commit_sha = %s",
                    (repository_id, commit_sha),
                )
            else:
                cursor.execute(
                    f"SELECT COUNT(*) AS total FROM {TABLE_NAME} "
                    "WHERE repository_id = %s",
                    (repository_id,),
                )
            row = cursor.fetchone()
            return int(row["total"])
    finally:
        conn.close()
