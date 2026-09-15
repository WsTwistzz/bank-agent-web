import unittest

from bank_agent.action_messages import pending_action_prompt


class PendingActionPromptTest(unittest.TestCase):
    def test_transfer_is_rendered_without_internal_json(self):
        prompt = pending_action_prompt({
            "action_type": "TRANSFER",
            "status": "WAITING_CONFIRMATION",
            "payload": {
                "user_id": "U4",
                "source_account_id": "A1004",
                "target_account_id": "A1002",
                "amount": "100",
                "note": "语音测试转账",
            },
        })
        self.assertIn("从账户 A1004 向账户 A1002 转账 100 元", prompt)
        self.assertNotIn("TRANSFER", prompt)
        self.assertNotIn("user_id", prompt)
        self.assertNotIn("{", prompt)

    def test_non_transfer_includes_confirmation_target(self):
        prompt = pending_action_prompt({
            "action_type": "SET_CARD_LIMIT",
            "status": "WAITING_CONFIRMATION",
            "payload": {"user_id": "U4", "card_id": "C1004", "amount": "5000"},
        })
        self.assertIn("银行卡 C1004", prompt)
        self.assertIn("5000 元", prompt)
        self.assertNotIn("user_id", prompt)


if __name__ == "__main__":
    unittest.main()
