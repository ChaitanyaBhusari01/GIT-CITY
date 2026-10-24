"""FastAPI entry point for GitCity's security and RAG pipeline.

The CodeQL artifact is parsed immediately; source enrichment, optional Neon
indexing/retrieval, and evidence-grounded AI triage run as a pollable job so a
large report does not keep the Express request open for the whole analysis.
"""

from __future__ import annotations

import hmac
import json
import os
import tempfile
import time
import uuid
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from io import BytesIO
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import BackgroundTasks, Body, FastAPI, Header, HTTPException, Query

# Load local service configuration before importing adapters that read env vars.
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from app.finding_context import enrich_finding_with_source  # noqa: E402
from app.indexer import index_repository  # noqa: E402
from app.sarif_parser import parse_sarif  # noqa: E402
from app.security_service import analyze_security_finding  # noqa: E402
from app.source_snapshot import download_repository_source  # noqa: E402
from app.vector_store import count_chunks, ensure_schema  # noqa: E402


app = FastAPI(
    title="GitCity Security & RAG API",
    description=(
        "Parses CodeQL SARIF, attaches exact-commit source and AST context, "
        "optionally retrieves related code from Neon pgvector, and provides "
        "evidence-grounded AI security analysis."
    ),
    version="1.1.0",
)

MAX_ARCHIVE_BYTES = 50 * 1024 * 1024
MAX_SARIF_FILE_BYTES = 50 * 1024 * 1024
MAX_TOTAL_SARIF_BYTES = 100 * 1024 * 1024
MAX_ARCHIVE_ENTRIES = 2000
SCAN_JOB_TTL_SECONDS = 2 * 60 * 60
DEFAULT_AI_FINDING_LIMIT = 20
MAX_AI_FINDING_LIMIT = 100
MAX_ANALYSIS_WORKERS = 3

# MVP job storage is process-local; raw findings remain available if optional
# source, database, embeddings, or LLM services are not configured.
security_scan_jobs: dict[str, dict[str, Any]] = {}


