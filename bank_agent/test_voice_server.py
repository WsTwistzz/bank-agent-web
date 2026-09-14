import unittest
from types import SimpleNamespace

from bank_agent.voice_server import _fast_voice_response


class FakeTools:
    def get_accounts(self, user_id):
        return {"success": True, "data": [
            {"id": "A1004", "name": "测试账户", "balance": "500000.00", "status": "active"}
        ], "error": None}

    def find_payee(self, user_id, query):
        if query.lower() in {"alice", "爱丽丝", "艾丽丝"}:
            return {"success": True, "data": [
                {"name": "Alice", "account_id": "A1001"}
            ], "error": None}
        return {"success": True, "data": [], "error": None}

    def request_transfer(self, *args, **kwargs):
        return {"success": True, "data": {"status": "WAITING_CONFIRMATION"}, "error": None}


class VoiceFastPathTest(unittest.TestCase):
    def setUp(self):
        self.runtime = SimpleNamespace(banking_tools=FakeTools())

    def test_balance_is_answered_without_agent(self):
        response = _fast_voice_response(self.runtime, "U4", "S1", "帮我查询账户余额")
        self.assertIn("500000.00", response)

    def test_bilingual_payee_without_amount_prompts_immediately(self):
        response = _fast_voice_response(
            self.runtime, "U4", "S1", "你可以帮我给爱丽丝转账吗",
        )
        self.assertEqual("可以给Alice转账。请告诉我具体转账金额。", response)

    def test_bilingual_payee_with_amount_creates_pending_action(self):
        response = _fast_voice_response(
            self.runtime, "U4", "S1", "给爱丽丝转账一千元",
        )
        self.assertIn("待确认申请", response)


if __name__ == "__main__":
    unittest.main()
