"""User-facing descriptions for pending banking actions."""


def _describe_action(action_type, payload):
    if action_type == "TRANSFER":
        detail = (
            f"从账户 {payload.get('source_account_id', '未知')} 向账户 "
            f"{payload.get('target_account_id', '未知')} 转账 "
            f"{payload.get('amount', '未知')} 元"
        )
        return detail + (f"，备注“{payload['note']}”" if payload.get("note") else "")
    if action_type == "SET_CARD_LIMIT":
        return f"将银行卡 {payload.get('card_id', '未知')} 的限额设置为 {payload.get('amount', '未知')} 元"
    if action_type in {"PURCHASE_INVESTMENT", "REDEEM_INVESTMENT"}:
        verb = "购买" if action_type == "PURCHASE_INVESTMENT" else "赎回"
        return (
            f"从账户 {payload.get('account_id', '未知')}{verb}理财产品 "
            f"{payload.get('product', '未知')}，金额 {payload.get('amount', '未知')} 元"
        )
    card_actions = {
        "FREEZE_CARD": "冻结",
        "UNFREEZE_CARD": "解除冻结",
        "REPORT_CARD_LOST": "挂失",
    }
    if action_type in card_actions:
        return f"{card_actions[action_type]}银行卡 {payload.get('card_id', '未知')}"
    if action_type == "CANCEL_DIRECT_DEBIT":
        return f"取消自动扣款协议 {payload.get('debit_id', '未知')}"
    return "银行操作"


def pending_action_prompt(action):
    payload = action.get("payload", {})
    action_type = action.get("action_type", "操作")
    detail = _describe_action(action_type, payload)

    if action.get("status") == "WAITING_CONFIRMATION":
        return f"{detail}，正在等待确认。请明确回复“确认”或“取消”。"
    return f"{detail}，需要强验证（安全验证）。请回复“发送验证码”或“取消”。"
