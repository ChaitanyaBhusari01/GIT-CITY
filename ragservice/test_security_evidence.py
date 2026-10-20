

import sys
import unittest
from pathlib import Path

RAG_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(RAG_ROOT))

from app.security_service import _build_direct_evidence


class SecurityEvidenceTests(unittest.TestCase):
    def test_direct_evidence_order_and_provenance(self):
        finding = {
            "file_path": "examples/auth/index.js",
            "start_line": 61,
            "primary_location": {
                "start_line": 61,
                "end_line": 61,
                "start_column": 65,
                "end_column": 69,
            },
            "source_snippet": "pass",
            "source_snippet_precision": "exact_region",
            "ast_context": {
                "construct": {
                    "type": "call_expression",
                    "code": "console.log('authenticating %s:%s', name, pass)",
                    "start_line": 61,
                    "end_line": 61,
                },
                "symbol": {
                    "type": "function_declaration",
                    "name": "authenticate",
                    "code": "function authenticate(name, pass) { ... }",
                    "start_line": 60,
                    "end_line": 73,
                },
            },
            "code_flow_steps": [
                {
                    "file_path": "examples/auth/index.js",
                    "start_line": 106,
                    "message": "req.body.password",
                    "flow_index": 1,
                    "thread_flow_index": 1,
                    "step_index": 1,
                },
                {
                    "file_path": "examples/auth/index.js",
                    "start_line": 61,
                    "message": "pass",
                    "flow_index": 1,
                    "thread_flow_index": 1,
                    "step_index": 3,
                },
            ],
        }

        evidence = _build_direct_evidence(finding)

        self.assertEqual(
            [item["evidence_type"] for item in evidence],
            [
                "exact_source_region",
                "ast_construct",
                "enclosing_symbol",
                "codeql_flow_step",
                "codeql_flow_step",
            ],
        )

        self.assertEqual(
            [item["id"] for item in evidence],
            ["E1", "E2", "E3", "E4", "E5"],
        )

        self.assertEqual(evidence[0]["code"], "pass")
        self.assertEqual(
            evidence[0]["source"],
            "SARIF primary location",
        )
        self.assertEqual(
            evidence[1]["construct_type"],
            "call_expression",
        )
        self.assertEqual(
            evidence[2]["symbol_name"],
            "authenticate",
        )
        self.assertIsNone(evidence[3]["code"])
        self.assertEqual(evidence[3]["message"], "req.body.password")
        self.assertLess(
            evidence[3]["step_index"],
            evidence[4]["step_index"],
        )

    def test_missing_direct_context_returns_empty_list(self):
        self.assertEqual(_build_direct_evidence({}), [])


if __name__ == "__main__":
    unittest.main(verbosity=2)