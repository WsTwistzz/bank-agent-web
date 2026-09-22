from dataclasses import dataclass, field, replace
from functools import partial
import hashlib
import json

from bank_agent.contracts import ToolExecutionContext


STRING = {"type": "string"}
LIMIT = {"type": "integer", "minimum": 1, "maximum": 500}


ToolContext = ToolExecutionContext


@dataclass
class BankTool:
    """Reusable declaration for one Agent-facing banking capability."""

    banking_tools: object
    name: str
    description: str
    method: str
    display_name: str = ""
    properties: dict = field(default_factory=dict)
    required: list[str] = field(default_factory=list)
    defaults: dict = field(default_factory=dict)
    domain: str = "general"
    capability: str = ""
    tags: frozenset[str] = field(default_factory=frozenset)
    allowed_specialists: frozenset[str] = field(default_factory=frozenset)
    access: str = field(init=False, default="unknown")

    def metadata(self):
        return {
            "name": self.name,
            "display_name": self.display_name or self.description,
            "access": self.access,
            "user_scoped": getattr(self, "user_scoped", True),
            "domain": self.domain,
            "capability": self.capability,
            "tags": sorted(self.tags),
            "allowed_specialists": sorted(self.allowed_specialists),
        }

    def definition(self):
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": {
                    "type": "object",
                    "properties": self.properties,
                    "required": self.required,
                    "additionalProperties": False,
                },
            },
        }

    def execute(self, arguments, context):
        self.validate(arguments)
        parameters = self.defaults | arguments
        return getattr(self.banking_tools, self.method)(
            **self.runtime_parameters(context),
            **parameters,
        )

    def runtime_parameters(self, context):
        raise NotImplementedError

    def validate(self, arguments):
        if not isinstance(arguments, dict):
            raise ValueError("tool arguments must be an object")
        missing = [name for name in self.required if name not in arguments]
        if missing:
            raise ValueError("missing fields: " + ", ".join(missing))
        unknown = set(arguments) - set(self.properties)
        if unknown:
            raise ValueError("unknown fields: " + ", ".join(sorted(unknown)))

        python_types = {"string": str, "integer": int, "number": (int, float)}
        for name, value in arguments.items():
            schema = self.properties[name]
            expected = python_types.get(schema.get("type"))
            if expected and (not isinstance(value, expected) or isinstance(value, bool)):
                raise ValueError(f"{name} has invalid type")
            if "minimum" in schema and value < schema["minimum"]:
                raise ValueError(f"{name} is below minimum")
            if "maximum" in schema and value > schema["maximum"]:
                raise ValueError(f"{name} is above maximum")


class ReadTool(BankTool):
    """A query Tool. Set user_scoped=False only for public catalog data."""

    access = "read"

    def __init__(self, *args, user_scoped=True, **kwargs):
        super().__init__(*args, **kwargs)
        self.access = "read"
        self.user_scoped = user_scoped

    def runtime_parameters(self, context):
        return {"user_id": context.user_id} if self.user_scoped else {}


class ActionTool(BankTool):
    """A state-changing Tool routed through Action & Security."""

    access = "write"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.access = "write"

    def runtime_parameters(self, context):
        parameters = {"user_id": context.user_id, "session_id": context.session_id}
        if context.idempotency_key:
            parameters["idempotency_key"] = context.idempotency_key
        return parameters


