import tempfile
import unittest

from mock_bank.app import Bank
from mock_bank.manage import (
    VOICE_EXISTING_PAYEES, VOICE_TEST_USERS, seed_voice_test_users,
)


class VoiceTestFixturesTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.bank = Bank(f"{self.temp.name}/bank.db")

    def tearDown(self):
        self.temp.cleanup()

    def test_seed_is_idempotent_and_creates_payees_with_balance(self):
        seed_voice_test_users(self.bank, "U4", "100000.00")
        seed_voice_test_users(self.bank, "U4", "100000.00")
        with self.bank.connect() as db:
            users = db.execute(
                "SELECT COUNT(*) AS total FROM users WHERE id LIKE 'VU%'"
            ).fetchone()["total"]
            accounts = db.execute(
                "SELECT COUNT(*) AS total FROM accounts "
                "WHERE id LIKE 'VA%' AND balance_cents = 10000000"
            ).fetchone()["total"]
            payees = db.execute(
                "SELECT COUNT(*) AS total FROM payees WHERE owner_user_id = 'U4' "
                "AND id LIKE 'VP1%'"
            ).fetchone()["total"]
            english_payees = db.execute(
                "SELECT COUNT(*) AS total FROM payees WHERE owner_user_id = 'U4' "
                "AND id LIKE 'VP2%'"
            ).fetchone()["total"]
            owner_balance = db.execute(
                "SELECT balance_cents FROM accounts WHERE id = 'A1004'"
            ).fetchone()["balance_cents"]
        self.assertEqual(len(VOICE_TEST_USERS), users)
        self.assertEqual(len(VOICE_TEST_USERS), accounts)
        self.assertEqual(len(VOICE_TEST_USERS), payees)
        self.assertEqual(len(VOICE_EXISTING_PAYEES), english_payees)
        self.assertEqual(50000000, owner_balance)


if __name__ == "__main__":
    unittest.main()
