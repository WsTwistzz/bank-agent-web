"""Versioned contracts between Agent/Graph orchestration and banking tools.

This module is the source of truth shared by the two implementation areas.
Agent code may depend on these types, but must not depend on gateway or bank
HTTP response shapes directly.
"""

from dataclasses import dataclass
from typing import Literal, NotRequired, TypedDict


PROTOCOL_VERSION = "1.0"

AgentName = Literal["account", "payment", "risk", "analysis", "general"]
LegacyAgentName = Literal["operations", "investment"]
RuntimeAgentName = AgentName | LegacyAgentName
ToolDomain = Literal["account", "payment", "risk", "analysis"]
ToolAccess = Literal["read", "write"]


@dataclass(frozen=True)
class ToolExecutionContext:
    """Trusted runtime context; no field is accepted from model arguments."""

    user_id: str
    session_id: str
    request_id: str | None = None
    turn_id: str | None = None
    graph: str | None = None
    node: str | None = None
    specialist: RuntimeAgentName | None = None
    idempotency_key: str | None = None
    protocol_version: str = PROTOCOL_VERSION


class AgentTask(TypedDict):
    specialist: AgentName
    task: str


class ToolError(TypedDict):
    code: str
    message: str
    retryable: bool
    details: NotRequired[dict]


class ToolResult(TypedDict):
    success: bool
    data: object | None
    error: ToolError | None


class BalanceResult(TypedDict):
    account_id: str
    currency: str
    balance: str
    available_balance: str
    status: Literal["active", "frozen", "closed"]
    as_of: str


class RiskAssessment(TypedDict):
    assessment_id: str
    decision: Literal["ALLOW", "REVIEW", "DENY"]
    risk_level: Literal["LOW", "MEDIUM", "HIGH"]
    requires_confirmation: bool
    requires_strong_auth: bool
    reasons: list[str]
    policy_version: str


ActionStatus = Literal[
    "WAITING_CONFIRMATION",
    "WAITING_STRONG_AUTH",
    "SUCCEEDED",
    "REJECTED",
    "FAILED",
    "EXPIRED",
    "BLOCKED",
]


class PendingAction(TypedDict):
    action_id: str
    action_type: str
    status: ActionStatus
    risk_level: Literal["GREEN", "YELLOW", "RED"]
    created_at: str
    expires_at: str | None


TOOL_ERROR_CODES = frozenset({
    "INVALID_ARGUMENT",
    "UNAUTHORIZED_TOOL",
    "RESOURCE_FORBIDDEN",
    "RESOURCE_NOT_FOUND",
    "ACCOUNT_INACTIVE",
    "INSUFFICIENT_FUNDS",
    "LIMIT_EXCEEDED",
    "RISK_REJECTED",
    "ACTION_ALREADY_PENDING",
    "BANK_UNAVAILABLE",
    "TIMEOUT",
    "INTERNAL_ERROR",
})


# Stable external capability catalog. Values are (capability, domain, access).
TOOL_CAPABILITIES_V1 = {
    "get_accounts": ("account.list.read", "account", "read"),
    "get_balance": ("account.balance.read", "account", "read"),
    "get_transactions": ("account.transactions.read", "account", "read"),
    "get_cards": ("account.cards.read", "account", "read"),
    "find_payee": ("payment.payee.read", "payment", "read"),
    "get_transfer": ("payment.transfer.read", "payment", "read"),
    "get_direct_debits": ("payment.direct_debits.read", "payment", "read"),
    "request_transfer": ("payment.transfer.prepare", "payment", "write"),
    "request_cancel_direct_debit": ("payment.direct_debit.cancel.prepare", "payment", "write"),
    "evaluate_transfer_risk": ("risk.transfer.evaluate", "risk", "read"),
    "detect_unusual_transactions": ("risk.transactions.evaluate", "risk", "read"),
    "request_freeze_card": ("risk.card.freeze.prepare", "risk", "write"),
    "request_report_card_lost": ("risk.card.report_lost.prepare", "risk", "write"),
    "request_set_card_limit": ("risk.card_limit.prepare", "risk", "write"),
    "analyze_spending": ("analysis.spending.run", "analysis", "read"),
    "get_investment_products": ("investment.products.read", "analysis", "read"),
    "get_investment_positions": ("investment.positions.read", "analysis", "read"),
    "request_purchase_investment": ("investment.purchase.prepare", "analysis", "write"),
    "request_redeem_investment": ("investment.redeem.prepare", "analysis", "write"),
}

TOOLS_PENDING_B_IMPLEMENTATION = frozenset({"evaluate_transfer_risk"})