class ToolRegistry:
    """Agent-facing Tool collection with trusted identity injection."""

    def __init__(self, tools=()):
        self.tools = {tool.name: tool for tool in tools}

    def definitions(self, names=None):
        selected = self.tools.values()
        if names is not None:
            selected = (self.tools[name] for name in sorted(names) if name in self.tools)
        return [tool.definition() for tool in selected]

    def metadata(self, names=None):
        selected = self.tools.values()
        if names is not None:
            selected = (self.tools[name] for name in sorted(names) if name in self.tools)
        return [tool.metadata() for tool in selected]

    def is_write(self, name):
        tool = self.tools.get(name)
        return bool(tool and tool.access == "write")

    def tools_for_specialist(self, specialist):
        """Return tools visible to a specialist according to tool-owned policy."""
        return {
            name for name, tool in self.tools.items()
            if not tool.allowed_specialists or specialist in tool.allowed_specialists
        }

    def describe(self, name):
        tool = self.tools.get(name)
        return tool.metadata() if tool else {}

    def call(
        self, name, arguments, user_id=None, session_id=None, request_id=None,
        graph=None, node=None, specialist=None, context=None,
    ):
        tool = self.tools.get(name)
        if not tool:
            return {"success": False, "data": None, "error": "unknown tool"}
        if context is not None:
            user_id = context.user_id
            session_id = context.session_id
            request_id = context.request_id
            graph = context.graph
            node = context.node
            specialist = context.specialist
        if not user_id or not session_id:
            return {"success": False, "data": None, "error": "runtime identity is required"}
        if (specialist and tool.allowed_specialists
                and specialist not in tool.allowed_specialists):
            return {
                "success": False, "data": None,
                "error": f"tool is not allowed for specialist: {specialist}",
            }
        try:
            idempotency_key = None
            if tool.access == "write":
                if not request_id:
                    return {
                        "success": False,
                        "data": None,
                        "error": "trusted request_id is required for write tools",
                    }
                idempotency_key = self._idempotency_key(
                    request_id, user_id, session_id, name, arguments
                )
            if context is None:
                context = ToolExecutionContext(
                    user_id=user_id, session_id=session_id,
                    request_id=request_id, graph=graph, node=node,
                    specialist=specialist,
                )
            context = replace(context, idempotency_key=idempotency_key)
            return tool.execute(arguments, context)
        except (TypeError, ValueError) as error:
            return {"success": False, "data": None, "error": str(error)}

    @staticmethod
    def _idempotency_key(request_id, user_id, session_id, name, arguments):
        canonical = json.dumps(arguments, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        material = "\x1f".join((request_id, user_id, session_id, name, canonical))
        return "agent:" + hashlib.sha256(material.encode("utf-8")).hexdigest()


def create_banking_tool_registry(banking_tools):
    read = partial(ReadTool, banking_tools=banking_tools)
    action = partial(ActionTool, banking_tools=banking_tools)

    return ToolRegistry([
        read(
            name="get_accounts", description="查询当前用户的银行账户", method="get_accounts",
            domain="account", capability="account.list.read",
            tags=frozenset({"account", "read", "shared"}),
            allowed_specialists=frozenset({"account", "operations", "investment", "payment", "risk", "analysis", "general"}),
        ),
        read(
            name="get_balance", description="查询指定账户余额", method="get_balance",
            properties={"account_id": STRING}, required=["account_id"],
            domain="account", capability="account.balance.read",
            tags=frozenset({"account", "balance", "read", "shared"}),
            allowed_specialists=frozenset({"account", "operations", "investment", "payment", "risk", "analysis", "general"}),
        ),
        read(
            name="get_transactions", description="查询账户交易流水", method="get_transactions",
            properties={
                "account_id": STRING, "start_date": STRING, "end_date": STRING, "limit": LIMIT,
            },
            required=["account_id"], defaults={"start_date": None, "end_date": None, "limit": 100},
            domain="account", capability="account.transactions.read",
            tags=frozenset({"account", "transaction", "read", "analysis", "risk"}),
            allowed_specialists=frozenset({"account", "risk", "analysis", "general"}),
        ),
        read(
            name="analyze_spending", description="统计账户消费金额和分类", method="analyze_spending",
            properties={"account_id": STRING, "start_date": STRING, "end_date": STRING},
            required=["account_id"], defaults={"start_date": None, "end_date": None},
            domain="analysis", capability="analysis.spending.run",
            tags=frozenset({"analysis", "spending", "read"}),
            allowed_specialists=frozenset({"account", "analysis", "general"}),
        ),
        read(
            name="detect_unusual_transactions", description="按金额阈值检测异常交易",
            method="detect_unusual_transactions",
            properties={"account_id": STRING, "threshold": STRING}, required=["account_id"],
            defaults={"threshold": "1000.00"},
            domain="risk", capability="risk.transactions.evaluate",
            tags=frozenset({"risk", "transaction", "read"}),
            allowed_specialists=frozenset({"account", "risk", "general"}),
        ),
        read(
            name="find_payee", description="按姓名、手机号或别名查找当前用户的收款人",
            method="find_payee", properties={"query": STRING}, required=["query"],
            domain="payment", capability="payment.payee.read",
            tags=frozenset({"payment", "payee", "read"}),
            allowed_specialists=frozenset({"operations", "payment", "general"}),
        ),
        read(
            name="get_transfer", description="查询转账状态", method="get_transfer",
            properties={"transfer_id": STRING}, required=["transfer_id"],
            domain="payment", capability="payment.transfer.read",
            tags=frozenset({"payment", "transfer", "read"}),
            allowed_specialists=frozenset({"operations", "payment", "risk", "general"}),
        ),
        read(
            name="get_cards", description="查询当前用户的银行卡", method="get_cards",
            domain="account", capability="account.cards.read",
            tags=frozenset({"account", "card", "read", "shared"}),
            allowed_specialists=frozenset({"account", "operations", "payment", "risk", "general"}),
        ),
        read(
            name="get_investment_products", description="查询可购买的理财产品",
            method="get_investment_products", user_scoped=False,
            domain="analysis", capability="investment.products.read",
            tags=frozenset({"analysis", "investment", "read", "public"}),
            allowed_specialists=frozenset({"investment", "analysis", "general"}),
        ),
        read(
            name="get_investment_positions", description="查询账户理财持仓",
            method="get_investment_positions", properties={"account_id": STRING},
            required=["account_id"],
            domain="analysis", capability="investment.positions.read",
            tags=frozenset({"analysis", "investment", "read"}),
            allowed_specialists=frozenset({"investment", "analysis", "general"}),
        ),
        read(
            name="get_direct_debits", description="查询当前用户的代扣协议",
            method="get_direct_debits",
            domain="payment", capability="payment.direct_debits.read",
            tags=frozenset({"payment", "direct_debit", "read"}),
            allowed_specialists=frozenset({"operations", "payment", "general"}),
        ),
        action(
            name="request_transfer", description="申请转账；系统会根据金额要求确认或强验证",
            method="request_transfer",
            properties={
                "source_account_id": STRING, "target_account_id": STRING,
                "amount": STRING, "note": STRING,
            },
            required=["source_account_id", "target_account_id", "amount"], defaults={"note": ""},
            domain="payment", capability="payment.transfer.prepare",
            tags=frozenset({"payment", "transfer", "write", "confirmation"}),
            allowed_specialists=frozenset({"operations", "payment"}),
        ),
        action(
            name="request_freeze_card", description="申请冻结银行卡", method="request_freeze_card",
            properties={"card_id": STRING}, required=["card_id"],
            domain="risk", capability="risk.card.freeze.prepare",
            tags=frozenset({"risk", "card", "write", "confirmation"}),
            allowed_specialists=frozenset({"operations", "risk"}),
        ),
        action(
            name="request_report_card_lost", description="申请挂失银行卡；需要强验证",
            method="request_report_card_lost", properties={"card_id": STRING}, required=["card_id"],
            domain="risk", capability="risk.card.report_lost.prepare",
            tags=frozenset({"risk", "card", "write", "strong_auth"}),
            allowed_specialists=frozenset({"operations", "risk"}),
        ),
        action(
            name="request_set_card_limit", description="申请调整银行卡额度",
            method="request_set_card_limit", properties={"card_id": STRING, "amount": STRING},
            required=["card_id", "amount"],
            domain="risk", capability="risk.card_limit.prepare",
            tags=frozenset({"risk", "card", "write", "confirmation"}),
            allowed_specialists=frozenset({"operations", "risk"}),
        ),
        action(
            name="request_purchase_investment", description="申请购买理财产品；需要强验证",
            method="request_purchase_investment",
            properties={"account_id": STRING, "product": STRING, "amount": STRING},
            required=["account_id", "product", "amount"],
            domain="analysis", capability="investment.purchase.prepare",
            tags=frozenset({"analysis", "investment", "write", "strong_auth"}),
            allowed_specialists=frozenset({"investment", "analysis"}),
        ),
        action(
            name="request_redeem_investment", description="申请赎回理财产品；需要强验证",
            method="request_redeem_investment",
            properties={"account_id": STRING, "product": STRING, "amount": STRING},
            required=["account_id", "product", "amount"],
            domain="analysis", capability="investment.redeem.prepare",
            tags=frozenset({"analysis", "investment", "write", "strong_auth"}),
            allowed_specialists=frozenset({"investment", "analysis"}),
        ),
        action(
            name="request_cancel_direct_debit", description="申请取消代扣协议",
            method="request_cancel_direct_debit", properties={"debit_id": STRING},
            required=["debit_id"],
            domain="payment", capability="payment.direct_debit.cancel.prepare",
            tags=frozenset({"payment", "direct_debit", "write", "confirmation"}),
            allowed_specialists=frozenset({"operations", "payment"}),
        ),
    ])
