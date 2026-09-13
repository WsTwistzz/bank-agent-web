import re
import uuid
from operator import add
from typing import Annotated, TypedDict

from langgraph.graph import END, START, StateGraph
from langgraph.types import Send

from bank_agent.aggregator import ResultAggregator
from bank_agent.autonomy import BudgetExceeded, ExecutionBudget
from bank_agent.dag_executor import ExecutionPolicy
from bank_agent.specialist import SpecialistAgent, SpecialistResult, SpecialistTask
from bank_agent.supervisor import SPECIALISTS, Supervisor


CONFIRM_WORDS = {"确认", "确认执行", "同意", "yes", "confirm"}
REJECT_WORDS = {"取消", "拒绝", "不同意", "no", "reject"}


def merge_specialist_results(left, right):
    """Accumulate parallel results while allowing each chat turn to reset the channel."""
    if right and right[0].get("_reset"):
        return right[1:]
    return left + right


class AgentState(TypedDict, total=False):
    user_id: str
    session_id: str
    messages: Annotated[list[dict], add]
    response: str
    specialist: str
    specialist_tasks: list[SpecialistTask]
    specialist_results: Annotated[list[SpecialistResult], merge_specialist_results]
    parallel: bool
    task: SpecialistTask
    request_id: str


class BankAgent:
    """LangGraph multi-agent orchestrator with deterministic banking controls."""

    def __init__(
        self,
        model,
        registry,
        banking_tools,
        checkpointer=None,
        max_steps=5,
        trace=None,
        mode="standard",
        models=None,
        execution_policy=None,
        max_plan_nodes=10,
        max_rounds=3,
        max_model_calls=12,
        timeout_seconds=90,
        max_parallelism=3,
    ):
        if mode not in {"standard", "expert"}:
            raise ValueError("mode must be standard or expert")
        self.model = model
        self.registry = registry
        self.banking_tools = banking_tools
        self.max_steps = max_steps
        self.trace = trace
        self.mode = mode
        self.models = models or {}
        self.max_rounds = max_rounds
        self.max_model_calls = max_model_calls
        self.timeout_seconds = timeout_seconds
        self._budgets = {}
        self.supervisor = Supervisor(
            self.models.get("supervisor", model), mode=mode,
            max_parallelism=max_parallelism,
        )
        planner_model = self.models.get("planner", model)
        self.specialists = {
            name: SpecialistAgent(
                name=name,
                model=self.models.get(name, model),
                planner_model=planner_model,
                registry=registry,
                banking_tools=banking_tools,
                max_steps=max_steps,
                max_plan_nodes=max_plan_nodes,
                execution_policy=execution_policy,
                trace=trace,
            )
            for name in SPECIALISTS
        }
        self.aggregator = ResultAggregator(
            self.models.get("aggregator", model), trace=trace
        )
        self.graph = self._build_graph().compile(checkpointer=checkpointer)

    def _build_graph(self):
        graph = StateGraph(AgentState)
        graph.add_node("route_input", self._route_input)
        graph.add_node("supervisor", self._supervisor)
        graph.add_node("run_specialist", self._run_specialist)
        graph.add_node("aggregate", self._aggregate)
        graph.add_edge(START, "route_input")
        graph.add_conditional_edges(
            "route_input",
            lambda state: "done" if state.get("response") else "route",
            {"done": END, "route": "supervisor"},
        )
        graph.add_conditional_edges("supervisor", self._dispatch_specialists)
        graph.add_edge("run_specialist", "aggregate")
        graph.add_edge("aggregate", END)
        return graph

    def chat(self, user_id, session_id, message):
        if not user_id or not session_id or not message.strip():
            raise ValueError("user_id, session_id and message are required")
        self.banking_tools.actions.create_session(user_id, session_id)
        self._trace("user_received", user_id, session_id, message=message)
        request_id = "REQ" + uuid.uuid4().hex.upper()
        self._budgets[request_id] = ExecutionBudget(
            self.max_rounds, self.max_model_calls, self.timeout_seconds
        )
        try:
            result = self.graph.invoke({
                "user_id": user_id,
                "session_id": session_id,
                "messages": [{"role": "user", "content": message}],
                "response": "",
                "specialist": "general",
                "specialist_tasks": [],
                "specialist_results": [{"_reset": True}],
                "parallel": False,
                "request_id": request_id,
            },
            config={"configurable": {"thread_id": session_id}},
            )
        finally:
            budget = self._budgets.pop(request_id)
            self._trace("budget_final", user_id, session_id, **budget.snapshot())
        specialists = [item["specialist"] for item in result.get("specialist_tasks", [])]
        self._trace(
            "agent_response", user_id, session_id,
            specialist=result.get("specialist"), specialists=specialists,
            response=result["response"],
        )
        return {
            "response": result["response"],
            "session_id": session_id,
            "specialist": result.get("specialist", "general"),
            "specialists": specialists,
        }

    def _route_input(self, state):
        user_id = state["user_id"]
        session_id = state["session_id"]
        pending_result = self.banking_tools.get_pending_action(user_id, session_id)
        pending = pending_result["data"] if pending_result["success"] else None
        if not pending:
            return {"response": ""}

        text = state["messages"][-1]["content"].strip().lower()
        self._trace(
            "pending_action_input", user_id, session_id,
            input=text, pending_action=pending,
        )
        if text in REJECT_WORDS:
            return self._action_response(
                self.banking_tools.reject_pending_action(user_id, session_id)
            )
        if pending["status"] == "WAITING_CONFIRMATION" and text in CONFIRM_WORDS:
            return self._action_response(
                self.banking_tools.confirm_pending_action(user_id, session_id)
            )
        if pending["status"] == "WAITING_STRONG_AUTH" and re.fullmatch(r"\d{6}", text):
            return self._action_response(
                self.banking_tools.verify_pending_action(user_id, session_id, text)
            )
        if pending["status"] == "WAITING_STRONG_AUTH" and text in {
            "发送验证码", "获取验证码", "send code",
        }:
            result = self.banking_tools.request_pending_verification(user_id, session_id)
            if result["success"]:
                return {"response": "验证码已发送，请输入 6 位验证码。"}
            return {"response": f'验证码发送失败：{result["error"]}'}
        return {"response": self._pending_prompt(pending)}

    def _supervisor(self, state):
        message = state["messages"][-1]["content"]
        self._consume_model_call(state, "supervisor")
        tasks, reason = self.supervisor.route(message)
        parallel = len(tasks) > 1
        specialist = tasks[0]["specialist"] if len(tasks) == 1 else "multi"
        self._trace(
            "supervisor_route", state["user_id"], state["session_id"],
            specialist=specialist, tasks=tasks, parallel=parallel,
            decision_summary=reason,
        )
        return {
            "specialist": specialist,
            "specialist_tasks": tasks,
            "parallel": parallel,
        }

    @staticmethod
    def _dispatch_specialists(state):
        return [
            Send("run_specialist", {
                "user_id": state["user_id"],
                "session_id": state["session_id"],
                "messages": state["messages"],
                "task": task,
                "parallel": state.get("parallel", False),
                "request_id": state["request_id"],
            })
            for task in state["specialist_tasks"]
        ]

    def _run_specialist(self, state):
        task = state["task"]
        agent = self.specialists[task["specialist"]]
        result = agent.run(
            task=task["task"],
            messages=state["messages"],
            user_id=state["user_id"],
            session_id=state["session_id"],
            request_id=state["request_id"],
            allow_writes=not state.get("parallel", False),
            budget=self._budgets[state["request_id"]],
        )
        return {"specialist_results": [result]}

    def _aggregate(self, state):
        order = {
            item["specialist"]: index
            for index, item in enumerate(state.get("specialist_tasks", []))
        }
        results = sorted(
            state.get("specialist_results", []),
            key=lambda item: order.get(item["specialist"], len(order)),
        )
        try:
            self._consume_model_call(state, "aggregator")
            response = self.aggregator.aggregate(
                results=results,
                user_message=state["messages"][-1]["content"],
                user_id=state["user_id"],
                session_id=state["session_id"],
            )
        except BudgetExceeded:
            response = "\n".join(
                f"{item['specialist']}：{item.get('response') or item.get('error', '失败')}"
                for item in results
            )
        return {"response": response}

    def _consume_model_call(self, state, role):
        budget = self._budgets[state["request_id"]]
        snapshot = budget.consume_model_call(role)
        self._trace(
            "budget_consumed", state["user_id"], state["session_id"],
            role=role, **snapshot,
        )

    def _trace(self, event, user_id, session_id, **details):
        if self.trace:
            self.trace.write(event, user_id, session_id, **details)

    @staticmethod
    def _pending_prompt(action):
        import json

        details = json.dumps(action.get("payload", {}), ensure_ascii=False, sort_keys=True)
        if action["status"] == "WAITING_CONFIRMATION":
            return f"操作等待确认：{action['action_type']} {details}。请明确回复“确认”或“取消”。"
        return f"操作需要强验证：{action['action_type']} {details}。请回复“发送验证码”或“取消”。"

    @staticmethod
    def _action_response(result):
        if not result["success"]:
            return {"response": f'操作失败：{result["error"]}'}
        action = result["data"]
        status = action.get("status", "UNKNOWN")
        return {"response": f"操作状态：{status}"}
