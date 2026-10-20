import json
import sys
import unittest
from pathlib import Path

RAG_ROOT = Path(__file__).resolve().parent
REPO_ROOT = RAG_ROOT.parent
sys.path.insert(0, str(RAG_ROOT))

from app.sarif_parser import parse_sarif
from app.finding_context import enrich_finding_with_source
from app.security_service import _build_direct_evidence


SARIF_PATH = (
    REPO_ROOT
    / "security"
    / "codeql-security-report (1)"
    / "javascript.sarif"
)


class SecurityPipelineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with SARIF_PATH.open("r", encoding="utf-8") as file:
            cls.findings = parse_sarif(json.load(file))

        cls.repo_root = REPO_ROOT / "express"

    def test_logging_finding_flows_through_all_local_stages(self):
        finding = self.findings[0]

        enriched = enrich_finding_with_source(
            finding,
            self.repo_root,
        )
        evidence = _build_direct_evidence(enriched)

        self.assertEqual(enriched["level"], "error")
        self.assertEqual(enriched["source_snippet"], "pass")
        self.assertEqual(enriched["ast_context_status"], "attached")

        self.assertEqual(
            [item["evidence_type"] for item in evidence],
            [
                "exact_source_region",
                "ast_construct",
                "enclosing_symbol",
                "codeql_flow_step",
                "codeql_flow_step",
                "codeql_flow_step",
            ],
        )

        self.assertEqual(
            [item["id"] for item in evidence],
            [f"E{i}" for i in range(1, 7)],
        )

        self.assertEqual(evidence[0]["code"], "pass")
        self.assertEqual(
            evidence[1]["construct_type"],
            "call_expression",
        )
        self.assertEqual(
            evidence[2]["symbol_name"],
            "authenticate",
        )
        self.assertEqual(
            [item["start_line"] for item in evidence[3:]],
            [106, 60, 61],
        )

    def test_cookie_finding_has_source_and_construct_without_symbol(self):
        enriched = enrich_finding_with_source(
            self.findings[1],
            self.repo_root,
        )
        evidence = _build_direct_evidence(enriched)

        self.assertEqual(enriched["level"], "warning")
        self.assertEqual(enriched["ast_context_status"], "attached")
        self.assertIsNone(enriched["ast_context"]["symbol"])

        self.assertEqual(
            [item["evidence_type"] for item in evidence],
            ["exact_source_region", "ast_construct"],
        )
        self.assertEqual(
            evidence[1]["construct_type"],
            "call_expression",
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)