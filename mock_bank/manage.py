import argparse
import getpass
from urllib.parse import quote

try:
    from .app import Bank, DEFAULT_DB
    from .auth import hash_password, new_totp_secret, totp
except ImportError:
    from app import Bank, DEFAULT_DB
    from auth import hash_password, new_totp_secret, totp


def find_user(bank, identity):
    with bank.connect() as db:
        return db.execute(
            "SELECT * FROM users WHERE id = ? OR phone = ?", (identity, identity)
        ).fetchone()


def main():
    parser = argparse.ArgumentParser(description="Manage mock bank test users")
    parser.add_argument("--db", default=str(DEFAULT_DB))
    subparsers = parser.add_subparsers(dest="command", required=True)
    set_password = subparsers.add_parser("set-password")
    set_password.add_argument("user")
    set_password.add_argument("password", nargs="?", help="omit to enter it securely")
    show_totp = subparsers.add_parser("show-totp")
    show_totp.add_argument("user")
    subparsers.add_parser("list-users")
    args = parser.parse_args()
    bank = Bank(args.db)

    if args.command == "list-users":
        with bank.connect() as db:
            rows = db.execute("SELECT id, name, phone FROM users ORDER BY id").fetchall()
        for row in rows:
            print(f'{row["id"]}\t{row["name"]}\t{row["phone"]}')
        return

    user = find_user(bank, args.user)
    if not user:
        parser.error("user not found")
    if args.command == "set-password":
        password = args.password or getpass.getpass("New password: ")
        if not args.password and password != getpass.getpass("Repeat password: "):
            parser.error("passwords do not match")
        password_hash = hash_password(password)
        secret = user["totp_secret"] or new_totp_secret()
        with bank.connect() as db:
            db.execute(
                "UPDATE users SET password_hash = ?, totp_secret = ? WHERE id = ?",
                (password_hash, secret, user["id"]),
            )
        print(f'Password updated for {user["name"]} ({user["phone"]})')
    else:
        secret = user["totp_secret"] or new_totp_secret()
        if not user["totp_secret"]:
            with bank.connect() as db:
                db.execute("UPDATE users SET totp_secret = ? WHERE id = ?", (secret, user["id"]))
        label = quote(f'Mock Bank:{user["phone"]}')
        print(f'User: {user["name"]} ({user["id"]})')
        print(f'Secret: {secret}')
        print(f'Current code: {totp(secret)}')
        print(f'Authenticator URI: otpauth://totp/{label}?secret={secret}&issuer=Mock%20Bank')


if __name__ == "__main__":
    main()
