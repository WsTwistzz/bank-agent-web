import threading
import time


class BudgetExceeded(RuntimeError):
    pass


class ExecutionBudget:
    def __init__(self, max_rounds=3, max_model_calls=12, timeout_seconds=90):
        self.max_rounds = max_rounds
        self.max_model_calls = max_model_calls
        self.timeout_seconds = timeout_seconds
        self.started_at = time.monotonic()
        self.model_calls = 0
        self.rounds = {}
        self._lock = threading.Lock()

    def consume_model_call(self, role):
        with self._lock:
            self._check_time()
            if self.model_calls >= self.max_model_calls:
                raise BudgetExceeded("model call budget exceeded")
            self.model_calls += 1
            return self.snapshot()

    def begin_round(self, specialist):
        with self._lock:
            self._check_time()
            current = self.rounds.get(specialist, 0)
            if current >= self.max_rounds:
                raise BudgetExceeded("autonomy round budget exceeded")
            self.rounds[specialist] = current + 1
            return self.rounds[specialist]

    def remaining_time(self):
        return max(0.0, self.timeout_seconds - (time.monotonic() - self.started_at))

    def snapshot(self):
        return {
            "model_calls": self.model_calls,
            "max_model_calls": self.max_model_calls,
            "rounds": dict(self.rounds),
            "max_rounds": self.max_rounds,
            "elapsed_seconds": round(time.monotonic() - self.started_at, 3),
            "timeout_seconds": self.timeout_seconds,
        }

    def _check_time(self):
        if time.monotonic() - self.started_at >= self.timeout_seconds:
            raise BudgetExceeded("agent timeout exceeded")


EVALUATION_TOOL = [{
    "type": "function",
    "function": {
        "name": "submit_evaluation",
        "description": "评估只读任务结果是否足以回答委派任务",
        "parameters": {
            "type": "object",
            "properties": {
                "sufficient": {"type": "boolean"},
                "reason": {"type": "string"},
                "replan_instruction": {"type": "string"},
            },
            "required": ["sufficient", "reason", "replan_instruction"],
            "additionalProperties": False,
        },
    },
}]


class ResultEvaluator:
    def __init__(self, model):
        self.model = model

    def evaluate(self, task, plan):
        import json
        reply = self.model.respond([
            {"role": "system", "content": "你是只读任务评估器。只调用 submit_evaluation。结果足以回答任务时 sufficient=true；仅在缺少可通过现有只读工具补充的信息时要求重规划。"},
            {"role": "user", "content": task},
            {"role": "user", "content": json.dumps(plan, ensure_ascii=False)},
        ], EVALUATION_TOOL)
        calls = reply.get("tool_calls") or []
        if len(calls) != 1 or calls[0].get("name") != "submit_evaluation":
            return {"sufficient": True, "reason": "invalid evaluator response; stopped safely", "replan_instruction": ""}
        value = calls[0].get("arguments", {})
        if not isinstance(value.get("sufficient"), bool):
            return {"sufficient": True, "reason": "invalid evaluator response; stopped safely", "replan_instruction": ""}
        return value
