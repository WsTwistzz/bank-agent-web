import json
import re
import threading
import uuid
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


class FrontendEventLogger:
    """Compact JSONL event stream intended for conversation UIs.

    This is deliberately a projection of the audit trace, not a second audit
    log.  It records user-visible messages, tool activity and short decision
    summaries, while omitting model prompts and private chain-of-thought.
    """

    MAX_TEXT_LENGTH = 2_000
    MAX_COLLECTION_ITEMS = 50

    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._turns = {}
        self._sequences = {}

    def write(self, event, user_id, session_id, **details):
        projected = self._project(event, details)
        if projected is None:
            return
        key = (user_id, session_id)
        with self._lock:
            if event == "user_received" or key not in self._turns:
                self._turns[key] = "TURN" + uuid.uuid4().hex.upper()
                self._sequences[key] = 0
            self._sequences[key] += 1
            record = {
                "event_id": "EVT" + uuid.uuid4().hex.upper(),
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "sequence": self._sequences[key],
                "type": projected.pop("type"),
                "user_id": user_id,
                "session_id": session_id,
                "turn_id": self._turns[key],
                **projected,
            }
            record = TraceLogger.redact(self._compact(record))
            with self.path.open("a", encoding="utf-8") as log:
                log.write(json.dumps(record, ensure_ascii=False, default=str) + "\n")

    def _project(self, event, details):
        if event == "user_received":
            return {
                "type": "message", "role": "user",
                "content": details.get("message", ""), "status": "completed",
            }
        if event == "agent_response":
            return {
                "type": "message", "role": "assistant",
                "content": details.get("response", ""), "status": "completed",
                "specialist": details.get("specialist"),
                "specialists": details.get("specialists", []),
            }
        if event == "supervisor_route":
            return {
                "type": "reasoning", "stage": "routing", "status": "completed",
                "summary": details.get("decision_summary") or "已选择处理该请求的专业 Agent。",
                "specialist": details.get("specialist"),
                "tasks": details.get("tasks", []),
            }
        if event == "specialist_plan_validated":
            plan = details.get("plan") or {}
            nodes = plan.get("nodes", [])
            return {
                "type": "reasoning", "stage": "planning", "status": "completed",
                "summary": f"{details.get('specialist', 'agent')} 已生成 {len(nodes)} 步工具执行计划。",
                "specialist": details.get("specialist"),
                "round": details.get("round"),
                "steps": [
                    {"id": node.get("id"), "tool": node.get("tool"),
                     "depends_on": node.get("depends_on", [])}
                    for node in nodes
                ],
            }
        if event == "tool_call_started":
            return {
                "type": "tool", "status": "running",
                "tool": details.get("tool"), "node_id": details.get("node_id"),
                "tool_call_id": details.get("tool_call_id"),
                "display_name": details.get("display_name"),
                "specialist": details.get("specialist"),
                "graph": details.get("graph"),
                "domain": details.get("domain"),
                "capability": details.get("capability"),
                "access": details.get("access"),
                "tags": details.get("tags", []),
                "arguments": details.get("arguments", {}),
                "attempt": details.get("attempt"),
            }
        if event == "tool_call":
            result = details.get("result") or {}
            return {
                "type": "tool",
                "status": "completed" if result.get("success") else "failed",
                "tool": details.get("tool"), "node_id": details.get("node_id"),
                "tool_call_id": details.get("tool_call_id"),
                "display_name": details.get("display_name"),
                "specialist": details.get("specialist"),
                "graph": details.get("graph"),
                "domain": details.get("domain"),
                "capability": details.get("capability"),
                "access": details.get("access"),
                "tags": details.get("tags", []),
                "arguments": details.get("arguments", {}),
                "result": result, "attempt": details.get("attempt"),
                "duration_ms": details.get("duration_ms"),
            }
        if event == "specialist_evaluated":
            evaluation = details.get("evaluation") or {}
            return {
                "type": "reasoning", "stage": "evaluation", "status": "completed",
                "summary": evaluation.get("reason") or "已检查工具结果是否足够回答请求。",
                "specialist": details.get("specialist"),
                "sufficient": evaluation.get("sufficient"),
            }
        if event == "specialist_replan_requested":
            return {
                "type": "reasoning", "stage": "replanning", "status": "running",
                "summary": details.get("feedback") or "现有信息不足，正在调整执行计划。",
                "specialist": details.get("specialist"),
            }
        if event in {"specialist_stopped", "voice_error"}:
            return {
                "type": "error", "status": "failed",
                "summary": details.get("error") or "Agent 运行失败。",
                "specialist": details.get("specialist"),
            }
        return None

    @classmethod
    def _compact(cls, value):
        if isinstance(value, dict):
            items = list(value.items())[:cls.MAX_COLLECTION_ITEMS]
            compacted = {key: cls._compact(item) for key, item in items if item is not None}
            if len(value) > cls.MAX_COLLECTION_ITEMS:
                compacted["_truncated"] = True
            return compacted
        if isinstance(value, list):
            compacted = [cls._compact(item) for item in value[:cls.MAX_COLLECTION_ITEMS]]
            if len(value) > cls.MAX_COLLECTION_ITEMS:
                compacted.append({"_truncated": True, "total_items": len(value)})
            return compacted
        if isinstance(value, str):
            return value if len(value) <= cls.MAX_TEXT_LENGTH else value[:cls.MAX_TEXT_LENGTH] + "…"
        return value


class CompositeTraceLogger:
    """Fan out the same trace event to multiple append-only loggers."""

    def __init__(self, *loggers):
        self.loggers = loggers

    def write(self, event, user_id, session_id, **details):
        for logger in self.loggers:
            logger.write(event, user_id, session_id, **details)


class AuditLogs:
    """Three purpose-specific, append-only audit streams under one directory."""

    def __init__(self, directory):
        directory = Path(directory)
        self.agent = TraceLogger(directory / "agent_operations.jsonl")
        self.frontend = FrontendEventLogger(directory / "frontend_events.jsonl")
        self.agent_with_frontend = CompositeTraceLogger(self.agent, self.frontend)
        self.authorization = TraceLogger(directory / "user_authorizations.jsonl")
        self.risk_api = TraceLogger(directory / "risk_and_api.jsonl")
