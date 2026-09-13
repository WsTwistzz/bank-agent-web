import json
import re
import threading
from datetime import datetime, timezone
from pathlib import Path


SECRET_FIELDS = {"api_key", "authorization", "credential", "otp", "password", "token"}


class TraceLogger:
    """Append-only JSONL trace with basic secret and OTP redaction."""

    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()

    def write(self, event, user_id, session_id, **details):
        record = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "event": event,
            "user_id": user_id,
            "session_id": session_id,
            "details": self.redact(details),
        }
        with self._lock:
            with self.path.open("a", encoding="utf-8") as log:
                log.write(json.dumps(record, ensure_ascii=False, default=str) + "\n")

    @classmethod
    def redact(cls, value, field=""):
        normalized_field = field.lower()
        if normalized_field in SECRET_FIELDS or any(
            normalized_field.endswith("_" + secret) for secret in SECRET_FIELDS
        ):
            return "[REDACTED]"
        if isinstance(value, dict):
            return {key: cls.redact(item, key) for key, item in value.items()}
        if isinstance(value, list):
            return [cls.redact(item) for item in value]
        if isinstance(value, str):
            # A six-digit fractional second in an ISO timestamp is not an OTP.
            return re.sub(r"(?<![\d.])\d{6}(?!\d)", "[REDACTED_OTP]", value)
        return value


class AuditLogs:
    """Three purpose-specific, append-only audit streams under one directory."""

    def __init__(self, directory):
        directory = Path(directory)
        self.agent = TraceLogger(directory / "agent_operations.jsonl")
        self.authorization = TraceLogger(directory / "user_authorizations.jsonl")
        self.risk_api = TraceLogger(directory / "risk_and_api.jsonl")
