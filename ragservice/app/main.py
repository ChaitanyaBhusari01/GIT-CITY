from fastapi import FastAPI
from pydantic import BaseModel , Field

from app.sarif_parser import parse_sarif

app = FastAPI(
    title = "GitCity Security & RAG API",
    description="it will process CodeQL findings, enrich them with source and AST context, retrieve related code, and provide evidence-grounded AI analysis",
    version="1.0.0",
)

class SecurityScanRequest(BaseModel):
    repository_id: str = Field(min_length=1)
    commit_sha: str = Field(pattern=r"^[0-9a-fA-F]{40,64}$")
    sarif_report : dict
    top_k: int = Field(default=6, ge=1, le=50)
    



@app.get("/health")
async def health_check():
    return {
        "service" : "GitCity Security & RAG API",
        "status" : "healthy"
        }

@app.post("/security/scan")
async def analyze_security(request : SecurityScanRequest):
    findings = parse_sarif(request.sarif_report)
    return {
        "status" : "parsed",
        "message" : "Request_validated ; security analysis is not connected yet.",
        "repository_id" : request.repository_id,
        "commit_sha" : request.commit_sha,
        "top_k" : request.top_k,
        "finding_count" : len(findings),
        "findings" : findings
    }
