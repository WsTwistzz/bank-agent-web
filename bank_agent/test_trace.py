import json
import tempfile
import unittest
from pathlib import Path

from bank_agent.trace import AuditLogs, TraceLogger


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
            record = json.loads(path.read_text())
        self.assertEqual("[REDACTED]", record["details"]["credential"])
        self.assertEqual("验证码是 [REDACTED_OTP]", record["details"]["context"]["content"])
        self.assertEqual("20.00", record["details"]["arguments"]["amount"])

    def test_creates_three_separate_audit_streams(self):
        with tempfile.TemporaryDirectory() as directory:
            logs = AuditLogs(directory)
            logs.agent.write("model_response", "U1", "S1", content="ok")
            logs.authorization.write("user_confirmed", "U1", "S1", otp="123456")
            logs.risk_api.write("risk_decision", "U1", "S1", api_token="secret")

            self.assertEqual("model_response", json.loads(logs.agent.path.read_text())["event"])
            authorization = json.loads(logs.authorization.path.read_text())
            risk = json.loads(logs.risk_api.path.read_text())

        self.assertEqual("[REDACTED]", authorization["details"]["otp"])
        self.assertEqual("[REDACTED]", risk["details"]["api_token"])

    def test_does_not_treat_iso_microseconds_as_otp(self):
        value = "2026-09-11T10:07:47.360618+00:00"
        self.assertEqual(value, TraceLogger.redact(value))


if __name__ == "__main__":
    unittest.main()
