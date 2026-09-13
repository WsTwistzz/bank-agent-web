# Banking Tools

Tool 为 Agent 提供结构化银行能力。只读 Tool 调用 Bank Gateway；修改类 Tool 只创建 Action，由 Action & Security 控制确认、强验证和真实执行。

`registry.py` 保存 Agent 可见的 Tool 名称、说明和 JSON Schema。`user_id` 与 `session_id` 不在 Schema 中，由可信运行时注入。

Registry 还保存不暴露给模型修改的工具元数据。`registry.metadata()` 会明确返回每个工具的
`access`（`read` 或 `write`）和 `user_scoped`；编排器使用该元数据实施专家白名单和并行
只读策略，不依赖工具名称猜测权限。

所有 Tool 统一返回：

```json
{"success": true, "data": {}, "error": null}
```

主要 Tool：

```text
get_accounts
get_balance
get_transactions
analyze_spending
detect_unusual_transactions
find_payee
prepare_transfer
get_transfer
get_cards
get_investment_products
get_investment_positions
get_direct_debits

request_transfer
request_freeze_card
request_unfreeze_card
request_report_card_lost
request_set_card_limit
request_purchase_investment
request_redeem_investment
request_cancel_direct_debit
```

修改类 Tool 返回 `WAITING_CONFIRMATION` 或 `WAITING_STRONG_AUTH`，不会直接声称银行操作成功。确认和验证分别调用 `confirm_action`、`verify_action`。

创建 Tool：

```python
from actions import OTPVerifier
from bank_gateway import BankGateway
from tools import BankingTools, create_bank_action_service

gateway = BankGateway("http://127.0.0.1:8000")
otp = OTPVerifier(send_sms_code, db_path="otp.db")
actions = create_bank_action_service(
    gateway,
    db_path="actions.db",
    verifier=otp,
)
banking_tools = BankingTools(gateway, actions)
session_id = actions.create_session("U1")["session_id"]
```

示例：

```python
result = banking_tools.get_balance("U1", "A1001")

pending = banking_tools.request_transfer(
    "U1", session_id, "A1001", "A1002", "100.00"
)
result = banking_tools.confirm_pending_action("U1", session_id)
```

Agent 通过 Registry 调用时只提交业务参数：

```python
from tools import create_banking_tool_registry

registry = create_banking_tool_registry(banking_tools)
schemas = registry.definitions()
result = registry.call(
    "get_balance",
    {"account_id": "A1001"},
    user_id="U1",
    session_id=session_id,
)
```

写工具还必须收到可信运行时生成的 `request_id`。Registry 会结合请求、用户、会话、工具名
和规范化业务参数生成稳定幂等键；`request_id` 和幂等键均不出现在模型工具 Schema 中：

```python
result = registry.call(
    "request_transfer",
    {"source_account_id": "A1001", "target_account_id": "A1002", "amount": "100.00"},
    user_id="U1",
    session_id=session_id,
    request_id="REQ-generated-by-trusted-runtime",
)
```

Registry 会拒绝未知 Tool、缺失字段、多余字段和错误参数类型。确认、强验证和拒绝不是 Agent Tool，由对话运行时根据当前会话处理。

## 新增 Tool 模板

Tool 使用 `ReadTool` 和 `ActionTool` 两个可复用模板。一般不需要再写新的 Tool class，只需声明 Schema 和对应的 `BankingTools` 方法：

```python
from tools import ActionTool, ReadTool

balance = ReadTool(
    banking_tools=banking_tools,
    name="get_balance",
    description="查询指定账户余额",
    method="get_balance",
    properties={"account_id": {"type": "string"}},
    required=["account_id"],
)

scheduled_transfer = ActionTool(
    banking_tools=banking_tools,
    name="request_schedule_transfer",
    description="申请定时转账",
    method="request_schedule_transfer",
    properties={
        "source_account_id": {"type": "string"},
        "target_account_id": {"type": "string"},
        "amount": {"type": "string"},
        "execute_at": {"type": "string"},
    },
    required=[
        "source_account_id",
        "target_account_id",
        "amount",
        "execute_at",
    ],
)
```

`ReadTool` 自动注入可信 `user_id`；`ActionTool` 自动注入可信 `user_id` 和 `session_id`。模型只能提交 `properties` 中的业务参数。修改类方法仍必须在 `BankingTools` 内进入 `ActionService`，不能直接调用 Gateway 写接口。

红色操作的运行时流程：

```python
banking_tools.request_pending_verification("U1", session_id)
result = banking_tools.verify_pending_action("U1", session_id, sms_code)
```

Mock Bank 和 Gateway 不提供直接转账方法。转账只能经过 Action & Security 后调用 `prepare_transfer()` 和 `execute_transfer()`。
