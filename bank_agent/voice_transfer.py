"""Deterministic voice shortcuts for balance and transfer requests."""

import re
from decimal import Decimal, InvalidOperation

from bank_agent.voice_payees import candidate_prompt, match_payee_candidates, select_payee


TRANSFER_INTENT = re.compile(
    r"转账|转给|转到|给\s*.+?\s*转\s*(?:\d|[零〇一二两三四五六七八九十百千万])",
    re.IGNORECASE,
)
PAYEE_QUERY = re.compile(
    r"给\s*(.+?)\s*(?:转账|转给|转到|转(?=\s*(?:\d|[零〇一二两三四五六七八九十百千万])))",
    re.IGNORECASE,
)
CANCEL_WORDS = {"取消", "取消转账", "不用了", "算了", "cancel"}


def chinese_amount(text):
    """Parse the common spoken amounts used by the voice interface."""
    match = re.search(r"(\d+(?:\.\d+)?)\s*(?:元|块|人民币)?", text)
    if match:
        return match.group(1)
    common = {
        "一百": "100", "两百": "200", "二百": "200", "三百": "300",
        "五百": "500", "一千": "1000", "两千": "2000", "二千": "2000",
        "三千": "3000", "五千": "5000", "一万": "10000", "两万": "20000",
        "二万": "20000", "五万": "50000",
    }
    return next((amount for phrase, amount in common.items() if phrase in text), None)


def _submit_transfer(runtime, user_id, session_id, draft):
    payee = draft["selected_payee"]
    amount = draft["amount"]
    result = runtime.banking_tools.request_transfer(
        user_id,
        session_id,
        draft["source_account_id"],
        payee["account_id"],
        amount,
        note="语音测试转账",
    )
    if not result["success"]:
        return f"转账申请创建失败：{result['error']}"
    source = f"，当前从{draft['source_name']}转出" if draft.get("source_name") else ""
    return f"已创建向{payee['name']}转账 {amount} 元的待确认申请{source}。请回复“确认”或“取消”。"


def _continue_transfer_draft(runtime, user_id, session_id, text, context):
    draft = context["payee_choice"]
    normalized = text.strip()
    if normalized.lower() in CANCEL_WORDS:
        context.pop("payee_choice", None)
        return "已取消本次收款人选择，没有创建转账申请。"
    if TRANSFER_INTENT.search(normalized):
        context.pop("payee_choice", None)
        return None

    selected = draft.get("selected_payee") or select_payee(normalized, draft["payees"])
    if selected is None:
        return candidate_prompt(draft["payees"])
    draft["selected_payee"] = selected
    draft["amount"] = draft.get("amount") or chinese_amount(normalized)
    if draft["amount"] is None:
        return f"已选择{selected['name']}，请告诉我转账金额。"

    context.pop("payee_choice", None)
    return _submit_transfer(runtime, user_id, session_id, draft)


def _balance_response(runtime, user_id):
    result = runtime.banking_tools.get_accounts(user_id)
    if not result["success"]:
        return f"查询账户失败：{result['error']}"
    if not result["data"]:
        return "当前没有可用账户。"
    details = "；".join(
        f"{account['name']}（{account['id']}）余额 {account['balance']} 元"
        for account in result["data"]
    )
    return f"已查到你的账户：{details}。"


def fast_voice_response(runtime, user_id, session_id, text, voice_context=None):
    """Handle safe, deterministic voice operations without an LLM round-trip."""
    tools = runtime.banking_tools
    tools.actions.create_session(user_id, session_id)
    normalized = text.strip()

    pending = tools.get_pending_action(user_id, session_id)
    if pending["success"] and pending["data"]:
        return None

    context = voice_context if voice_context is not None else {}
    if context.get("payee_choice"):
        response = _continue_transfer_draft(runtime, user_id, session_id, normalized, context)
        if response is not None:
            return response

    if re.search(r"余额|账户余额|余额查询", normalized) and not re.search(r"转账|转给", normalized):
        return _balance_response(runtime, user_id)
    if not TRANSFER_INTENT.search(normalized):
        return None

    match = PAYEE_QUERY.search(normalized)
    if not match:
        return None
    query = match.group(1).strip(" ，,。")
    payees = tools.get_payees(user_id)
    accounts = tools.get_accounts(user_id)
    if not payees["success"] or not accounts["success"]:
        return None

    candidates = match_payee_candidates(query, payees["data"])
    if not candidates:
        return f"没有找到与“{query}”匹配的收款人。请改说账户尾号或检查收款人名单。"
    source = next(
        (account for account in accounts["data"] if account.get("status") == "active"),
        None,
    )
    if source is None:
        return "当前没有可用的转出账户。"

    amount = chinese_amount(normalized)
    if amount is not None:
        try:
            Decimal(amount)
        except InvalidOperation:
            return None

    draft = {
        "payees": candidates,
        "source_account_id": source["id"],
        "source_name": source["name"],
        "amount": amount,
    }
    if len(candidates) > 1:
        if voice_context is not None:
            voice_context["payee_choice"] = draft
        suffix = "" if amount is not None else "选定后我会继续询问转账金额。"
        return candidate_prompt(candidates) + suffix

    draft["selected_payee"] = candidates[0]
    if amount is None:
        if voice_context is not None:
            voice_context["payee_choice"] = draft
        return f"可以给{candidates[0]['name']}转账。请告诉我具体转账金额。"
    return _submit_transfer(runtime, user_id, session_id, draft)
