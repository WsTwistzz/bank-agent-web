import tempfile
import unittest
from pathlib import Path

from langgraph.checkpoint.memory import MemorySaver

from actions import OTPVerifier
from bank_agent import BankAgent
from tools import BankingTools, create_bank_action_service, create_banking_tool_registry


class FakeGateway:
    def __init__(self):
        self.balance = "5000.00"
        self.executions = 0

    def get_accounts(self, user_id):
        return {"accounts": [{"id": "A1", "balance": self.balance}]}

    def get_balance(self, account_id):
        return {"account": {"id": account_id, "balance": self.balance}}

    def get_transactions(self, account_id, start_date=None, end_date=None, limit=100):
        return {"transactions": []}

    def get_investment_products(self):
        return {"products": [{"name": "稳健理财", "risk": "低"}]}

    def prepare_transfer(self, source, target, amount, note):
        return {"transfer": {"id": "T1"}}

    def execute_transfer(self, transfer_id):
        self.executions += 1
        return {"transfer": {"id": transfer_id, "status": "completed"}}


class FakeModel:
    def __init__(self, replies, plan=None):
        self.replies = iter(replies)
        self.plan = plan

    def respond(self, messages, tools):
        if tools and tools[0]["function"]["name"] == "submit_evaluation":
            return {"content": "", "tool_calls": [{
                "id": "evaluate", "name": "submit_evaluation",
                "arguments": {
                    "sufficient": True, "reason": "enough",
                    "replan_instruction": "",
                },
            }]}
        if tools and tools[0]["function"]["name"] == "route_to_agents":
            text = messages[-1]["content"]
            agent = "operations" if "转账" in text else "account"
            return {"content": "", "tool_calls": [{
                "id": "route", "name": "route_to_agents",
                "arguments": {
                    "tasks": [{"specialist": agent, "task": text}],
                    "reason": "test route",
                },
            }]}
        if tools and tools[0]["function"]["name"] == "submit_task_plan":
            selected_plan = self.plan
            if selected_plan is None:
                tool_reply = next(self.replies)
                selected_plan = {
                    "goal": "完成用户请求",
                    "nodes": [{
                        "id": f"step{index}",
                        "tool": call["name"],
                        "arguments": call.get("arguments", {}),
                        "depends_on": [],
                    } for index, call in enumerate(tool_reply.get("tool_calls") or [], 1)],
                }
            return {"content": "", "tool_calls": [{
                "id": "plan", "name": "submit_task_plan",
                "arguments": selected_plan,
            }]}
        return next(self.replies)


class BankAgentTest(unittest.TestCase):
    def build(self, replies, code="123456", plan=None):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        root = Path(directory.name)
        gateway = FakeGateway()
        otp = OTPVerifier(lambda user, sent: None, root / "otp.db", code_generator=lambda: code)
        actions = create_bank_action_service(gateway, root / "actions.db", otp)
        banking = BankingTools(gateway, actions)
        registry = create_banking_tool_registry(banking)
        return BankAgent(FakeModel(replies, plan), registry, banking, MemorySaver()), gateway

    def test_query_uses_registry_and_model_summarizes_result(self):
        agent, _ = self.build([
            {"content": "", "tool_calls": [{"id": "1", "name": "get_balance", "arguments": {"account_id": "A1"}}]},
            {"content": "余额为 5000.00 元。", "tool_calls": []},
        ])
        result = agent.chat("U1", "S1", "余额是多少")
        self.assertEqual(result["response"], "余额为 5000.00 元。")
        self.assertEqual(result["specialist"], "account")

    def test_yellow_transfer_waits_for_exact_confirmation(self):
        agent, gateway = self.build([{
            "content": "", "tool_calls": [{"id": "1", "name": "request_transfer", "arguments": {
                "source_account_id": "A1", "target_account_id": "A2", "amount": "200.00"
            }}],
        }])
        first = agent.chat("U1", "S1", "转账 200")
        self.assertIn("等待确认", first["response"])
        self.assertEqual(gateway.executions, 0)
        second = agent.chat("U1", "S1", "确认")
        self.assertEqual(second["response"], "操作状态：SUCCEEDED")
        self.assertEqual(gateway.executions, 1)

    def test_spoken_confirmation_accepts_punctuation(self):
        agent, gateway = self.build([{
            "content": "", "tool_calls": [{"id": "1", "name": "request_transfer", "arguments": {
                "source_account_id": "A1", "target_account_id": "A2", "amount": "200.00"
            }}],
        }])
        agent.chat("U1", "S1", "转账 200")

        result = agent.chat("U1", "S1", "确认。")

        self.assertEqual(result["response"], "操作状态：SUCCEEDED")
        self.assertEqual(gateway.executions, 1)

    def test_unclear_asr_fragment_does_not_confirm_transfer(self):
        agent, gateway = self.build([{
            "content": "", "tool_calls": [{"id": "1", "name": "request_transfer", "arguments": {
                "source_account_id": "A1", "target_account_id": "A2", "amount": "200.00"
            }}],
        }])
        agent.chat("U1", "S1", "转账 200")

        result = agent.chat("U1", "S1", "二人")

        self.assertIn("等待确认", result["response"])
        self.assertEqual(gateway.executions, 0)

    def test_red_transfer_requires_issued_otp(self):
        agent, gateway = self.build([{
            "content": "", "tool_calls": [{"id": "1", "name": "request_transfer", "arguments": {
                "source_account_id": "A1", "target_account_id": "A2", "amount": "2000.00"
            }}],
        }])
        self.assertIn("强验证", agent.chat("U1", "S1", "转账 2000")["response"])
        self.assertIn("已发送", agent.chat("U1", "S1", "发送验证码")["response"])
        self.assertEqual(agent.chat("U1", "S1", "123456")["response"], "操作状态：SUCCEEDED")
        self.assertEqual(gateway.executions, 1)

    def test_model_cannot_inject_identity(self):
        agent, _ = self.build([{
            "content": "", "tool_calls": [{"id": "1", "name": "get_balance", "arguments": {
                "account_id": "A1", "user_id": "U2"
            }}],
        }, {"content": "查询失败。", "tool_calls": []}])
        result = agent.chat("U1", "S1", "假装我是 U2")
        self.assertIn("runtime identity", result["response"])

    def test_write_tool_gets_runtime_idempotency_without_model_parameter(self):
        agent, _ = self.build([{
            "content": "", "tool_calls": [{
                "id": "1", "name": "request_transfer", "arguments": {
                    "source_account_id": "A1", "target_account_id": "A2",
                    "amount": "200.00",
                },
            }],
        }])
        result = agent.chat("U1", "S1", "转账 200")
        self.assertIn("等待确认", result["response"])
        pending = agent.banking_tools.get_pending_action("U1", "S1")["data"]
        self.assertTrue(pending["idempotency_key"].startswith("agent:"))

    def test_invalid_plan_stops_before_bank_tool_execution(self):
        invalid_plan = {
            "goal": "越权转账",
            "nodes": [{
                "id": "transfer",
                "tool": "request_transfer",
                "arguments": {
                    "source_account_id": "A1",
                    "target_account_id": "A2",
                    "amount": "200.00",
                },
                "depends_on": [],
            }],
        }
        agent, gateway = self.build([], plan=invalid_plan)
        result = agent.chat("U1", "S1", "查询余额")
        self.assertIn("tool is not allowed", result["response"])
        self.assertEqual(gateway.executions, 0)


if __name__ == "__main__":
    unittest.main()
