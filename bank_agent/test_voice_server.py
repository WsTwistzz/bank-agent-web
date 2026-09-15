import json
import unittest
from types import SimpleNamespace

from bank_agent.voice_server import _event, _fast_voice_response


class FakeTools:
    class Actions:
        def __init__(self):
            self.sessions = []

        def create_session(self, user_id, session_id):
            self.sessions.append((user_id, session_id))

    def __init__(self):
        self.actions = self.Actions()

    def get_accounts(self, user_id):
        return {"success": True, "data": [
            {"id": "A1004", "name": "测试账户", "balance": "500000.00", "status": "active"}
        ], "error": None}

    def get_payees(self, user_id):
        return {"success": True, "data": [
            {"name": "Alice", "account_id": "A1001", "phone": "13800000001", "alias": "Alice 爱丽丝 艾丽丝"},
            {"name": "Bob", "account_id": "A1002", "phone": "13800000000", "alias": "Bob 鲍勃 波波"},
            {"name": "波波", "account_id": "VA1009", "phone": "13910001009", "alias": "语音测试"},
            {"name": "张伟", "account_id": "VA1001", "phone": "13910001001", "alias": "语音测试"},
            {"name": "张薇", "account_id": "VA1002", "phone": "13910001002", "alias": "语音测试"},
        ], "error": None}

    def get_pending_action(self, user_id, session_id):
        return {"success": True, "data": None, "error": None}

    def find_payee(self, user_id, query):
        if query.lower() in {"alice", "爱丽丝", "艾丽丝"}:
            return {"success": True, "data": [
                {"name": "Alice", "account_id": "A1001"}
            ], "error": None}
        if query.lower() == "bob":
            return {"success": True, "data": [
                {"name": "Bob", "account_id": "A1002"}
            ], "error": None}
        if query == "波波":
            return {"success": True, "data": [
                {"name": "Bob", "account_id": "A1002"},
                {"name": "波波", "account_id": "VA1009"},
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

    def test_short_transfer_verb_uses_candidate_matching(self):
        response = _fast_voice_response(
            self.runtime, "U4", "S1", "帮我给bob转100元。",
        )
        self.assertIn("Bob", response)
        self.assertIn("波波", response)
        self.assertIn(("U4", "S1"), self.runtime.banking_tools.actions.sessions)

    def test_spoken_bob_requires_disambiguation_then_uses_choice(self):
        context = {}
        response = _fast_voice_response(
            self.runtime, "U4", "S1", "帮我给bob转100元。", context,
        )
        self.assertIn("第1位", response)
        self.assertIn("第2位", response)
        self.assertIn("payee_choice", context)

        response = _fast_voice_response(
            self.runtime, "U4", "S1", "账户尾号1009", context,
        )
        self.assertIn("向波波转账 100 元", response)
        self.assertNotIn("payee_choice", context)

    def test_chinese_homophones_require_ordinal_choice(self):
        context = {}
        response = _fast_voice_response(
            self.runtime, "U4", "S1", "给张伟转账500元", context,
        )
        self.assertIn("张伟", response)
        self.assertIn("张薇", response)

        response = _fast_voice_response(
            self.runtime, "U4", "S1", "选择第二位", context,
        )
        self.assertIn("向张薇转账 500 元", response)

    def test_candidate_choice_can_be_cancelled(self):
        context = {}
        _fast_voice_response(self.runtime, "U4", "S1", "给张伟转账500元", context)
        response = _fast_voice_response(self.runtime, "U4", "S1", "取消", context)
        self.assertIn("已取消", response)
        self.assertNotIn("payee_choice", context)

    def test_missing_amount_continues_after_candidate_choice(self):
        context = {}
        _fast_voice_response(self.runtime, "U4", "S1", "给张伟转账", context)
        response = _fast_voice_response(self.runtime, "U4", "S1", "选择第二位", context)
        self.assertEqual("已选择张薇，请告诉我转账金额。", response)
        response = _fast_voice_response(self.runtime, "U4", "S1", "500元", context)
        self.assertIn("向张薇转账 500 元", response)


class VoiceEventTest(unittest.TestCase):
    def test_capture_event_uses_enabled_field(self):
        channel = SimpleNamespace(readyState="open", send=lambda message: setattr(channel, "message", message))
        _event(channel, "capture", enabled=True)
        self.assertEqual({"type": "capture", "enabled": True}, json.loads(channel.message))


if __name__ == "__main__":
    unittest.main()
