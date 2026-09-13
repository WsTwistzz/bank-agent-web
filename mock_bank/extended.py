import json
import uuid
from datetime import datetime, timezone
from decimal import Decimal

try:
    from .app import Bank, account_json, money, now
    from .auth import new_totp_secret
except ImportError:
    from app import Bank, account_json, money, now
    from auth import new_totp_secret


RISK_SCORE = {
    "CONSERVATIVE": 1,
    "CAUTIOUS": 2,
    "BALANCED": 3,
    "GROWTH": 4,
    "AGGRESSIVE": 5,
}


class BankPlatform(Bank):
    """Mock Bank with personal, business lending, and wealth domains."""

    def setup(self):
        super().setup()
        with self.connect() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS enterprises (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    registration_number TEXT NOT NULL UNIQUE,
                    industry TEXT NOT NULL DEFAULT 'other',
                    annual_revenue_cents INTEGER NOT NULL DEFAULT 0,
                    established_at TEXT,
                    status TEXT NOT NULL DEFAULT 'active'
                );
                CREATE TABLE IF NOT EXISTS enterprise_members (
                    enterprise_id TEXT NOT NULL REFERENCES enterprises(id),
                    user_id TEXT NOT NULL REFERENCES users(id),
                    role TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'active',
                    PRIMARY KEY (enterprise_id, user_id)
                );
                CREATE TABLE IF NOT EXISTS loan_products (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    purpose TEXT NOT NULL,
                    min_cents INTEGER NOT NULL,
                    max_cents INTEGER NOT NULL,
                    annual_rate TEXT NOT NULL,
                    max_term_months INTEGER NOT NULL,
                    repayment_method TEXT NOT NULL,
                    collateral_required INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'active'
                );
                CREATE TABLE IF NOT EXISTS loan_applications (
                    id TEXT PRIMARY KEY,
                    enterprise_id TEXT NOT NULL REFERENCES enterprises(id),
                    product_id TEXT NOT NULL REFERENCES loan_products(id),
                    account_id TEXT NOT NULL REFERENCES accounts(id),
                    amount_cents INTEGER NOT NULL,
                    term_months INTEGER NOT NULL,
                    purpose TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'draft',
                    approved_cents INTEGER,
                    decision_reasons TEXT,
                    created_at TEXT NOT NULL,
                    submitted_at TEXT
                );
                CREATE TABLE IF NOT EXISTS loans (
                    id TEXT PRIMARY KEY,
                    application_id TEXT NOT NULL UNIQUE REFERENCES loan_applications(id),
                    enterprise_id TEXT NOT NULL REFERENCES enterprises(id),
                    account_id TEXT NOT NULL REFERENCES accounts(id),
                    principal_cents INTEGER NOT NULL,
                    outstanding_cents INTEGER NOT NULL,
                    annual_rate TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'repaying',
                    disbursed_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS risk_profiles (
                    user_id TEXT PRIMARY KEY REFERENCES users(id),
                    risk_level TEXT NOT NULL,
                    investment_horizon_months INTEGER NOT NULL,
                    liquidity_need TEXT NOT NULL,
                    loss_tolerance TEXT NOT NULL,
                    assessed_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS portfolio_models (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    risk_level TEXT NOT NULL,
                    allocations TEXT NOT NULL,
                    description TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS portfolios (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL REFERENCES users(id),
                    account_id TEXT NOT NULL REFERENCES accounts(id),
                    model_id TEXT NOT NULL REFERENCES portfolio_models(id),
                    name TEXT NOT NULL,
                    invested_cents INTEGER NOT NULL,
                    status TEXT NOT NULL DEFAULT 'active',
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS portfolio_positions (
                    portfolio_id TEXT NOT NULL REFERENCES portfolios(id),
                    product_id TEXT NOT NULL REFERENCES investment_products(id),
                    amount_cents INTEGER NOT NULL,
                    PRIMARY KEY (portfolio_id, product_id)
                );
            """)
            account_columns = {row["name"] for row in db.execute("PRAGMA table_info(accounts)")}
            for name, definition in {
                "account_type": "TEXT NOT NULL DEFAULT 'personal'",
                "enterprise_id": "TEXT",
            }.items():
                if name not in account_columns:
                    db.execute(f"ALTER TABLE accounts ADD COLUMN {name} {definition}")
            product_columns = {
                row["name"] for row in db.execute("PRAGMA table_info(investment_products)")
            }
            for name, definition in {
                "product_type": "TEXT NOT NULL DEFAULT 'BOND'",
                "return_min": "TEXT NOT NULL DEFAULT '0.0100'",
                "return_max": "TEXT NOT NULL DEFAULT '0.0300'",
                "lock_days": "INTEGER NOT NULL DEFAULT 0",
                "liquidity": "TEXT NOT NULL DEFAULT 'daily'",
                "fee_rate": "TEXT NOT NULL DEFAULT '0.0000'",
                "issuer": "TEXT NOT NULL DEFAULT 'Mock Bank'",
                "status": "TEXT NOT NULL DEFAULT 'active'",
            }.items():
                if name not in product_columns:
                    db.execute(f"ALTER TABLE investment_products ADD COLUMN {name} {definition}")
            self._seed_enterprise(db)
            self._seed_loan_products(db)
            self._seed_investments(db)
            self._seed_portfolios(db)

    @staticmethod
    def _seed_enterprise(db):
        db.execute(
            "INSERT OR IGNORE INTO enterprises "
            "(id, name, registration_number, industry, annual_revenue_cents, established_at) "
            "VALUES ('E1001', 'Ke Wei Coffee Ltd.', 'MOCK-91310000-001', 'retail', 20000000, '2023-01-01')"
        )
        db.execute(
            "INSERT OR IGNORE INTO enterprise_members VALUES ('E1001', 'U4', 'OWNER', 'active')"
        )
        db.execute(
            "INSERT OR IGNORE INTO accounts "
            "(id, user_id, name, balance_cents, status, account_type, enterprise_id) "
            "VALUES ('BA1001', 'U4', 'Ke Wei Coffee Ltd.', 300000, 'active', 'business', 'E1001')"
        )

    @staticmethod
    def _seed_loan_products(db):
        db.executemany(
            "INSERT OR IGNORE INTO loan_products VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')",
            [
                ("LP1001", "企业经营贷", "日常经营周转", 100000, 50000000,
                 "0.0650", 24, "随借随还，按日计息", 0),
                ("LP1002", "企业订货贷", "向供应商采购和订货", 500000, 100000000,
                 "0.0580", 36, "等额本金", 0),
            ],
        )

    @staticmethod
    def _seed_investments(db):
        products = [
            ("I1001", "现金管理宝", "LOW", "0.0200", 100, "CASH_MANAGEMENT",
             "0.0150", "0.0250", 0, "daily", "0.0000", "Mock Bank"),
            ("I1002", "稳健债券精选", "LOW", "0.0320", 10000, "BOND",
             "0.0250", "0.0400", 30, "monthly", "0.0010", "Mock Asset"),
            ("I1003", "平衡混合优选", "MEDIUM", "0.0500", 50000, "MIXED",
             "0.0300", "0.0750", 90, "monthly", "0.0030", "Mock Fund"),
            ("I1004", "成长权益精选", "HIGH", "0.0800", 100000, "EQUITY",
             "-0.1500", "0.1800", 180, "quarterly", "0.0050", "Mock Fund"),
        ]
        for product in products:
            db.execute(
                "INSERT INTO investment_products "
                "(id, name, risk_level, annual_rate, minimum_cents, product_type, "
                "return_min, return_max, lock_days, liquidity, fee_rate, issuer, status) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active') "
                "ON CONFLICT(id) DO UPDATE SET name=excluded.name, risk_level=excluded.risk_level, "
                "annual_rate=excluded.annual_rate, minimum_cents=excluded.minimum_cents, "
                "product_type=excluded.product_type, return_min=excluded.return_min, "
                "return_max=excluded.return_max, lock_days=excluded.lock_days, "
                "liquidity=excluded.liquidity, fee_rate=excluded.fee_rate, issuer=excluded.issuer",
                product,
            )

    @staticmethod
    def _seed_portfolios(db):
        db.executemany(
            "INSERT OR IGNORE INTO portfolio_models VALUES (?, ?, ?, ?, ?)",
            [
                ("PM1001", "稳健组合", "CAUTIOUS",
                 json.dumps({"CASH_MANAGEMENT": 30, "BOND": 60, "MIXED": 10}),
                 "重视流动性与本金波动控制"),
                ("PM1002", "平衡组合", "BALANCED",
                 json.dumps({"CASH_MANAGEMENT": 10, "BOND": 50, "EQUITY": 40}),
                 "在稳定性和长期增长之间保持平衡"),
                ("PM1003", "成长组合", "GROWTH",
                 json.dumps({"CASH_MANAGEMENT": 5, "BOND": 25, "EQUITY": 70}),
                 "面向长期投资并接受较高波动"),
            ],
        )

    def register_customer(
        self, name, phone, password_hash, account_type="personal",
        enterprise_name=None, registration_number=None,
    ):
        if account_type not in {"personal", "business"}:
            raise ValueError("account_type must be personal or business")
        if not name.strip() or not phone.strip() or not password_hash:
            raise ValueError("name, phone and password are required")
        if account_type == "business" and (not enterprise_name or not registration_number):
            raise ValueError("enterprise name and registration number are required")
        user_id = "U" + uuid.uuid4().hex[:10].upper()
        account_id = ("BA" if account_type == "business" else "A") + uuid.uuid4().hex[:10].upper()
        enterprise_id = None
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            if db.execute("SELECT 1 FROM users WHERE phone = ?", (phone.strip(),)).fetchone():
                raise ValueError("phone is already registered")
            db.execute(
                "INSERT INTO users (id, name, phone, password_hash, totp_secret) VALUES (?, ?, ?, ?, ?)",
                (user_id, name.strip(), phone.strip(), password_hash, new_totp_secret()),
            )
            if account_type == "business":
                enterprise_id = "E" + uuid.uuid4().hex[:10].upper()
                db.execute(
                    "INSERT INTO enterprises (id, name, registration_number) VALUES (?, ?, ?)",
                    (enterprise_id, enterprise_name.strip(), registration_number.strip()),
                )
                db.execute(
                    "INSERT INTO enterprise_members VALUES (?, ?, 'OWNER', 'active')",
                    (enterprise_id, user_id),
                )
            db.execute(
                "INSERT INTO accounts "
                "(id, user_id, name, balance_cents, status, account_type, enterprise_id) "
                "VALUES (?, ?, ?, 0, 'active', ?, ?)",
                (account_id, user_id, enterprise_name.strip() if enterprise_name else name.strip(),
                 account_type, enterprise_id),
            )
        return {
            "user_id": user_id,
            "account_id": account_id,
            "account_type": account_type,
            "enterprise_id": enterprise_id,
        }

    def enterprises(self, user_id):
        with self.connect() as db:
            rows = db.execute(
                "SELECT enterprises.*, enterprise_members.role FROM enterprises "
                "JOIN enterprise_members ON enterprise_members.enterprise_id = enterprises.id "
                "WHERE enterprise_members.user_id = ? AND enterprise_members.status = 'active'",
                (user_id,),
            ).fetchall()
        return [dict(row) for row in rows]

    def loan_products(self):
        with self.connect() as db:
            rows = db.execute("SELECT * FROM loan_products WHERE status = 'active' ORDER BY id").fetchall()
        return [{
            "id": row["id"], "name": row["name"], "purpose": row["purpose"],
            "minimum_amount": f'{Decimal(row["min_cents"]) / 100:.2f}',
            "maximum_amount": f'{Decimal(row["max_cents"]) / 100:.2f}',
            "annual_rate": row["annual_rate"], "maximum_term_months": row["max_term_months"],
            "repayment_method": row["repayment_method"],
            "collateral_required": bool(row["collateral_required"]),
        } for row in rows]

    def create_loan_application(self, user_id, enterprise_id, product_id, account_id,
                                amount, term_months, purpose):
        cents = money(amount)
        with self.connect() as db:
            self._require_enterprise_owner(db, user_id, enterprise_id)
            product = db.execute("SELECT * FROM loan_products WHERE id = ?", (product_id,)).fetchone()
            account = db.execute(
                "SELECT * FROM accounts WHERE id = ? AND enterprise_id = ?",
                (account_id, enterprise_id),
            ).fetchone()
            if not product or not account:
                raise LookupError("loan product or business account not found")
            if cents < product["min_cents"] or cents > product["max_cents"]:
                raise ValueError("loan amount is outside product limits")
            if not 1 <= int(term_months) <= product["max_term_months"]:
                raise ValueError("loan term is outside product limits")
            application_id = "LA" + uuid.uuid4().hex[:10].upper()
            db.execute(
                "INSERT INTO loan_applications "
                "(id, enterprise_id, product_id, account_id, amount_cents, term_months, purpose, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (application_id, enterprise_id, product_id, account_id, cents,
                 int(term_months), purpose.strip(), now()),
            )
        return self.loan_application(user_id, application_id)

    def submit_loan_application(self, user_id, application_id):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            application = self._loan_application_row(db, user_id, application_id)
            if application["status"] != "draft":
                raise ValueError("loan application is not a draft")
            enterprise = db.execute(
                "SELECT * FROM enterprises WHERE id = ?", (application["enterprise_id"],)
            ).fetchone()
            approved = enterprise["annual_revenue_cents"] >= application["amount_cents"] // 2
            status = "approved" if approved else "rejected"
            reasons = (["企业经营信息满足测试授信规则", "申请金额与测试营收匹配"] if approved
                       else ["申请金额超过测试授信规则允许范围"])
            db.execute(
                "UPDATE loan_applications SET status = ?, approved_cents = ?, "
                "decision_reasons = ?, submitted_at = ? WHERE id = ?",
                (status, application["amount_cents"] if approved else 0,
                 json.dumps(reasons, ensure_ascii=False), now(), application_id),
            )
        return self.loan_application(user_id, application_id)

    def draw_loan(self, user_id, application_id):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            application = self._loan_application_row(db, user_id, application_id)
            if application["status"] != "approved":
                raise ValueError("loan application is not approved")
            if db.execute("SELECT 1 FROM loans WHERE application_id = ?", (application_id,)).fetchone():
                raise ValueError("loan has already been drawn")
            product = db.execute(
                "SELECT annual_rate FROM loan_products WHERE id = ?", (application["product_id"],)
            ).fetchone()
            loan_id = "LN" + uuid.uuid4().hex[:10].upper()
            cents = application["approved_cents"]
            db.execute(
                "INSERT INTO loans VALUES (?, ?, ?, ?, ?, ?, ?, 'repaying', ?)",
                (loan_id, application_id, application["enterprise_id"], application["account_id"],
                 cents, cents, product["annual_rate"], now()),
            )
            db.execute("UPDATE accounts SET balance_cents = balance_cents + ? WHERE id = ?",
                       (cents, application["account_id"]))
            db.execute("UPDATE loan_applications SET status = 'disbursed' WHERE id = ?",
                       (application_id,))
            db.execute(
                "INSERT INTO transactions (account_id, kind, amount_cents, counterparty, note, "
                "created_at, direction, category, merchant) "
                "VALUES (?, 'loan_disbursement', ?, ?, '贷款放款', ?, 'in', 'loan', NULL)",
                (application["account_id"], cents, loan_id, now()),
            )
        return self.loan(user_id, loan_id)

    def repay_loan(self, user_id, loan_id, amount):
        cents = money(amount)
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            loan = self._loan_row(db, user_id, loan_id)
            if loan["status"] != "repaying" or cents > loan["outstanding_cents"]:
                raise ValueError("invalid repayment amount or loan status")
            account = db.execute("SELECT * FROM accounts WHERE id = ?", (loan["account_id"],)).fetchone()
            if account["balance_cents"] < cents:
                raise ValueError("insufficient balance")
            remaining = loan["outstanding_cents"] - cents
            status = "settled" if remaining == 0 else "repaying"
            db.execute("UPDATE accounts SET balance_cents = balance_cents - ? WHERE id = ?",
                       (cents, loan["account_id"]))
            db.execute("UPDATE loans SET outstanding_cents = ?, status = ? WHERE id = ?",
                       (remaining, status, loan_id))
            db.execute(
                "INSERT INTO transactions (account_id, kind, amount_cents, counterparty, note, "
                "created_at, direction, category, merchant) "
                "VALUES (?, 'loan_repayment', ?, ?, '贷款还款', ?, 'out', 'loan', NULL)",
                (loan["account_id"], -cents, loan_id, now()),
            )
        return self.loan(user_id, loan_id)

    def loan_application(self, user_id, application_id):
        with self.connect() as db:
            row = self._loan_application_row(db, user_id, application_id)
        return self._loan_application_json(row)

    def loan(self, user_id, loan_id):
        with self.connect() as db:
            row = self._loan_row(db, user_id, loan_id)
        return self._loan_json(row)

    def investment_products(self):
        with self.connect() as db:
            rows = db.execute(
                "SELECT * FROM investment_products WHERE status = 'active' ORDER BY id"
            ).fetchall()
        return [self._investment_json(row) for row in rows]

    def set_risk_profile(self, user_id, risk_level, horizon_months, liquidity_need,
                         loss_tolerance):
        if risk_level not in RISK_SCORE:
            raise ValueError("invalid risk level")
        with self.connect() as db:
            if not db.execute("SELECT 1 FROM users WHERE id = ?", (user_id,)).fetchone():
                raise LookupError("user not found")
            db.execute(
                "INSERT INTO risk_profiles VALUES (?, ?, ?, ?, ?, ?) "
                "ON CONFLICT(user_id) DO UPDATE SET risk_level=excluded.risk_level, "
                "investment_horizon_months=excluded.investment_horizon_months, "
                "liquidity_need=excluded.liquidity_need, loss_tolerance=excluded.loss_tolerance, "
                "assessed_at=excluded.assessed_at",
                (user_id, risk_level, int(horizon_months), liquidity_need,
                 loss_tolerance, now()),
            )
        return self.risk_profile(user_id)

    def risk_profile(self, user_id):
        with self.connect() as db:
            row = db.execute("SELECT * FROM risk_profiles WHERE user_id = ?", (user_id,)).fetchone()
        if not row:
            raise LookupError("risk profile not found")
        return dict(row)

    def recommended_investments(self, user_id, available_amount):
        profile = self.risk_profile(user_id)
        cents = money(available_amount)
        allowed = {"LOW": 2, "MEDIUM": 3, "HIGH": 5}
        score = RISK_SCORE[profile["risk_level"]]
        return [product for product in self.investment_products()
                if allowed[product["risk_level"]] <= score
                and money(product["minimum_amount"]) <= cents]

    def portfolio_models(self, user_id=None):
        max_score = 5
        if user_id:
            max_score = RISK_SCORE[self.risk_profile(user_id)["risk_level"]]
        with self.connect() as db:
            rows = db.execute("SELECT * FROM portfolio_models ORDER BY id").fetchall()
        return [{
            "id": row["id"], "name": row["name"], "risk_level": row["risk_level"],
            "allocations": json.loads(row["allocations"]), "description": row["description"],
        } for row in rows if RISK_SCORE[row["risk_level"]] <= max_score]

    def buy_portfolio(self, user_id, account_id, model_id, amount, name=None):
        cents = money(amount)
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            account = db.execute(
                "SELECT * FROM accounts WHERE id = ? AND user_id = ? AND account_type = 'personal'",
                (account_id, user_id),
            ).fetchone()
            model = db.execute("SELECT * FROM portfolio_models WHERE id = ?", (model_id,)).fetchone()
            if not account or not model:
                raise LookupError("account or portfolio model not found")
            profile = db.execute("SELECT * FROM risk_profiles WHERE user_id = ?", (user_id,)).fetchone()
            if not profile or RISK_SCORE[model["risk_level"]] > RISK_SCORE[profile["risk_level"]]:
                raise ValueError("portfolio exceeds user risk level")
            if account["balance_cents"] < cents:
                raise ValueError("insufficient balance")
            portfolio_id = "PF" + uuid.uuid4().hex[:10].upper()
            db.execute(
                "INSERT INTO portfolios VALUES (?, ?, ?, ?, ?, ?, 'active', ?)",
                (portfolio_id, user_id, account_id, model_id, name or model["name"], cents, now()),
            )
            allocations = json.loads(model["allocations"])
            allocated = 0
            for index, (product_type, percentage) in enumerate(allocations.items()):
                product = db.execute(
                    "SELECT id FROM investment_products WHERE product_type = ? AND status = 'active' "
                    "ORDER BY id LIMIT 1", (product_type,),
                ).fetchone()
                if not product:
                    raise ValueError(f"no product for {product_type}")
                portion = cents - allocated if index == len(allocations) - 1 else cents * percentage // 100
                allocated += portion
                db.execute("INSERT INTO portfolio_positions VALUES (?, ?, ?)",
                           (portfolio_id, product["id"], portion))
            db.execute("UPDATE accounts SET balance_cents = balance_cents - ? WHERE id = ?",
                       (cents, account_id))
            db.execute(
                "INSERT INTO transactions (account_id, kind, amount_cents, counterparty, note, "
                "created_at, direction, category, merchant) "
                "VALUES (?, 'portfolio_purchase', ?, ?, '', ?, 'out', 'investment', NULL)",
                (account_id, -cents, portfolio_id, now()),
            )
        return self.portfolio(user_id, portfolio_id)

    def portfolio(self, user_id, portfolio_id):
        with self.connect() as db:
            portfolio = db.execute(
                "SELECT * FROM portfolios WHERE id = ? AND user_id = ?", (portfolio_id, user_id)
            ).fetchone()
            if not portfolio:
                raise LookupError("portfolio not found")
            positions = db.execute(
                "SELECT portfolio_positions.*, investment_products.name FROM portfolio_positions "
                "JOIN investment_products ON investment_products.id = portfolio_positions.product_id "
                "WHERE portfolio_id = ? ORDER BY product_id", (portfolio_id,),
            ).fetchall()
        result = dict(portfolio)
        result["invested_amount"] = f'{Decimal(result.pop("invested_cents")) / 100:.2f}'
        result["positions"] = [{
            "product_id": row["product_id"], "product": row["name"],
            "amount": f'{Decimal(row["amount_cents"]) / 100:.2f}',
        } for row in positions]
        return result

    @staticmethod
    def _require_enterprise_owner(db, user_id, enterprise_id):
        row = db.execute(
            "SELECT 1 FROM enterprise_members WHERE enterprise_id = ? AND user_id = ? "
            "AND role IN ('OWNER', 'LEGAL_REPRESENTATIVE') AND status = 'active'",
            (enterprise_id, user_id),
        ).fetchone()
        if not row:
            raise ValueError("user cannot operate this enterprise")

    def _loan_application_row(self, db, user_id, application_id):
        row = db.execute(
            "SELECT loan_applications.* FROM loan_applications JOIN enterprise_members "
            "ON enterprise_members.enterprise_id = loan_applications.enterprise_id "
            "WHERE loan_applications.id = ? AND enterprise_members.user_id = ?",
            (application_id, user_id),
        ).fetchone()
        if not row:
            raise LookupError("loan application not found")
        return row

    def _loan_row(self, db, user_id, loan_id):
        row = db.execute(
            "SELECT loans.* FROM loans JOIN enterprise_members "
            "ON enterprise_members.enterprise_id = loans.enterprise_id "
            "WHERE loans.id = ? AND enterprise_members.user_id = ?",
            (loan_id, user_id),
        ).fetchone()
        if not row:
            raise LookupError("loan not found")
        return row

    @staticmethod
    def _loan_application_json(row):
        result = dict(row)
        result["amount"] = f'{Decimal(result.pop("amount_cents")) / 100:.2f}'
        approved = result.pop("approved_cents")
        result["approved_amount"] = f'{Decimal(approved) / 100:.2f}' if approved is not None else None
        result["decision_reasons"] = json.loads(result["decision_reasons"]) if result["decision_reasons"] else []
        return result

    @staticmethod
    def _loan_json(row):
        result = dict(row)
        result["principal"] = f'{Decimal(result.pop("principal_cents")) / 100:.2f}'
        result["outstanding"] = f'{Decimal(result.pop("outstanding_cents")) / 100:.2f}'
        return result

    @staticmethod
    def _investment_json(row):
        return {
            "id": row["id"], "name": row["name"], "product_type": row["product_type"],
            "risk_level": row["risk_level"], "expected_return_min": row["return_min"],
            "expected_return_max": row["return_max"],
            "minimum_amount": f'{Decimal(row["minimum_cents"]) / 100:.2f}',
            "lock_days": row["lock_days"], "liquidity": row["liquidity"],
            "fee_rate": row["fee_rate"], "issuer": row["issuer"],
        }
