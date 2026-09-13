import tempfile
import unittest
from pathlib import Path

from mock_bank.auth import hash_password
from mock_bank.extended import BankPlatform


class ExtendedBankTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.bank = BankPlatform(Path(self.temp_dir.name) / "bank.db")

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_registration_creates_selected_account_type(self):
        personal = self.bank.register_customer(
            "Personal Test", "13900000001", hash_password("password-1"), "personal"
        )
        business = self.bank.register_customer(
            "Business Owner", "13900000002", hash_password("password-2"), "business",
            "Test Trading Ltd.", "MOCK-COMPANY-002",
        )
        self.assertEqual("personal", personal["account_type"])
        self.assertIsNone(personal["enterprise_id"])
        self.assertEqual("business", business["account_type"])
        self.assertEqual(
            business["enterprise_id"],
            self.bank.enterprises(business["user_id"])[0]["id"],
        )

    def test_small_business_loan_changes_balance_and_outstanding(self):
        application = self.bank.create_loan_application(
            "U4", "E1001", "LP1001", "BA1001", "1000.00", 12, "采购原材料"
        )
        approved = self.bank.submit_loan_application("U4", application["id"])
        self.assertEqual("approved", approved["status"])
        loan = self.bank.draw_loan("U4", application["id"])
        self.assertEqual("1000.00", loan["outstanding"])
        self.assertEqual("4000.00", self.bank.account("BA1001")["balance"])

        repaid = self.bank.repay_loan("U4", loan["id"], "400.00")
        self.assertEqual("600.00", repaid["outstanding"])
        self.assertEqual("3600.00", self.bank.account("BA1001")["balance"])

    def test_other_user_cannot_operate_enterprise_loan(self):
        with self.assertRaisesRegex(ValueError, "cannot operate"):
            self.bank.create_loan_application(
                "U1", "E1001", "LP1001", "BA1001", "1000.00", 12, "test"
            )

    def test_recommendations_respect_risk_profile(self):
        self.bank.set_risk_profile("U1", "CAUTIOUS", 12, "high", "low")
        products = self.bank.recommended_investments("U1", "10000.00")
        self.assertTrue(products)
        self.assertEqual({"LOW"}, {product["risk_level"] for product in products})
        self.assertEqual(["PM1001"], [model["id"] for model in self.bank.portfolio_models("U1")])

    def test_portfolio_purchase_is_atomic_and_changes_balance(self):
        self.bank.set_risk_profile("U1", "BALANCED", 36, "medium", "medium")
        portfolio = self.bank.buy_portfolio("U1", "A1001", "PM1002", "100.00")
        self.assertEqual("900.00", self.bank.account("A1001")["balance"])
        self.assertEqual("100.00", portfolio["invested_amount"])
        self.assertEqual("100.00", f'{sum(float(p["amount"]) for p in portfolio["positions"]):.2f}')

    def test_portfolio_above_risk_level_is_rejected_without_charging(self):
        self.bank.set_risk_profile("U1", "CAUTIOUS", 12, "high", "low")
        with self.assertRaisesRegex(ValueError, "exceeds"):
            self.bank.buy_portfolio("U1", "A1001", "PM1003", "100.00")
        self.assertEqual("1000.00", self.bank.account("A1001")["balance"])


if __name__ == "__main__":
    unittest.main()
