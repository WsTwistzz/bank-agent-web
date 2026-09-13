import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from actions import ActionService, PermissionPolicy, RiskLevel, StepUpVerifier


class StepUpVerifierTest(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 9, 8, 10, 0, tzinfo=timezone.utc)
        self.authenticated = {}
        self.verifier = StepUpVerifier(
            password_authenticated_at=lambda user, session: self.authenticated.get(
                (user, session)
            ),
            verify_password=lambda user, password: user == "U1" and password == "secret",
            verify_totp=lambda user, code: user == "U1" and code == "123456",
            record_password_authentication=lambda user, session, at: self.authenticated.__setitem__(
                (user, session), at
            ),
            clock=lambda: self.now,
        )

    def test_recent_password_only_requires_totp(self):
        self.authenticated[("U1", "S1")] = self.now - timedelta(minutes=14)
        self.assertEqual(
            {"password_required": False, "totp_required": True},
            self.verifier.requirements("U1", "S1"),
        )
        self.assertTrue(
            self.verifier.verify("U1", "A1", {"totp_code": "123456"}, session_id="S1")
        )

    def test_expired_password_requires_password_and_totp(self):
        self.authenticated[("U1", "S1")] = self.now - timedelta(minutes=16)
        self.assertFalse(
            self.verifier.verify("U1", "A1", {"totp_code": "123456"}, session_id="S1")
        )
        self.assertTrue(self.verifier.verify(
            "U1", "A1", {"password": "secret", "totp_code": "123456"}, session_id="S1"
        ))
        self.assertEqual(self.now, self.authenticated[("U1", "S1")])

    def test_authentication_is_bound_to_user_and_session(self):
        self.authenticated[("U1", "S2")] = self.now
        self.assertFalse(
            self.verifier.verify("U1", "A1", {"totp_code": "123456"}, session_id="S1")
        )

    def test_password_does_not_replace_totp(self):
        self.assertFalse(
            self.verifier.verify("U1", "A1", {"password": "secret"}, session_id="S1")
        )

    def test_action_service_reports_requirements_and_passes_bound_session(self):
        with tempfile.TemporaryDirectory() as directory:
            policy = PermissionPolicy()
            policy.register("TRANSFER", RiskLevel.RED)
            service = ActionService(
                policy,
                db_path=Path(directory) / "actions.db",
                verifier=self.verifier,
            )
            service.register("TRANSFER", lambda payload: {"executed": True})
            service.create_session("U1", "S1")
            action = service.submit("TRANSFER", {}, "U1", session_id="S1")

            challenge = service.request_verification(action["action_id"], "U1")
            self.assertTrue(challenge["password_required"])
            self.assertTrue(challenge["totp_required"])

            result = service.verify(
                action["action_id"],
                "U1",
                {"password": "secret", "totp_code": "123456"},
            )
            self.assertEqual("SUCCEEDED", result["status"])


if __name__ == "__main__":
    unittest.main()
