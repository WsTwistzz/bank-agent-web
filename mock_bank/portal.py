import argparse
import hashlib
import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

import uvicorn
from fastapi import Cookie, FastAPI, HTTPException, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel

try:
    from .app import DEFAULT_DB
    from .auth import hash_password, verify_password, verify_totp
    from .extended import BankPlatform
except ImportError:
    from app import DEFAULT_DB
    from auth import hash_password, verify_password, verify_totp
    from extended import BankPlatform


PORTAL_PAGE = Path(__file__).with_name("portal.html")
SESSION_COOKIE = "mock_bank_session"


class LoginRequest(BaseModel):
    phone: str
    password: str
    code: str | None = None


class RegisterRequest(BaseModel):
    name: str
    phone: str
    password: str
    account_type: str = "personal"
    enterprise_name: str | None = None
    registration_number: str | None = None


def enabled(value):
    return value.lower() not in {"0", "false", "no", "off"}


def create_app(db_path=DEFAULT_DB, two_factor=None, secure_cookie=None):
    bank = BankPlatform(db_path)
    use_2fa = enabled(os.getenv("MOCK_BANK_2FA_ENABLED", "true")) if two_factor is None else two_factor
    cookie_secure = enabled(os.getenv("MOCK_BANK_SECURE_COOKIE", "false")) if secure_cookie is None else secure_cookie
    app = FastAPI(title="Mock Bank User Portal", docs_url=None, redoc_url=None)

    with bank.connect() as db:
        db.execute("""
            CREATE TABLE IF NOT EXISTS user_sessions (
                token_hash TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id),
                expires_at TEXT NOT NULL,
                password_authenticated_at TEXT
            )
        """)
        session_columns = {
            row["name"] for row in db.execute("PRAGMA table_info(user_sessions)")
        }
        if "password_authenticated_at" not in session_columns:
            db.execute(
                "ALTER TABLE user_sessions ADD COLUMN password_authenticated_at TEXT"
            )

    def current_user(session_token):
        if not session_token:
            raise HTTPException(401, "not logged in")
        token_hash = hashlib.sha256(session_token.encode()).hexdigest()
        with bank.connect() as db:
            row = db.execute(
                "SELECT users.* FROM user_sessions JOIN users ON users.id = user_sessions.user_id "
                "WHERE token_hash = ? AND expires_at > ?",
                (token_hash, datetime.now(timezone.utc).isoformat()),
            ).fetchone()
        if not row:
            raise HTTPException(401, "session expired")
        return row

    @app.get("/", include_in_schema=False)
    def home():
        return FileResponse(PORTAL_PAGE)

    @app.get("/health")
    def health():
        return {"status": "ok", "two_factor_enabled": use_2fa}

    @app.post("/auth/login")
    def login(data: LoginRequest, response: Response):
        with bank.connect() as db:
            user = db.execute("SELECT * FROM users WHERE phone = ?", (data.phone.strip(),)).fetchone()
        if not user or not user["password_hash"] or not verify_password(data.password, user["password_hash"]):
            raise HTTPException(401, "invalid phone or password")
        if use_2fa and (not user["totp_secret"] or not data.code or
                        not verify_totp(user["totp_secret"], data.code.strip())):
            raise HTTPException(401, "invalid or missing 2FA code")
        token = secrets.token_urlsafe(32)
        expires_at = datetime.now(timezone.utc) + timedelta(hours=12)
        with bank.connect() as db:
            db.execute("DELETE FROM user_sessions WHERE expires_at <= ?", (datetime.now(timezone.utc).isoformat(),))
            db.execute(
                "INSERT INTO user_sessions "
                "(token_hash, user_id, expires_at, password_authenticated_at) "
                "VALUES (?, ?, ?, ?)",
                (
                    hashlib.sha256(token.encode()).hexdigest(),
                    user["id"],
                    expires_at.isoformat(),
                    datetime.now(timezone.utc).isoformat(),
                ),
            )
        response.set_cookie(
            SESSION_COOKIE, token, httponly=True, secure=cookie_secure,
            samesite="strict", max_age=12 * 60 * 60,
        )
        return {"user": {"id": user["id"], "name": user["name"], "phone": user["phone"]}}

    @app.post("/auth/register")
    def register(data: RegisterRequest):
        try:
            result = bank.register_customer(
                data.name,
                data.phone,
                hash_password(data.password),
                data.account_type,
                data.enterprise_name,
                data.registration_number,
            )
        except (ValueError, sqlite3.IntegrityError) as error:
            raise HTTPException(400, str(error)) from error
        with bank.connect() as db:
            user = db.execute("SELECT * FROM users WHERE id = ?", (result["user_id"],)).fetchone()
        result["totp_secret"] = user["totp_secret"]
        result["authenticator_uri"] = (
            f'otpauth://totp/Mock%20Bank:{user["phone"]}?'
            f'secret={user["totp_secret"]}&issuer=Mock%20Bank'
        )
        return result

    @app.post("/auth/logout", status_code=204)
    def logout(response: Response, mock_bank_session: str | None = Cookie(None)):
        if mock_bank_session:
            with bank.connect() as db:
                db.execute(
                    "DELETE FROM user_sessions WHERE token_hash = ?",
                    (hashlib.sha256(mock_bank_session.encode()).hexdigest(),),
                )
        response.delete_cookie(SESSION_COOKIE)

    @app.get("/api/me")
    def me(mock_bank_session: str | None = Cookie(None)):
        user = current_user(mock_bank_session)
        return {"id": user["id"], "name": user["name"], "phone": user["phone"]}

    @app.get("/api/accounts")
    def accounts(mock_bank_session: str | None = Cookie(None)):
        user = current_user(mock_bank_session)
        return bank.accounts(user["id"])

    @app.get("/api/enterprises")
    def enterprises(mock_bank_session: str | None = Cookie(None)):
        user = current_user(mock_bank_session)
        return bank.enterprises(user["id"])

    @app.get("/api/loan-products")
    def loan_products(mock_bank_session: str | None = Cookie(None)):
        current_user(mock_bank_session)
        return bank.loan_products()

    @app.get("/api/investment-products")
    def investment_products(mock_bank_session: str | None = Cookie(None)):
        current_user(mock_bank_session)
        return bank.investment_products()

    @app.get("/api/portfolio-models")
    def portfolio_models(mock_bank_session: str | None = Cookie(None)):
        user = current_user(mock_bank_session)
        try:
            return bank.portfolio_models(user["id"])
        except LookupError:
            return []

    @app.get("/api/accounts/{account_id}/transactions")
    def transactions(account_id: str, mock_bank_session: str | None = Cookie(None)):
        user = current_user(mock_bank_session)
        owned = {account["id"] for account in bank.accounts(user["id"])}
        if account_id not in owned:
            raise HTTPException(404, "account not found")
        return bank.transactions(account_id)

    return app


app = create_app(os.getenv("BANK_DB_PATH", str(DEFAULT_DB)))


def main():
    parser = argparse.ArgumentParser(description="Mock bank user login portal")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8080)
    args = parser.parse_args()
    if args.host not in {"127.0.0.1", "localhost", "::1"} and not enabled(
        os.getenv("MOCK_BANK_SECURE_COOKIE", "false")
    ):
        parser.error("MOCK_BANK_SECURE_COOKIE=true is required for non-localhost binding")
    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
