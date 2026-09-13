import unittest

from bank_agent.autonomy import ExecutionBudget
from bank_agent.specialist import SpecialistAgent
from tools.registry import ReadTool, ToolRegistry


class Banking:
    def __init__(self):
        self.calls = 0

    def get_accounts(self, user_id):
        self.calls += 1
        return {"success": True, "data": [{"id": f"A{self.calls}"}], "error": None}

    def get_pending_action(self, user_id, session_id):
        return {"success": True, "data": None, "error": None}


class RevisingPlanner:
    def __init__(self):
        self.calls = 0
        self.saw_previous = False

    def respond(self, messages, tools):
        self.calls += 1
        self.saw_previous |= "上一计划" in messages[0]["content"]
        return {"content": "", "tool_calls": [{
            "id": "plan", "name": "submit_task_plan",
            "arguments": {
                "goal": "查询账户",
                "nodes": [{
                    "id": f"query{self.calls}", "tool": "get_accounts",
                    "arguments": {}, "depends_on": [],
                }],
            },
        }]}


class EvaluatingModel:
    def __init__(self):
        self.evaluations = 0
        self.summaries = 0

    def respond(self, messages, tools):
        if tools:
            self.evaluations += 1
            sufficient = self.evaluations >= 2
            return {"content": "", "tool_calls": [{
                "id": "evaluation", "name": "submit_evaluation",
                "arguments": {
                    "sufficient": sufficient,
                    "reason": "信息充分" if sufficient else "需要再次核对",
                    "replan_instruction": "重新查询账户" if not sufficient else "",
                },
            }]}
        self.summaries += 1
        return {"content": "最终账户报告", "tool_calls": []}


class AutonomyLoopTest(unittest.TestCase):
    def test_read_only_task_replans_until_evaluator_is_satisfied(self):
        banking = Banking()
        registry = ToolRegistry([
            ReadTool(banking, "get_accounts", "accounts", "get_accounts")
        ])
        planner = RevisingPlanner()
        model = EvaluatingModel()
        specialist = SpecialistAgent(
            "account", model, planner, registry, banking
        )
        budget = ExecutionBudget(max_rounds=3, max_model_calls=8, timeout_seconds=10)

        result = specialist.run(
            "核对账户", [{"role": "user", "content": "核对账户"}],
            "U1", "S1", "REQ1", budget=budget,
        )

        self.assertEqual(result["response"], "最终账户报告")
        self.assertEqual([plan["version"] for plan in result["plans"]], [1, 2])
        self.assertEqual(planner.calls, 2)
        self.assertTrue(planner.saw_previous)
        self.assertEqual(model.evaluations, 2)
        self.assertEqual(model.summaries, 1)
        self.assertEqual(budget.model_calls, 5)


if __name__ == "__main__":
    unittest.main()