@app.get("/health")
async def health_check():
    return {
        "service": "GitCity Security & RAG API",
        "status": "healthy",
        "capabilities": {
            "sarif_parsing": True,
            "source_and_ast_context": True,
            "neon_vector_retrieval": bool(
                os.getenv("RAG_DATABASE_URL")
                or os.getenv("NEON_DATABASE_URL")
                or os.getenv("DATABASE_URL")
            ),
            "ai_analysis": bool(os.getenv("OPENROUTER_API_KEY")),
        },
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
                    report = json.loads(archive.read(entry))
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


def _configured_database_url() -> bool:
    return bool(
        os.getenv("RAG_DATABASE_URL")
        or os.getenv("NEON_DATABASE_URL")
        or os.getenv("DATABASE_URL")
    )


def _bounded_int_env(name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        value = default
    return max(minimum, min(value, maximum))


def _prune_expired_jobs() -> None:
    oldest_allowed = time.time() - SCAN_JOB_TTL_SECONDS
    expired = [
        scan_id
        for scan_id, job in security_scan_jobs.items()
        if job.get("created_at", 0) < oldest_allowed
    ]
    for scan_id in expired:
        security_scan_jobs.pop(scan_id, None)


def _api_finding(finding: dict[str, Any]) -> dict[str, Any]:
    """Return normalized evidence without duplicating the full raw SARIF result."""
    return {
        key: value
        for key, value in finding.items()
        if key not in {"raw_result", "locations", "related_locations", "code_flows"}
    }


def _job_payload(job: dict[str, Any]) -> dict[str, Any]:
    return {
        "scan_id": job["scan_id"],
        "status": job["status"],
        "stage": job.get("stage"),
        "repository_id": job["repository_id"],
        "commit_sha": job["commit_sha"],
        "finding_count": len(job["findings"]),
        "processed_analyses": job.get("processed_analyses", 0),
        "analysis_limit": job.get("analysis_limit"),
        "source_status": job.get("source_status", "pending"),
        "indexing_status": job.get("indexing_status", "not_started"),
        "analysis_status": job.get("analysis_status", "pending"),
        "warnings": job.get("warnings", []),
        "error": job.get("error"),
        "findings": [_api_finding(finding) for finding in job["findings"]],
    }


def _mark_context_unavailable(finding: dict[str, Any], error: str) -> dict[str, Any]:
    enriched = dict(finding)
    enriched.update({
        "source_snippet": None,
        "source_snippet_status": "unavailable",
        "source_snippet_precision": None,
        "ast_context": None,
        "ast_context_status": "unavailable",
        "source_context_error": error[:300],
    })
    return enriched


def _analyse_one(
    *,
    repository_id: str,
    commit_sha: str,
    finding: dict[str, Any],
    top_k: int,
    retrieval_enabled: bool,
) -> dict[str, Any]:
    return analyze_security_finding(
        repository_id=repository_id,
        commit_sha=commit_sha,
        finding=finding,
        top_k=top_k,
        retrieval_enabled=retrieval_enabled,
    )


def _run_security_pipeline(
    scan_id: str,
    repository_id: str,
    commit_sha: str,
    top_k: int,
) -> None:
    """Enrich and analyze a SARIF job without blocking the initial HTTP reply."""
    job = security_scan_jobs.get(scan_id)
    if not job:
        return

    warnings: list[str] = job["warnings"]
    # Work on a private copy. Poll requests must not serialize dictionaries while
    # background workers are adding source/analysis fields to them.
    findings = [dict(finding) for finding in job["findings"]]
    source_root: Path | None = None
    database_configured = _configured_database_url()
    llm_configured = bool(os.getenv("OPENROUTER_API_KEY"))
    job["analysis_limit"] = _bounded_int_env(
        "SECURITY_AI_MAX_FINDINGS", DEFAULT_AI_FINDING_LIMIT, 1, MAX_AI_FINDING_LIMIT
    )

    try:
        job["status"] = "processing"
        job["stage"] = "source_snapshot"
        with tempfile.TemporaryDirectory(prefix="gitcity-security-") as temp_dir:
            try:
                source_root = download_repository_source(
                    repository_id,
                    commit_sha,
                    temp_dir,
                )
                job["source_status"] = "available"
            except Exception as exc:
                job["source_status"] = "unavailable"
                warnings.append(
                    f"Source snapshot could not be loaded: {type(exc).__name__}: {str(exc)[:240]}"
                )

            if source_root is not None:
                job["stage"] = "source_and_ast_context"
                enriched_findings: list[dict[str, Any]] = []
                for finding in findings:
                    try:
                        enriched_findings.append(
                            enrich_finding_with_source(finding, source_root)
                        )
                    except Exception as exc:
                        enriched_findings.append(
                            _mark_context_unavailable(
                                finding,
                                f"{type(exc).__name__}: {str(exc)[:240]}",
                            )
                        )
                findings[:] = enriched_findings

            # Index the same source snapshot only when both the embedding
            # provider and a database URL are available. Never index a different
            # revision merely because HEAD in a local checkout has moved.
            retrieval_enabled = database_configured and llm_configured
            if source_root is not None and database_configured and llm_configured:
                job["stage"] = "indexing_source"
                try:
                    ensure_schema()
                    existing_chunks = count_chunks(repository_id, commit_sha)
                    if existing_chunks > 0:
                        job["indexing_status"] = "already_indexed"
                    else:
                        index_result = index_repository(
                            source_root,
                            repository_id=repository_id,
                            commit_sha=commit_sha,
                        )
                        job["indexing_status"] = "indexed"
                        job["indexing_summary"] = {
                            key: index_result[key]
                            for key in (
                                "files_parsed", "files_skipped", "chunks_indexed",
                                "embedding_model", "embedding_dimensions",
                            )
                            if key in index_result
                        }
                except Exception as exc:
                    retrieval_enabled = False
                    job["indexing_status"] = "failed"
                    warnings.append(
                        f"Neon indexing is unavailable: {type(exc).__name__}: {str(exc)[:240]}"
                    )
            elif not database_configured:
                job["indexing_status"] = "not_configured"
            elif not llm_configured:
                job["indexing_status"] = "not_configured"

            # If the LLM credential is absent, return parsed and enriched
            # CodeQL findings without pretending AI analysis has run.
            if not llm_configured:
                job["analysis_status"] = "not_configured"
                warnings.append(
                    "AI analysis is not configured. Set OPENROUTER_API_KEY in ragservice/.env."
                )
                for finding in findings:
                    finding["analysis_status"] = "not_configured"
                    finding["analysis"] = None
            else:
                job["stage"] = "ai_analysis"
                job["analysis_status"] = "processing"
                analysis_limit = job["analysis_limit"]
                selected = list(enumerate(findings[:analysis_limit]))
                for finding in findings[analysis_limit:]:
                    finding["analysis_status"] = "skipped_limit"
                    finding["analysis"] = None
                    finding["analysis_error"] = (
                        f"Per-scan AI limit reached ({analysis_limit}). "
                        "Increase SECURITY_AI_MAX_FINDINGS to analyze more findings."
                    )

                max_workers = _bounded_int_env(
                    "SECURITY_ANALYSIS_WORKERS", 3, 1, MAX_ANALYSIS_WORKERS
                )
                completed = 0

                # The worker pool shortens scans with multiple findings while
                # keeping API use bounded and independent of repository code.
                with ThreadPoolExecutor(max_workers=max_workers) as executor:
                    future_to_index = {
                        executor.submit(
                            _analyse_one,
                            repository_id=repository_id,
                            commit_sha=commit_sha,
                            finding=finding,
                            top_k=top_k,
                            retrieval_enabled=retrieval_enabled,
                        ): index
                        for index, finding in selected
                    }
                    for future in as_completed(future_to_index):
                        index = future_to_index[future]
                        finding = findings[index]
                        try:
                            result = future.result()
                            finding["analysis_status"] = "completed"
                            finding["analysis"] = result.get("analysis")
                            finding["analysis_evidence"] = result.get("evidence", [])
                            finding["analysis_evidence_count"] = result.get("evidence_count", 0)
                            finding["retrieval_status"] = result.get("retrieval_status")
                            if result.get("retrieval_error"):
                                finding["retrieval_error"] = result["retrieval_error"]
                        except Exception as exc:
                            finding["analysis_status"] = "failed"
                            finding["analysis"] = None
                            finding["analysis_error"] = (
                                f"{type(exc).__name__}: {str(exc)[:300]}"
                            )
                        completed += 1
                        job["processed_analyses"] = completed

                analysis_states = {finding.get("analysis_status") for finding in findings}
                if analysis_states and analysis_states <= {"completed"}:
                    job["analysis_status"] = "completed"
                elif "completed" in analysis_states:
                    job["analysis_status"] = "partial"
                elif not findings:
                    job["analysis_status"] = "completed"
                elif "failed" in analysis_states or "skipped_limit" in analysis_states:
                    job["analysis_status"] = "partial"
                else:
                    job["analysis_status"] = "failed"
    except Exception as exc:
        job["status"] = "failed"
        job["stage"] = "failed"
        job["error"] = f"{type(exc).__name__}: {str(exc)[:400]}"
        job["findings"] = findings
        warnings.append(job["error"])
        return

    job["findings"] = findings
    job["status"] = "completed"
    job["stage"] = "completed"
    if job.get("source_status") != "available":
        job["source_status"] = job.get("source_status", "unavailable")
    job["warnings"] = warnings


@app.post("/security/scan")
async def analyze_security(
    background_tasks: BackgroundTasks,
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
    """Start a pollable SARIF -> source -> retrieval -> AI-analysis pipeline."""
    _require_service_token(authorization)
    findings = _parse_sarif_archive(report_archive)
    scan_id = str(uuid.uuid4())

    _prune_expired_jobs()
    job: dict[str, Any] = {
        "scan_id": scan_id,
        "status": "processing",
        "stage": "queued",
        "repository_id": repository_id,
        "commit_sha": commit_sha.lower(),
        "findings": findings,
        "created_at": __import__("time").time(),
        "processed_analyses": 0,
        "analysis_limit": None,
        "source_status": "pending",
        "indexing_status": "not_started",
        "analysis_status": "pending",
        "warnings": [],
        "error": None,
    }
    security_scan_jobs[scan_id] = job
    background_tasks.add_task(
        _run_security_pipeline,
        scan_id,
        repository_id,
        commit_sha.lower(),
        top_k,
    )
    return _job_payload(job)


@app.get("/security/scan/{scan_id}")
async def get_security_scan(
    scan_id: str,
    authorization: str | None = Header(default=None),
):
    """Return current status, source/indexing metadata, and normalized findings."""
    _require_service_token(authorization)
    job = security_scan_jobs.get(scan_id)
    if not job:
        raise HTTPException(
            status_code=404,
            detail="Security-analysis job not found or expired. Start a new scan.",
        )
    return _job_payload(job)
