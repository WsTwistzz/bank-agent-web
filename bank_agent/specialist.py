import json
from dataclasses import dataclass
from typing import Any, TypedDict

from bank_agent.autonomy import BudgetExceeded, ResultEvaluator
from bank_agent.dag_executor import DagExecutor, ExecutionPolicy
from bank_agent.plan_validator import PlanValidationError, PlanValidator
from bank_agent.planner import Planner, PlanningError, TaskPlan
from bank_agent.supervisor import SPECIALISTS


class SpecialistTask(TypedDict):
    specialist: str
    task: str


class SpecialistResult(TypedDict, total=False):
    specialist: str
    task: str
    response: str
    plan: TaskPlan
    error: str


@dataclass
class SpecialistAgent:
    name: str
    model: Any
    planner_model: Any
    registry: Any
    banking_tools: Any
    max_steps: int = 5
    max_plan_nodes: int = 10
    execution_policy: ExecutionPolicy | None = None
    trace: Any = None

    def __post_init__(self):
        if self.name not in SPECIALISTS:
            raise ValueError(f"unknown specialist: {self.name}")
        self.planner = Planner(
            self.planner_model, self.registry, max_nodes=self.max_plan_nodes
        )
        self.validator = PlanValidator(
            self.registry, max_nodes=self.max_plan_nodes
        )
        self.executor = DagExecutor(
            self.registry, policy=self.execution_policy, trace=self.trace
        )
        self.evaluator = ResultEvaluator(self.model)

    def run(self, task, messages, user_id, session_id, request_id, allow_writes=True, budget=None):
        allowed = self._allowed_tools(allow_writes)
        previous_plan = None
        feedback = None
        plans = []
        try:
            while True:
                round_number = budget.begin_round(self.name) if budget else len(plans) + 1
                if budget:
                    budget.consume_model_call("planner")
                plan = self.planner.create(task, allowed, previous_plan, feedback)
                self.validator.validate(plan, allowed)
                self._trace(
                    "specialist_plan_validated", user_id, session_id,
                    specialist=self.name, task=task, round=round_number, plan=plan,
                    budget=budget.snapshot() if budget else None,
                )
                plan = self.executor.execute(
                    plan, user_id=user_id, session_id=session_id,
                    request_id=request_id, specialist=self.name,
                )
                plans.append(plan)
                pending = self.banking_tools.get_pending_action(user_id, session_id)
                if pending["success"] and pending["data"]:
                    return {
                        "specialist": self.name, "task": task,
                        "response": self._pending_prompt(pending["data"]),
                        "plan": plan, "plans": plans,
                    }
                has_write = any(self.registry.is_write(node["tool"]) for node in plan["nodes"])
                if has_write or plan["status"] != "SUCCEEDED" or not plan["nodes"]:
                    break
                if budget and round_number >= budget.max_rounds:
                    break
                if budget:
                    budget.consume_model_call("evaluator")
                evaluation = self.evaluator.evaluate(task, plan)
                self._trace(
                    "specialist_evaluated", user_id, session_id,
                    specialist=self.name, round=round_number,
                    evaluation=evaluation, budget=budget.snapshot() if budget else None,
                )
                if evaluation.get("sufficient", True):
                    break
                previous_plan = plan
                feedback = evaluation.get("replan_instruction") or evaluation.get("reason", "")
                self._trace(
                    "specialist_replan_requested", user_id, session_id,
                    specialist=self.name, next_round=round_number + 1,
                    feedback=feedback,
                )
        except (PlanningError, PlanValidationError, BudgetExceeded) as error:
            self._trace(
                "specialist_stopped", user_id, session_id,
                specialist=self.name, task=task, error=str(error),
                budget=budget.snapshot() if budget else None,
            )
            return {
                "specialist": self.name, "task": task, "response": "",
                "error": (
                    f"任务计划未通过安全验证：{error}"
                    if isinstance(error, PlanValidationError) else str(error)
                ), "plans": plans,
            }

        request = [
            {"role": "system", "content": SPECIALISTS[self.name]["prompt"]},
            {"role": "system", "content": "工具执行已经结束。只根据执行结果总结，不得调用工具或编造结果。"},
            {"role": "system", "content": f"你的委派任务：{task}"},
            {"role": "system", "content": f"已执行的任务计划：{json.dumps(plan, ensure_ascii=False)}"},
            *messages,
        ]
        self._trace(
            "model_request", user_id, session_id,
            specialist=self.name, context=request, available_tools=[],
        )
        try:
            if budget:
                budget.consume_model_call("specialist_summary")
            reply = self.model.respond(request, [])
        except BudgetExceeded as error:
            return {
                "specialist": self.name, "task": task,
                "response": self._execution_response(plan), "plan": plan,
                "plans": plans, "error": str(error),
            }
        calls = reply.get("tool_calls") or []
        if calls:
            self._trace(
                "unplanned_tool_calls_rejected", user_id, session_id,
                specialist=self.name, tool_calls=calls,
            )
        response = reply.get("content", "").strip()
        if not response:
            response = self._execution_response(plan)
        self._trace(
            "model_response", user_id, session_id,
            specialist=self.name, content=response, tool_calls=[],
        )
        return {
            "specialist": self.name,
            "task": task,
            "response": response,
            "plan": plan,
            "plans": plans,
            **({"error": "one or more plan nodes failed"} if plan["status"] == "FAILED" else {}),
        }

    def _allowed_tools(self, allow_writes):
        allowed = SPECIALISTS[self.name]["tools"]
        if allowed is None:
            allowed = set(self.registry.tools)
        else:
            allowed = set(allowed)
        if not allow_writes:
            allowed = {
                name for name in allowed
                if not self.registry.is_write(name)
            }
        return allowed

    def _trace(self, event, user_id, session_id, **details):
        if self.trace:
            self.trace.write(event, user_id, session_id, **details)

    @staticmethod
    def _execution_response(plan):
        failed = [node for node in plan["nodes"] if node["status"] == "FAILED"]
        if failed:
            details = "；".join(f"{node['id']}: {node.get('error', '未知错误')}" for node in failed)
            return "任务执行失败：" + details
        if not plan["nodes"]:
            return "这个请求不需要调用银行工具，但模型没有返回有效回复。"
        return "任务计划已执行完成。"

    @staticmethod
    def _pending_prompt(action):
        from bank_agent.action_messages import pending_action_prompt

        return pending_action_prompt(action)
