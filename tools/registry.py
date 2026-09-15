from dataclasses import dataclass, field
from functools import partial
import hashlib
import json


STRING = {"type": "string"}
LIMIT = {"type": "integer", "minimum": 1, "maximum": 500}


@dataclass(frozen=True)
class ToolContext:
    """Identity supplied by the trusted runtime, never by the model."""

    user_id: str
    session_id: str
    idempotency_key: str | None = None


@dataclass
class BankTool:
    """Reusable declaration for one Agent-facing banking capability."""

    banking_tools: object
    name: str
    description: str
    method: str
    properties: dict = field(default_factory=dict)
    required: list[str] = field(default_factory=list)
    defaults: dict = field(default_factory=dict)
    access: str = field(init=False, default="unknown")

    def metadata(self):
        return {
            "name": self.name,
            "access": self.access,
            "user_scoped": getattr(self, "user_scoped", True),
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

    def call(self, name, arguments, user_id, session_id, request_id=None):
        tool = self.tools.get(name)
        if not tool:
            return {"success": False, "data": None, "error": "unknown tool"}
        if not user_id or not session_id:
            return {"success": False, "data": None, "error": "runtime identity is required"}
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
            return tool.execute(
                arguments,
                ToolContext(user_id, session_id, idempotency_key=idempotency_key),
            )
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
        read(name="get_accounts", description="查询当前用户的银行账户", method="get_accounts"),
        read(
            name="get_balance", description="查询指定账户余额", method="get_balance",
            properties={"account_id": STRING}, required=["account_id"],
        ),
        read(
            name="get_transactions", description="查询账户交易流水", method="get_transactions",
            properties={
                "account_id": STRING, "start_date": STRING, "end_date": STRING, "limit": LIMIT,
            },
            required=["account_id"], defaults={"start_date": None, "end_date": None, "limit": 100},
        ),
        read(
            name="analyze_spending", description="统计账户消费金额和分类", method="analyze_spending",
            properties={"account_id": STRING, "start_date": STRING, "end_date": STRING},
            required=["account_id"], defaults={"start_date": None, "end_date": None},
        ),
        read(
            name="detect_unusual_transactions", description="按金额阈值检测异常交易",
            method="detect_unusual_transactions",
            properties={"account_id": STRING, "threshold": STRING}, required=["account_id"],
            defaults={"threshold": "1000.00"},
        ),
        read(
            name="find_payee", description="按姓名、手机号或别名查找当前用户的收款人",
            method="find_payee", properties={"query": STRING}, required=["query"],
        ),
        read(
            name="get_transfer", description="查询转账状态", method="get_transfer",
            properties={"transfer_id": STRING}, required=["transfer_id"],
        ),
        read(name="get_cards", description="查询当前用户的银行卡", method="get_cards"),
        read(
            name="get_investment_products", description="查询可购买的理财产品",
            method="get_investment_products", user_scoped=False,
        ),
        read(
            name="get_investment_positions", description="查询账户理财持仓",
            method="get_investment_positions", properties={"account_id": STRING},
            required=["account_id"],
        ),
        read(
            name="get_direct_debits", description="查询当前用户的代扣协议",
            method="get_direct_debits",
        ),
        action(
            name="request_transfer", description="申请转账；系统会根据金额要求确认或强验证",
            method="request_transfer",
            properties={
                "source_account_id": STRING, "target_account_id": STRING,
                "amount": STRING, "note": STRING,
            },
            required=["source_account_id", "target_account_id", "amount"], defaults={"note": ""},
        ),
        action(
            name="request_freeze_card", description="申请冻结银行卡", method="request_freeze_card",
            properties={"card_id": STRING}, required=["card_id"],
        ),
        action(
            name="request_report_card_lost", description="申请挂失银行卡；需要强验证",
            method="request_report_card_lost", properties={"card_id": STRING}, required=["card_id"],
        ),
        action(
            name="request_set_card_limit", description="申请调整银行卡额度",
            method="request_set_card_limit", properties={"card_id": STRING, "amount": STRING},
            required=["card_id", "amount"],
        ),
        action(
            name="request_purchase_investment", description="申请购买理财产品；需要强验证",
            method="request_purchase_investment",
            properties={"account_id": STRING, "product": STRING, "amount": STRING},
            required=["account_id", "product", "amount"],
        ),
        action(
            name="request_redeem_investment", description="申请赎回理财产品；需要强验证",
            method="request_redeem_investment",
            properties={"account_id": STRING, "product": STRING, "amount": STRING},
            required=["account_id", "product", "amount"],
        ),
        action(
            name="request_cancel_direct_debit", description="申请取消代扣协议",
            method="request_cancel_direct_debit", properties={"debit_id": STRING},
            required=["debit_id"],
        ),
    ])
