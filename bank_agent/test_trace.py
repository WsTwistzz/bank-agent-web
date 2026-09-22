import json
import tempfile
import unittest
from pathlib import Path

from bank_agent.trace import AuditLogs, FrontendEventLogger, TraceLogger


class TraceLoggerTest(unittest.TestCase):
    def test_writes_jsonl_and_redacts_secrets(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "agent.jsonl"
            trace = TraceLogger(path)
            trace.write(
                "tool_call", "U1", "S1",
                credential="123456", context={"content": "验证码是 123456"},
                arguments={"amount": "20.00"},
            )
            record = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual("[REDACTED]", record["details"]["credential"])
        self.assertEqual("验证码是 [REDACTED_OTP]", record["details"]["context"]["content"])
        self.assertEqual("20.00", record["details"]["arguments"]["amount"])

    def test_creates_three_separate_audit_streams(self):
        with tempfile.TemporaryDirectory() as directory:
            logs = AuditLogs(directory)
            logs.agent.write("model_response", "U1", "S1", content="ok")
            logs.authorization.write("user_confirmed", "U1", "S1", otp="123456")
            logs.risk_api.write("risk_decision", "U1", "S1", api_token="secret")

            self.assertEqual(
                "model_response",
                json.loads(logs.agent.path.read_text(encoding="utf-8"))["event"],
            )
            authorization = json.loads(logs.authorization.path.read_text(encoding="utf-8"))
            risk = json.loads(logs.risk_api.path.read_text(encoding="utf-8"))

        self.assertEqual("[REDACTED]", authorization["details"]["otp"])
        self.assertEqual("[REDACTED]", risk["details"]["api_token"])

    def test_does_not_treat_iso_microseconds_as_otp(self):
        value = "2026-09-11T10:07:47.360618+00:00"
        self.assertEqual(value, TraceLogger.redact(value))

    def test_frontend_log_projects_messages_tools_and_reasoning(self):
        with tempfile.TemporaryDirectory() as directory:
            log = FrontendEventLogger(Path(directory) / "frontend.jsonl")
            log.write("user_received", "U1", "S1", message="查余额")
            log.write(
                "supervisor_route", "U1", "S1", specialist="account",
                decision_summary="需要查询账户", tasks=[{"specialist": "account"}],
            )
            log.write(
                "tool_call", "U1", "S1", specialist="account", node_id="n1",
                tool="get_balance", arguments={"account_id": "A1", "otp": "123456"},
                attempt=1, result={"success": True, "data": {"balance": "20.00"}},
            )
            log.write(
                "agent_response", "U1", "S1", response="余额为 20 元",
                specialist="account", specialists=["account"],
            )
            records = [
                json.loads(line)
                for line in log.path.read_text(encoding="utf-8").splitlines()
            ]

        self.assertEqual(["message", "reasoning", "tool", "message"], [r["type"] for r in records])
        self.assertEqual([1, 2, 3, 4], [r["sequence"] for r in records])
        self.assertEqual(1, len({r["turn_id"] for r in records}))
        self.assertEqual("[REDACTED]", records[2]["arguments"]["otp"])
        self.assertNotIn("context", records[1])

    def test_frontend_tool_events_share_call_id_and_include_metadata(self):
        with tempfile.TemporaryDirectory() as directory:
            log = FrontendEventLogger(Path(directory) / "frontend.jsonl")
            common = {
                "specialist": "payment", "graph": "payment", "node_id": "check",
                "tool_call_id": "CALL1", "tool": "get_balance",
                "display_name": "查询账户余额",
                "domain": "account", "capability": "account.balance.read",
                "access": "read", "tags": ["account", "shared"],
                "arguments": {"account_id": "A1"}, "attempt": 1,
            }
            log.write("tool_call_started", "U1", "S1", **common)
            log.write(
                "tool_call", "U1", "S1", **common, duration_ms=12.5,
                result={"success": True, "data": {"balance": "20.00"}},
            )
            records = [
                json.loads(line)
                for line in log.path.read_text(encoding="utf-8").splitlines()
            ]

        self.assertEqual(["running", "completed"], [item["status"] for item in records])
        self.assertEqual({"CALL1"}, {item["tool_call_id"] for item in records})
        self.assertEqual("account.balance.read", records[1]["capability"])
        self.assertEqual("查询账户余额", records[1]["display_name"])
        self.assertEqual(12.5, records[1]["duration_ms"])

    def test_audit_logs_exposes_combined_agent_stream(self):
        with tempfile.TemporaryDirectory() as directory:
            logs = AuditLogs(directory)
            logs.agent_with_frontend.write("user_received", "U1", "S1", message="你好")

            audit = json.loads(logs.agent.path.read_text(encoding="utf-8"))
            frontend = json.loads(logs.frontend.path.read_text(encoding="utf-8"))

        self.assertEqual("user_received", audit["event"])
        self.assertEqual("message", frontend["type"])


if __name__ == "__main__":
    unittest.main()
