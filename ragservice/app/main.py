"""FastAPI entry point for GitCity's security/RAG service."""

from __future__ import annotations

import hmac
import json
import os
import zipfile
from io import BytesIO
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import Body, FastAPI, Header, HTTPException, Query

# Load local service configuration before handling requests.
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from app.sarif_parser import parse_sarif  # noqa: E402


app = FastAPI(
    title="GitCity Security & RAG API",
    description=(
        "Processes CodeQL findings, enriches them with source and AST context, "
        "retrieves related code, and provides evidence-grounded AI analysis."
    ),
    version="1.0.0",
)

MAX_ARCHIVE_BYTES = 50 * 1024 * 1024
MAX_SARIF_FILE_BYTES = 50 * 1024 * 1024
MAX_TOTAL_SARIF_BYTES = 100 * 1024 * 1024
MAX_ARCHIVE_ENTRIES = 2000


@app.get("/health")
async def health_check():
    return {
        "service": "GitCity Security & RAG API",
        "status": "healthy",
    }


def _require_service_token(authorization: str | None) -> None:
    expected_token = os.getenv("RAG_SERVICE_TOKEN")
    if not expected_token:
        raise HTTPException(
            status_code=503,
            detail="RAG_SERVICE_TOKEN is not configured for the security service.",
        )

    scheme, separator, supplied_token = (authorization or "").partition(" ")
    if (
        not separator
        or scheme.lower() != "bearer"
        or not hmac.compare_digest(supplied_token, expected_token)
    ):
        raise HTTPException(status_code=401, detail="Invalid service token.")


def _parse_sarif_archive(archive_bytes: bytes) -> list[dict[str, Any]]:
    if not archive_bytes:
        raise HTTPException(status_code=400, detail="The SARIF artifact archive is empty.")
    if len(archive_bytes) > MAX_ARCHIVE_BYTES:
        raise HTTPException(status_code=413, detail="The SARIF artifact archive is too large.")

    try:
        archive = zipfile.ZipFile(BytesIO(archive_bytes))
    except zipfile.BadZipFile as exc:
        raise HTTPException(
            status_code=400,
            detail="The CodeQL artifact is not a valid ZIP archive.",
        ) from exc

    findings: list[dict[str, Any]] = []
    try:
        with archive:
            entries = archive.infolist()
            if len(entries) > MAX_ARCHIVE_ENTRIES:
                raise HTTPException(
                    status_code=413,
                    detail="The artifact contains too many files.",
                )

            sarif_entries = [
                entry
                for entry in entries
                if not entry.is_dir() and entry.filename.lower().endswith(".sarif")
            ]
            if not sarif_entries:
                raise HTTPException(
                    status_code=422,
                    detail="No .sarif report was found in the CodeQL artifact.",
                )

            total_sarif_bytes = sum(entry.file_size for entry in sarif_entries)
            if total_sarif_bytes > MAX_TOTAL_SARIF_BYTES:
                raise HTTPException(
                    status_code=413,
                    detail="The uncompressed SARIF reports are too large.",
                )

            for entry in sarif_entries:
                if entry.file_size > MAX_SARIF_FILE_BYTES:
                    raise HTTPException(
                        status_code=413,
                        detail=f"SARIF file is too large: {entry.filename}",
                    )

                try:
                    report_bytes = archive.read(entry)
                    report = json.loads(report_bytes)
                except (json.JSONDecodeError, UnicodeDecodeError) as exc:
                    raise HTTPException(
                        status_code=422,
                        detail=f"Invalid JSON in SARIF file: {entry.filename}",
                    ) from exc
                except (zipfile.BadZipFile, RuntimeError, OSError) as exc:
                    raise HTTPException(
                        status_code=400,
                        detail="Could not read the SARIF artifact archive.",
                    ) from exc

                if not isinstance(report, dict):
                    raise HTTPException(
                        status_code=422,
                        detail=f"SARIF document must be a JSON object: {entry.filename}",
                    )

                findings.extend(parse_sarif(report))
    finally:
        archive.close()

    return findings


@app.post("/security/scan")
async def analyze_security(
    report_archive: bytes = Body(..., media_type="application/zip"),
    repository_id: str = Query(
        ...,
        min_length=3,
        max_length=201,
        pattern=r"^[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}$",
    ),
    commit_sha: str = Query(..., pattern=r"^[0-9a-fA-F]{40,64}$"),
    top_k: int = Query(default=6, ge=1, le=50),
    authorization: str | None = Header(default=None),
):
    """Parse the SARIF ZIP artifact forwarded by the Express backend."""
    _require_service_token(authorization)
    findings = _parse_sarif_archive(report_archive)

    return {
        "status": "parsed",
        "message": (
            "SARIF parsing completed. Source enrichment, indexing, and AI analysis "
            "will run in a later pipeline step."
        ),
        "repository_id": repository_id,
        "commit_sha": commit_sha.lower(),
        "top_k": top_k,
        "finding_count": len(findings),
        "findings": findings,
    }
