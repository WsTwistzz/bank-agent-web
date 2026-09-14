import argparse
import getpass
from decimal import Decimal, InvalidOperation
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


VOICE_TEST_USERS = (
    ("VU1001", "VA1001", "VP1001", "张伟", "13910001001"),
    ("VU1002", "VA1002", "VP1002", "张薇", "13910001002"),
    ("VU1003", "VA1003", "VP1003", "王芳", "13910001003"),
    ("VU1004", "VA1004", "VP1004", "王方", "13910001004"),
    ("VU1005", "VA1005", "VP1005", "李娜", "13910001005"),
    ("VU1006", "VA1006", "VP1006", "李楠", "13910001006"),
    ("VU1007", "VA1007", "VP1007", "陈晨", "13910001007"),
    ("VU1008", "VA1008", "VP1008", "陈辰", "13910001008"),
    ("VU1009", "VA1009", "VP1009", "波波", "13910001009"),
)

VOICE_EXISTING_PAYEES = (
    ("VP2001", "Alice", "13800000001", "A1001", "Alice 爱丽丝 艾丽丝"),
    ("VP2002", "Bob", "13800000000", "A1002", "Bob 鲍勃 波波"),
)


def _amount_to_cents(value, name):
    try:
        cents = int(Decimal(value) * 100)
    except (InvalidOperation, ValueError) as error:
        raise ValueError(f"{name} must be a valid amount") from error
    if cents <= 0:
        raise ValueError(f"{name} must be positive")
    return cents


def seed_voice_test_users(bank, owner_user_id, balance, owner_balance="500000.00"):
    balance_cents = _amount_to_cents(balance, "balance")
    owner_balance_cents = _amount_to_cents(owner_balance, "owner balance")
    with bank.connect() as db:
        if not db.execute("SELECT 1 FROM users WHERE id = ?", (owner_user_id,)).fetchone():
            raise ValueError("payee owner user not found")
        db.execute(
            "UPDATE accounts SET balance_cents = ?, status = 'active' WHERE user_id = ?",
            (owner_balance_cents, owner_user_id),
        )
        for user_id, account_id, payee_id, name, phone in VOICE_TEST_USERS:
            db.execute(
                "INSERT INTO users (id, name, phone) VALUES (?, ?, ?) "
                "ON CONFLICT(id) DO UPDATE SET name=excluded.name, phone=excluded.phone",
                (user_id, name, phone),
            )
            db.execute(
                "INSERT INTO accounts (id, user_id, name, balance_cents, status) "
                "VALUES (?, ?, ?, ?, 'active') ON CONFLICT(id) DO UPDATE SET "
                "user_id=excluded.user_id, name=excluded.name, "
                "balance_cents=excluded.balance_cents, status='active'",
                (account_id, user_id, f"{name}测试账户", balance_cents),
            )
            db.execute(
                "INSERT INTO payees (id, owner_user_id, name, phone, account_id, alias) "
                "VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET "
                "owner_user_id=excluded.owner_user_id, name=excluded.name, "
                "phone=excluded.phone, account_id=excluded.account_id, alias=excluded.alias",
                (payee_id, owner_user_id, name, phone, account_id, "语音测试"),
            )
        for payee_id, name, phone, account_id, alias in VOICE_EXISTING_PAYEES:
            if not db.execute("SELECT 1 FROM accounts WHERE id = ?", (account_id,)).fetchone():
                continue
            db.execute(
                "INSERT INTO payees (id, owner_user_id, name, phone, account_id, alias) "
                "VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET "
                "owner_user_id=excluded.owner_user_id, name=excluded.name, "
                "phone=excluded.phone, account_id=excluded.account_id, alias=excluded.alias",
                (payee_id, owner_user_id, name, phone, account_id, alias),
            )
    return [(name, account_id, balance_cents) for _, account_id, _, name, _ in VOICE_TEST_USERS]


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
    voice_users = subparsers.add_parser("seed-voice-tests")
    voice_users.add_argument("--owner", default="U4", help="user who sees these payees")
    voice_users.add_argument("--balance", default="100000.00")
    voice_users.add_argument("--owner-balance", default="500000.00")
    args = parser.parse_args()
    bank = Bank(args.db)

    if args.command == "list-users":
        with bank.connect() as db:
            rows = db.execute("SELECT id, name, phone FROM users ORDER BY id").fetchall()
        for row in rows:
            print(f'{row["id"]}\t{row["name"]}\t{row["phone"]}')
        return

    if args.command == "seed-voice-tests":
        try:
            rows = seed_voice_test_users(
                bank, args.owner, args.balance, args.owner_balance,
            )
        except ValueError as error:
            parser.error(str(error))
        for name, account_id, balance_cents in rows:
            print(f"{name}\t{account_id}\t¥{Decimal(balance_cents) / 100:.2f}")
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
