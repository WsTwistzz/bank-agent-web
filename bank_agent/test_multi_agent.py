import tempfile
import threading
import time
import unittest
from pathlib import Path

from actions import OTPVerifier
from bank_agent import BankAgent
from tools import BankingTools, create_bank_action_service, create_banking_tool_registry

from bank_agent.test_agent import FakeGateway


class RoutingModel:
    def __init__(self, tasks):
        self.tasks = tasks

    def respond(self, messages, tools):
        return {"content": "", "tool_calls": [{
            "id": "route",
            "name": "route_to_agents",
            "arguments": {"tasks": self.tasks, "reason": "cross-domain"},
        }]}


class PlanningModel:
    def respond(self, messages, tools):
        return {"content": "", "tool_calls": [{
            "id": "plan",
            "name": "submit_task_plan",
            "arguments": {"goal": "answer", "nodes": []},
        }]}


class ToolPlanningModel:
    def respond(self, messages, tools):
        task = messages[-1]["content"]
        tool = "get_accounts" if "账户" in task else "get_investment_products"
        return {"content": "", "tool_calls": [{
            "id": "plan",
            "name": "submit_task_plan",
            "arguments": {
                "goal": task,
                "nodes": [{
                    "id": "query",
                    "tool": tool,
                    "arguments": {},
                    "depends_on": [],
                }],
            },
        }]}


class BarrierSpecialistModel:
    def __init__(self, name, barrier):
        self.name = name
        self.barrier = barrier
        self.thread_id = None

    def respond(self, messages, tools):
        self.thread_id = threading.get_ident()
        self.barrier.wait(timeout=2)
        time.sleep(0.02)
        return {"content": f"{self.name} result", "tool_calls": []}


class AggregatorModel:
    def __init__(self):
        self.calls = 0

    def respond(self, messages, tools):
        self.calls += 1
        self.asserted_no_tools = tools == []
        return {"content": "combined result", "tool_calls": []}


class ForbiddenWriteModel:
    def respond(self, messages, tools):
        names = {item["function"]["name"] for item in tools}
        if "request_transfer" in names:
            raise AssertionError("write tool leaked into parallel specialist")
        return {"content": "operations read-only result", "tool_calls": []}


class ToolUsingSpecialistModel:
    def __init__(self, name, tool_name, barrier):
        self.name = name
        self.tool_name = tool_name
        self.barrier = barrier
        self.calls = 0

    def respond(self, messages, tools):
        self.calls += 1
        return {"content": f"{self.name} 已根据工具结果完成查询", "tool_calls": []}


