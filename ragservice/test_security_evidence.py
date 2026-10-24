

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

    def test_direct_evidence_payload_is_bounded(self):
        finding = {
            "file_path": "src/example.js",
            "start_line": 12,
            "source_snippet": "x" * 6000,
            "ast_context": {
                "construct": {
                    "type": "call_expression",
                    "code": "y" * 8000,
                    "start_line": 11,
                    "end_line": 14,
                },
                "symbol": None,
            },
            "code_flow_steps": [
                {
                    "file_path": "src/example.js",
                    "start_line": line,
                    "message": "flow " + str(line),
                }
                for line in range(1, 51)
            ],
        }

        evidence = _build_direct_evidence(finding)
        source_region = evidence[0]
        construct = evidence[1]
        flow_steps = [
            item for item in evidence
            if item["evidence_type"] == "codeql_flow_step"
        ]
        omitted = [
            item for item in evidence
            if item["evidence_type"] == "omitted_codeql_flow_steps"
        ]

        self.assertEqual(len(source_region["code"]), 5500)
        self.assertTrue(source_region["code_truncated"])
        self.assertEqual(source_region["original_code_characters"], 6000)
        self.assertEqual(len(construct["code"]), 5500)
        self.assertTrue(construct["code_truncated"])
        self.assertEqual(construct["original_code_characters"], 8000)
        self.assertEqual(len(flow_steps), 40)
        self.assertEqual(len(omitted), 1)
        self.assertEqual(omitted[0]["omitted_count"], 10)


    def test_missing_direct_context_returns_empty_list(self):
        self.assertEqual(_build_direct_evidence({}), [])


if __name__ == "__main__":
    unittest.main(verbosity=2)