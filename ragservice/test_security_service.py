import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

RAG_ROOT = Path(__file__).resolve().parent
REPO_ROOT = RAG_ROOT.parent
sys.path.insert(0, str(RAG_ROOT))

from app.finding_context import enrich_finding_with_source
from app.sarif_parser import parse_sarif
from app.security_service import analyze_security_finding


SARIF_PATH = (
    REPO_ROOT
    / "security"
    / "codeql-security-report (1)"
    / "javascript.sarif"
)


class SecurityServiceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with SARIF_PATH.open("r", encoding="utf-8") as file:
            findings = parse_sarif(json.load(file))

        cls.repo_root = REPO_ROOT / "express"
        cls.finding = enrich_finding_with_source(
            findings[0],
            cls.repo_root,
        )

    def test_analysis_combines_direct_and_retrieved_evidence(self):
        retrieved_chunk = {
            "file_path": "examples/auth/related.js",
            "language": "javascript",
            "symbol_type": "function_declaration",
            "symbol_name": "relatedFunction",
            "start_line": 10,
            "end_line": 20,
            "code": "function relatedFunction() { return true; }",
            "similarity": 0.88,
        }

        expected_analysis = (
            "Assessment: needs review\n"
            "Evidence: [E1] and [E7]"
        )

        with (
            patch(
                "app.security_service.embed_text",
                return_value=[0.1, 0.2],
            ) as mock_embed,
            patch(
                "app.security_service.search_chunks",
                return_value=[retrieved_chunk],
            ) as mock_search,
            patch(
                "app.security_service.generate_chat_completion",
                return_value=expected_analysis,
            ) as mock_llm,
        ):
            result = analyze_security_finding(
                repository_id="example-org/example-api",
                commit_sha="a" * 40,
                finding=self.finding,
                top_k=6,
            )

        # The retrieval query is embedded and searched for the right revision.
        mock_embed.assert_called_once()
        mock_search.assert_called_once_with(
            "example-org/example-api",
            "a" * 40,
            [0.1, 0.2],
            top_k=6,
        )

        # Direct evidence is placed before retrieved evidence.
        evidence = result["evidence"]

        self.assertEqual(evidence[0]["id"], "E1")
        self.assertEqual(evidence[0]["evidence_type"], "exact_source_region")
        self.assertEqual(evidence[0]["code"], "pass")

        self.assertEqual(evidence[-1]["id"], "E7")
        self.assertEqual(
            evidence[-1]["evidence_type"],
            "retrieved_code_chunk",
        )
        self.assertEqual(
            evidence[-1]["file_path"],
            "examples/auth/related.js",
        )

        # All direct and retrieved evidence is passed to the LLM.
        mock_llm.assert_called_once()
        messages = mock_llm.call_args.args[0]
        payload = json.loads(messages[1]["content"])
        sent_evidence = payload["retrieved_evidence"]

        self.assertEqual(len(sent_evidence), 7)
        self.assertEqual(sent_evidence[0]["code"], "pass")
        self.assertEqual(sent_evidence[-1]["id"], "E7")

        self.assertEqual(result["evidence_count"], 7)
        self.assertEqual(result["analysis"], expected_analysis)

        # These counts should be present after the earlier service update.
        self.assertEqual(result["direct_evidence_count"], 6)
        self.assertEqual(result["retrieved_evidence_count"], 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)