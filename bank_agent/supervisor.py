ROUTE_TOOL = [{
    "type": "function",
    "function": {
        "name": "route_to_agents",
        "description": "把用户请求拆分并路由给一个或多个专业 Agent",
        "parameters": {
            "type": "object",
            "properties": {
                "tasks": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": 3,
                    "items": {
                        "type": "object",
                        "properties": {
                            "specialist": {
                                "type": "string",
                                "enum": ["account", "operations", "investment", "general"],
                            },
                            "task": {"type": "string"},
                        },
                        "required": ["specialist", "task"],
                        "additionalProperties": False,
                    },
                },
                "reason": {"type": "string"},
            },
            "required": ["tasks", "reason"],
            "additionalProperties": False,
        },
    },
}]


SPECIALISTS = {
    "account": {
        "prompt": "你是账户与账单分析 Agent，只处理账户、余额、流水、消费分析和异常交易。",
        "tools": {
            "get_accounts", "get_balance", "get_transactions",
            "analyze_spending", "detect_unusual_transactions",
        },
    },
    "operations": {
        "prompt": "你是银行业务 Agent，处理收款人、转账、银行卡和代扣业务。",
        "tools": {
            "find_payee", "get_transfer", "get_cards", "get_direct_debits",
            "request_transfer", "request_freeze_card", "request_report_card_lost",
            "request_set_card_limit", "request_cancel_direct_debit",
        },
    },
    "investment": {
        "prompt": "你是理财 Agent，只处理理财产品、持仓、申购和赎回。不得承诺收益。",
        "tools": {
            "get_investment_products", "get_investment_positions",
            "request_purchase_investment", "request_redeem_investment",
        },
    },
    "general": {
        "prompt": (
            "你是银行服务总览 Agent。回答银行服务能力介绍或跨银行领域问题。"
            "如果用户请求与银行业务无关，简短、自然地说明你专注于银行服务，"
            "并引导用户询问账户、余额、流水、转账、银行卡、代扣或理财；"
            "不要回答无关领域的实质内容。"
        ),
        "tools": None,
    },
}


class Supervisor:
    def __init__(self, model, mode="standard", max_parallelism=3):
        self.model = model
        self.mode = mode
        self.max_parallelism = max_parallelism

    def route(self, message):
        prompt = (
            "你是 Supervisor。只调用 route_to_agents，不处理银行业务。"
            "账户余额/流水选 account；转账/卡/代扣选 operations；"
            "理财选 investment；能力介绍或闲聊选 general。"
            "为每个 Agent 写一条明确且自包含的委派任务。"
            "涉及转账、申购、赎回、冻结卡等修改操作时只能委派一个对应专业 Agent。"
        )
        if self.mode == "standard":
            prompt += "当前是 standard 模式，只能返回一个任务；跨领域请求选 general。"
        else:
            prompt += "当前是 expert 模式；跨领域请求必须拆给对应的多个专家，同领域不要重复委派。"
        reply = self.model.respond([
            {"role": "system", "content": prompt},
            {"role": "user", "content": message},
        ], ROUTE_TOOL)
        calls = reply.get("tool_calls") or []
        if calls and calls[0].get("name") == "route_to_agents":
            arguments = calls[0].get("arguments", {})
            tasks = self._normalize_tasks(arguments.get("tasks"))
            if tasks:
                return tasks, arguments.get("reason", "")
        return [{"specialist": "general", "task": message}], "Supervisor 未返回有效路由，安全回退到 general"

    def _normalize_tasks(self, tasks):
        if not isinstance(tasks, list):
            return []
        normalized = []
        seen = set()
        for item in tasks:
            if not isinstance(item, dict):
                continue
            specialist = item.get("specialist")
            task = item.get("task")
            if specialist not in SPECIALISTS or not isinstance(task, str) or not task.strip():
                continue
            if specialist in seen:
                continue
            seen.add(specialist)
            normalized.append({"specialist": specialist, "task": task.strip()})
        if len(normalized) > 1:
            normalized = [item for item in normalized if item["specialist"] != "general"]
        limit = 1 if self.mode == "standard" else self.max_parallelism
        return normalized[:limit]
