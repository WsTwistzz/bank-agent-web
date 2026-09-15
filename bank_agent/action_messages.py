"""User-facing descriptions for pending banking actions."""


ACTION_NAMES = {
    "TRANSFER": "转账",
    "FREEZE_CARD": "冻结银行卡",
    "UNFREEZE_CARD": "解除银行卡冻结",
    "REPORT_CARD_LOST": "银行卡挂失",
    "SET_CARD_LIMIT": "设置银行卡限额",
    "PURCHASE_INVESTMENT": "购买理财产品",
    "REDEEM_INVESTMENT": "赎回理财产品",
    "CANCEL_DIRECT_DEBIT": "取消自动扣款",
}


def pending_action_prompt(action):
    payload = action.get("payload", {})
    action_type = action.get("action_type", "操作")
    if action_type == "TRANSFER":
        detail = (
            f"从账户 {payload.get('source_account_id', '未知')} 向账户 "
            f"{payload.get('target_account_id', '未知')} 转账 "
            f"{payload.get('amount', '未知')} 元"
        )
        if payload.get("note"):
            detail += f"，备注“{payload['note']}”"
    else:
        detail = ACTION_NAMES.get(action_type, "银行操作")

    if action.get("status") == "WAITING_CONFIRMATION":
        return f"{detail}，正在等待确认。请明确回复“确认”或“取消”。"
    return f"{detail}，需要强验证（安全验证）。请回复“发送验证码”或“取消”。"
