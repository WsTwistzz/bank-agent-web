from datetime import datetime, timedelta, timezone


def utc_now():
    return datetime.now(timezone.utc)


class StepUpVerifier:
    """Password freshness plus TOTP verification for high-risk actions."""

    def __init__(
        self,
        password_authenticated_at,
        verify_password,
        verify_totp,
        record_password_authentication,
        password_max_age_seconds=900,
        clock=utc_now,
    ):
        self.password_authenticated_at = password_authenticated_at
        self.verify_password = verify_password
        self.verify_totp = verify_totp
        self.record_password_authentication = record_password_authentication
        self.password_max_age = timedelta(seconds=password_max_age_seconds)
        self.clock = clock

    def password_is_fresh(self, user_id, session_id):
        authenticated_at = self.password_authenticated_at(user_id, session_id)
        if not authenticated_at:
            return False
        if isinstance(authenticated_at, str):
            authenticated_at = datetime.fromisoformat(authenticated_at)
        age = self.clock() - authenticated_at
        return timedelta(0) <= age <= self.password_max_age

    def requirements(self, user_id, session_id):
        return {
            "password_required": not self.password_is_fresh(user_id, session_id),
            "totp_required": True,
        }

    def issue(self, user_id, action_id):
        return {
            "action_id": action_id,
            "expires_at": (self.clock() + timedelta(minutes=5)).isoformat(),
        }

    def verify(self, user_id, action_id, credential, session_id=None):
        if not session_id or not isinstance(credential, dict):
            return False
        totp_code = credential.get("totp_code")
        if not totp_code or not self.verify_totp(user_id, str(totp_code)):
            return False
        if self.password_is_fresh(user_id, session_id):
            return True
        password = credential.get("password")
        if not password or not self.verify_password(user_id, password):
            return False
        self.record_password_authentication(user_id, session_id, self.clock())
        return True
