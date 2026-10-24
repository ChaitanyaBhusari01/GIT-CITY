# GitCity Security Scanner

## Current pipeline

1. The frontend asks the Express backend to scan a public GitHub repository at the exact tree commit SHA currently selected in GitCity.
2. Express dispatches `.github/workflows/codeql-scan.yml` and polls the workflow.
3. GitHub Actions checks out that exact SHA, runs CodeQL, and uploads the `codeql-security-report` SARIF artifact.
4. Express downloads that artifact ZIP and submits it to the FastAPI service, authenticated with `RAG_SERVICE_TOKEN`.
5. FastAPI parses the SARIF, downloads source files from the same commit without running repository code, and attaches the exact reported source region and Tree-sitter AST context where supported.
6. When a Neon connection and OpenRouter key are configured, FastAPI indexes supported source chunks under the same `repository_id + commit_sha`, retrieves semantically related chunks through pgvector, and requests evidence-grounded AI triage.
7. Express polls the FastAPI job and returns normalized CodeQL findings plus any source context, analysis, evidence, warnings, and pipeline status.

The security pipeline reuses the existing modules in `ragservice/app`: `sarif_parser.py`, `source_snapshot.py`, `finding_context.py`, `indexer.py`, `retrieval.py`, and `security_service.py`.

## Local configuration

Create `ragservice/.env` locally from `ragservice/.env.example`. Do not commit `.env` files or paste their values into chat.

Required to receive SARIF in FastAPI:
- `RAG_SERVICE_TOKEN`: must exactly match the value in `backend/.env`.

Required for AI explanations:
- `OPENROUTER_API_KEY`: set in `ragservice/.env`.

Required for Neon pgvector indexing and semantic retrieval:
- `RAG_DATABASE_URL`: the Neon PostgreSQL connection string.
- `OPENROUTER_API_KEY`: used to produce both embeddings and chat completions.

Optional limits:
- `SECURITY_AI_MAX_FINDINGS`: maximum findings analyzed by AI per scan (default 20, maximum 100).
- `SECURITY_ANALYSIS_WORKERS`: concurrent AI workers (default 3, maximum 3).
- `GITCITY_MAX_INDEXED_CHUNKS`: maximum code chunks embedded per repository revision (default 10,000, hard maximum 50,000). If reached, the scan includes an indexing warning; CodeQL findings remain available.

If the OpenRouter key is absent, SARIF findings and source/AST context are still returned with `analysis_status=not_configured`. If Neon is unavailable, AI can still analyze direct SARIF/source evidence, but the result reports vector retrieval as unavailable; it must not claim semantic retrieval happened.

## Local start

From the repository root, start FastAPI in one terminal:

```powershell
cd ragservice
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Start Express in a second terminal:

```powershell
cd backend
npm start
```

Start the Vite frontend in a third terminal from `frontend` using `npm run dev`.

## Job lifecycle and current limits

The FastAPI endpoint `POST /security/scan` returns a scan ID quickly; `GET /security/scan/{scan_id}` exposes the background analysis stage and results. Express polls that ID after forwarding the SARIF once, instead of uploading the same artifact repeatedly.

FastAPI and Express scan-job maps are process-local MVP storage. Restarting a service loses jobs/results currently in memory. Durable scan history is not implemented yet. Analysis is bounded per scan to control latency and provider usage; findings beyond the configured AI limit still appear as CodeQL findings with `analysis_status=skipped_limit`.

The supported input is public GitHub repositories. Private repository support, a persistent scan-history store, and automatic highlighting of affected 3D buildings are separate follow-up work.
