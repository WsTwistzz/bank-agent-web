import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from mock_bank.app import Bank
from mock_bank.auth import hash_password, new_totp_secret, totp, verify_password, verify_totp
from mock_bank.portal import create_app


class AuthTest(unittest.TestCase):
    def test_password_and_totp(self):
        encoded = hash_password("correct-password")
        self.assertTrue(verify_password("correct-password", encoded))
        self.assertFalse(verify_password("wrong-password", encoded))
        secret = new_totp_secret()
        self.assertTrue(verify_totp(secret, totp(secret)))
        self.assertFalse(verify_totp(secret, "000000"))

    def test_login_is_scoped_to_the_users_accounts(self):
        with tempfile.TemporaryDirectory() as directory:
            db_path = Path(directory) / "test.db"
            bank = Bank(db_path)
            secret = new_totp_secret()
            with bank.connect() as db:
                db.execute(
                    "UPDATE users SET password_hash = ?, totp_secret = ? WHERE id = 'U4'",
                    (hash_password("test-password"), secret),
                )
            client = TestClient(create_app(db_path, two_factor=True, secure_cookie=False))
            response = client.post("/auth/login", json={
                "phone": "13800000004", "password": "test-password", "code": totp(secret)
            })
            self.assertEqual(200, response.status_code)
            self.assertEqual(
                ["A1004", "BA1001"],
                [item["id"] for item in client.get("/api/accounts").json()],
            )
            self.assertEqual(
                404, client.get("/api/accounts/A1001/transactions").status_code
            )

    def test_two_factor_can_be_disabled(self):
        with tempfile.TemporaryDirectory() as directory:
            db_path = Path(directory) / "test.db"
            bank = Bank(db_path)
            with bank.connect() as db:
                db.execute(
                    "UPDATE users SET password_hash = ? WHERE id = 'U3'",
                    (hash_password("test-password"),),
                )
            client = TestClient(create_app(db_path, two_factor=False, secure_cookie=False))
            response = client.post("/auth/login", json={
                "phone": "13800000003", "password": "test-password"
            })
            self.assertEqual(200, response.status_code)


if __name__ == "__main__":
    unittest.main()
