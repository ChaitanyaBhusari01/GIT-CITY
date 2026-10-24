import sys
import unittest
from pathlib import Path
from unittest.mock import patch

RAG_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(RAG_ROOT))

from app.security_service import analyze_security_finding


class SecurityServiceFallbackTests(unittest.TestCase):
    def test_ai_uses_direct_evidence_when_vector_retrieval_is_disabled(self):
        finding = {
            "rule_id": "js/example-rule",
            "level": "warning",
            "message": "Example security finding.",
            "file_path": "src/example.js",
            "start_line": 12,
            "end_line": 12,
            "primary_location": {
                "start_line": 12,
                "end_line": 12,
                "start_column": 5,
                "end_column": 13,
            },
            "source_snippet": "send(data)",
            "source_snippet_precision": "exact_region",
            "source_snippet_status": "attached",
            "ast_context": None,
            "ast_context_status": "unavailable",
        }

        with (
            patch("app.security_service.embed_text") as mock_embed,
            patch("app.security_service.search_chunks") as mock_search,
            patch(
                "app.security_service.generate_chat_completion",
                return_value="Assessment: needs review. Evidence: [E1]",
            ) as mock_llm,
        ):
            result = analyze_security_finding(
                repository_id="example-org/example-repo",
                commit_sha="a" * 40,
                finding=finding,
                retrieval_enabled=False,
            )

        mock_embed.assert_not_called()
        mock_search.assert_not_called()
        mock_llm.assert_called_once()
        self.assertEqual(result["retrieval_status"], "not_configured")
        self.assertEqual(result["retrieved_evidence_count"], 0)
        self.assertEqual(result["direct_evidence_count"], 1)
        self.assertEqual(result["evidence"][0]["code"], "send(data)")
        self.assertIn("[E1]", result["analysis"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
