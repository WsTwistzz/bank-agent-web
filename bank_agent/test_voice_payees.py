import unittest

from bank_agent.voice_payees import match_payee_candidates, select_payee


PAYEES = [
    {"name": "张伟", "account_id": "VA1001", "phone": "13910001001", "alias": ""},
    {"name": "张薇", "account_id": "VA1002", "phone": "13910001002", "alias": ""},
    {"name": "Bob", "account_id": "A1002", "phone": "13800000000", "alias": "鲍勃 波波"},
    {"name": "波波", "account_id": "VA1009", "phone": "13910001009", "alias": ""},
]


class VoicePayeeMatcherTest(unittest.TestCase):
    def test_preserves_chinese_homophones(self):
        matches = match_payee_candidates("张伟", PAYEES)
        self.assertEqual({"张伟", "张薇"}, {item["name"] for item in matches})

    def test_preserves_cross_language_near_sound(self):
        matches = match_payee_candidates("Bob", PAYEES)
        self.assertEqual({"Bob", "波波"}, {item["name"] for item in matches})

    def test_selects_by_ordinal_or_account_suffix(self):
        self.assertEqual("张薇", select_payee("选择第二位", PAYEES[:2])["name"])
        self.assertEqual("张伟", select_payee("账户尾号1001", PAYEES[:2])["name"])


if __name__ == "__main__":
    unittest.main()
