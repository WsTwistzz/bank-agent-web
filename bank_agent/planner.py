import json
from typing import Any, Literal, TypedDict


NodeStatus = Literal["PENDING", "RUNNING", "WAITING", "SUCCEEDED", "FAILED", "SKIPPED"]
PlanStatus = Literal["ACTIVE", "WAITING", "SUCCEEDED", "FAILED"]


class PlanNode(TypedDict, total=False):
    id: str
    tool: str
    arguments: dict[str, Any]
    resolved_arguments: dict[str, Any]
    depends_on: list[str]
    status: NodeStatus
    output: Any
    error: str
    attempts: int


class TaskPlan(TypedDict):
    goal: str
    nodes: list[PlanNode]
    status: PlanStatus
    version: int


PLAN_TOOL = [{
    "type": "function",
    "function": {
        "name": "submit_task_plan",
        "description": "提交完成用户请求所需的工具调用 DAG；无需工具时提交空节点列表",
        "parameters": {
            "type": "object",
            "properties": {
                "goal": {"type": "string"},
                "nodes": {
                    "type": "array",
                    "maxItems": 10,
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": {"type": "string"},
                            "tool": {"type": "string"},
                            "arguments": {"type": "object"},
                            "depends_on": {
                                "type": "array",
                                "items": {"type": "string"},
                            },
                        },
                        "required": ["id", "tool", "arguments", "depends_on"],
                        "additionalProperties": False,
                    },
                },
            },
            "required": ["goal", "nodes"],
            "additionalProperties": False,
        },
    },
}]


class PlanningError(ValueError):
    pass


class Planner:
    def __init__(self, model, registry, max_nodes=10):
        self.model = model
        self.registry = registry
        self.max_nodes = max_nodes

    def create(self, message, allowed_tools=None, previous_plan=None, feedback=None):
        definitions = self.registry.definitions(allowed_tools)
        catalog = [{
            "name": item["function"]["name"],
            "description": item["function"]["description"],
            "parameters": item["function"]["parameters"],
        } for item in definitions]
        prompt = (
            "你是银行任务 Planner，只生成计划，不调用银行工具。"
            "把任务拆成最多 %d 个 DAG 节点，只能使用给定工具。"
            "depends_on 必须引用同一计划中的节点；没有依赖时使用空数组。"
            "后续节点可用 {\"$ref\": \"节点ID.output.字段路径\"} 引用直接或间接依赖的输出，"
            "数组索引支持 output.0.id 或 output[0].id。"
            "不要生成 user_id 或 session_id。信息不足或无需工具时使用空节点列表。"
            "必须调用 submit_task_plan。\n可用工具：%s"
        ) % (self.max_nodes, json.dumps(catalog, ensure_ascii=False))
        if previous_plan is not None:
            prompt += (
                "\n这是一次受控重规划。不要重复已经成功且仍可复用的查询；"
                "根据评估反馈生成完整的新计划。"
                f"\n上一计划：{json.dumps(previous_plan, ensure_ascii=False)}"
                f"\n评估反馈：{feedback or ''}"
            )
        reply = self.model.respond([
            {"role": "system", "content": prompt},
            {"role": "user", "content": message},
        ], PLAN_TOOL)
        calls = reply.get("tool_calls") or []
        if len(calls) != 1 or calls[0].get("name") != "submit_task_plan":
            raise PlanningError("Planner 未返回有效任务计划")
        payload = calls[0].get("arguments")
        if not isinstance(payload, dict):
            raise PlanningError("任务计划必须是对象")
        nodes = payload.get("nodes")
        if not isinstance(nodes, list):
            raise PlanningError("任务计划 nodes 必须是数组")
        if len(nodes) > self.max_nodes:
            raise PlanningError(f"任务计划最多允许 {self.max_nodes} 个节点")
        if any(not isinstance(node, dict) for node in nodes):
            raise PlanningError("任务计划的每个节点必须是对象")
        return {
            "goal": payload.get("goal", ""),
            "nodes": [{
                **node,
                "status": "PENDING",
                "attempts": 0,
            } for node in nodes],
            "status": "ACTIVE" if nodes else "SUCCEEDED",
            "version": (previous_plan or {}).get("version", 0) + 1,
        }