class MultiAgentTest(unittest.TestCase):
    def build(self, models, mode="expert"):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        root = Path(directory.name)
        gateway = FakeGateway()
        otp = OTPVerifier(lambda user, code: None, root / "otp.db")
        actions = create_bank_action_service(gateway, root / "actions.db", otp)
        banking = BankingTools(gateway, actions)
        registry = create_banking_tool_registry(banking)
        fallback = models.get("general") or next(iter(models.values()))
        return BankAgent(
            fallback, registry, banking, mode=mode, models=models,
        )

    def test_expert_mode_runs_specialists_in_parallel_and_aggregates_once(self):
        tasks = [
            {"specialist": "account", "task": "查询账户"},
            {"specialist": "investment", "task": "查询持仓"},
        ]
        barrier = threading.Barrier(2)
        account = BarrierSpecialistModel("account", barrier)
        investment = BarrierSpecialistModel("investment", barrier)
        aggregator = AggregatorModel()
        agent = self.build({
            "supervisor": RoutingModel(tasks),
            "planner": PlanningModel(),
            "account": account,
            "investment": investment,
            "aggregator": aggregator,
        })

        result = agent.chat("U1", "S1", "查看余额和理财持仓")

        self.assertEqual(result["response"], "combined result")
        self.assertEqual(result["specialist"], "multi")
        self.assertEqual(result["specialists"], ["account", "investment"])
        self.assertNotEqual(account.thread_id, investment.thread_id)
        self.assertEqual(aggregator.calls, 1)
        self.assertTrue(aggregator.asserted_no_tools)

    def test_cross_domain_case_runs_real_read_tools_and_combines_results(self):
        tasks = [
            {"specialist": "account", "task": "查询用户的所有银行账户"},
            {"specialist": "investment", "task": "查询当前可购买的理财产品"},
        ]
        barrier = threading.Barrier(2)
        account = ToolUsingSpecialistModel("account", "get_accounts", barrier)
        investment = ToolUsingSpecialistModel(
            "investment", "get_investment_products", barrier
        )
        aggregator = AggregatorModel()
        agent = self.build({
            "supervisor": RoutingModel(tasks),
            "planner": ToolPlanningModel(),
            "account": account,
            "investment": investment,
            "aggregator": aggregator,
        })

        result = agent.chat(
            "U1", "CASE-S1",
            "请同时查询我的所有银行账户，以及当前可购买的理财产品，并合并成一份简洁报告。",
        )

        self.assertEqual(result["specialists"], ["account", "investment"])
        self.assertEqual(account.calls, 2)
        self.assertEqual(investment.calls, 2)
        self.assertEqual(aggregator.calls, 1)
        self.assertEqual(result["response"], "combined result")
        self.assertIsNone(agent.banking_tools.get_pending_action("U1", "CASE-S1")["data"])

    def test_parallel_specialists_receive_same_trusted_runtime_identity(self):
        tasks = [
            {"specialist": "account", "task": "查询账户"},
            {"specialist": "investment", "task": "查询持仓"},
        ]
        barrier = threading.Barrier(2)
        models = {
            "supervisor": RoutingModel(tasks),
            "planner": PlanningModel(),
            "account": BarrierSpecialistModel("account", barrier),
            "investment": BarrierSpecialistModel("investment", barrier),
            "aggregator": AggregatorModel(),
        }
        agent = self.build(models)
        received = []
        for name in ("account", "investment"):
            original = agent.specialists[name].run

            def record(*args, _original=original, **kwargs):
                received.append((kwargs["user_id"], kwargs["session_id"], kwargs["request_id"]))
                return _original(*args, **kwargs)

            agent.specialists[name].run = record

        agent.chat("U1", "TRUSTED-SESSION", "查看余额和理财持仓")

        self.assertEqual(2, len(received))
        self.assertEqual({("U1", "TRUSTED-SESSION")}, {(u, s) for u, s, _ in received})
        self.assertEqual(1, len({request_id for _, _, request_id in received}))

    def test_standard_mode_keeps_only_one_specialist(self):
        tasks = [
            {"specialist": "account", "task": "查询账户"},
            {"specialist": "investment", "task": "查询持仓"},
        ]
        agent = self.build({
            "supervisor": RoutingModel(tasks),
            "planner": PlanningModel(),
            "account": lambda: None,
        }, mode="standard")
        agent.specialists["account"].model = type("Model", (), {
            "respond": lambda self, messages, tools: {
                "content": "account only", "tool_calls": []
            }
        })()

        result = agent.chat("U1", "S1", "查看余额和持仓")

        self.assertEqual(result["response"], "account only")
        self.assertEqual(result["specialists"], ["account"])

    def test_parallel_operations_agent_never_receives_write_tools(self):
        tasks = [
            {"specialist": "operations", "task": "查询银行卡"},
            {"specialist": "account", "task": "查询账户"},
        ]
        agent = self.build({
            "supervisor": RoutingModel(tasks),
            "planner": PlanningModel(),
            "operations": ForbiddenWriteModel(),
            "account": type("Model", (), {
                "respond": lambda self, messages, tools: {
                    "content": "account result", "tool_calls": []
                }
            })(),
            "aggregator": AggregatorModel(),
        })

        result = agent.chat("U1", "S1", "查询银行卡和余额")

        self.assertEqual(result["response"], "combined result")


if __name__ == "__main__":
    unittest.main()
