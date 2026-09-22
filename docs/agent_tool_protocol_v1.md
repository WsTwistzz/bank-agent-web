# Agent ↔ Tool/Bank Protocol v1.0

状态：**FROZEN**

代码事实源：`bank_agent/contracts.py`

适用边界：Agent/Graph 编排（A）与 Tool、Action、Gateway、Bank API（B）之间

## 1. 所有权

A 负责 Supervisor、Graph、Graph State、Prompt、Planner 和 Graph 生命周期事件。B 负责
Tool Registry、Tool 实现、Action Service、风控规则、Gateway、银行接口及 Tool 执行事件。
Agent 只能通过 Registry 使用银行能力，不能直接依赖 Gateway 或 HTTP 返回结构。

## 2. Agent 名称

正式名称固定为 `account`、`payment`、`risk`、`analysis`、`general`。
`operations`、`investment` 仅为当前代码迁移期间的兼容别名；新 Graph、Capability 和测试不得
继续使用这两个旧名称。B 在迁移完成前需要兼容旧名称。

## 3. Tool 调用

新代码使用以下形式：

```python
registry.call(
    name="get_balance",
    arguments={"account_id": "A1001"},
    context=ToolExecutionContext(
        user_id="U1",
        session_id="S1",
        request_id="REQ1",
        graph="payment",
        node="validate_funds",
        specialist="payment",
    ),
)
```

`ToolExecutionContext` 全部由可信运行时注入。模型不得提供 `user_id`、`session_id`、
`request_id`、`turn_id`、`graph`、`node`、`specialist`、`idempotency_key` 或
`tool_call_id`。`turn_id` 在 Graph 统一生成前允许为 `None`。

旧的位置参数调用只用于迁移兼容，不作为新代码接口。

## 4. Tool Manifest

每个 Agent-facing Tool 必须声明：`name`、`display_name`、`description`、`domain`、
`capability`、`access`、`user_scoped`、`tags`、`allowed_specialists` 和输入 Schema。

- `domain`：`account | payment | risk | analysis`
- `access`：`read | write`。这里的 `write` 表示创建受控 Pending Action，Agent 不获得直接
  执行银行最终写操作的 Tool；`.prepare` Capability 用于表达这一语义。
- `capability`：稳定标识，一旦发布不得改变含义。
- `tags`：检索和展示元数据，不作为授权依据。
- `allowed_specialists`：Planner 可见性与 Registry 执行时校验均使用。

## 5. Tool Result

B 的目标返回结构固定为：

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "INSUFFICIENT_FUNDS",
    "message": "可用余额不足",
    "retryable": false,
    "details": {}
  }
}
```

成功时 `error` 必须为 `null`；失败时 `data` 必须为 `null`。现有字符串 `error` 是待 B
迁移的旧格式。Graph 新逻辑只依据 `error.code` 分支，不匹配错误文案。

错误码第一版为：`INVALID_ARGUMENT`、`UNAUTHORIZED_TOOL`、`RESOURCE_FORBIDDEN`、
`RESOURCE_NOT_FOUND`、`ACCOUNT_INACTIVE`、`INSUFFICIENT_FUNDS`、`LIMIT_EXCEEDED`、
`RISK_REJECTED`、`ACTION_ALREADY_PENDING`、`BANK_UNAVAILABLE`、`TIMEOUT`、
`INTERNAL_ERROR`。

## 6. 领域对象

- 金额使用十进制字符串和 ISO 4217 币种，不使用浮点数。
- 余额结果同时提供 `balance` 和 `available_balance`；Payment 只能使用后者判断可转金额。
- 时间使用带时区的 ISO 8601 字符串。
- Risk 返回 `RiskAssessment`，Graph 不自行伪造 `decision` 或认证要求。
- 修改类 Tool 只创建 `PendingAction`；最终执行仍由 Action Service 控制。
- Pending Action 状态以 `contracts.py` 的 `ActionStatus` 为准。

## 7. Capability 清单

| Tool | Capability | Domain | Access |
|---|---|---|---|
| `get_accounts` | `account.list.read` | account | read |
| `get_balance` | `account.balance.read` | account | read |
| `get_transactions` | `account.transactions.read` | account | read |
| `get_cards` | `account.cards.read` | account | read |
| `find_payee` | `payment.payee.read` | payment | read |
| `get_transfer` | `payment.transfer.read` | payment | read |
| `get_direct_debits` | `payment.direct_debits.read` | payment | read |
| `request_transfer` | `payment.transfer.prepare` | payment | write |
| `request_cancel_direct_debit` | `payment.direct_debit.cancel.prepare` | payment | write |
| `evaluate_transfer_risk` | `risk.transfer.evaluate` | risk | read |
| `detect_unusual_transactions` | `risk.transactions.evaluate` | risk | read |
| `request_freeze_card` | `risk.card.freeze.prepare` | risk | write |
| `request_report_card_lost` | `risk.card.report_lost.prepare` | risk | write |
| `request_set_card_limit` | `risk.card_limit.prepare` | risk | write |
| `analyze_spending` | `analysis.spending.run` | analysis | read |
| `get_investment_products` | `investment.products.read` | analysis | read |
| `get_investment_positions` | `investment.positions.read` | analysis | read |
| `request_purchase_investment` | `investment.purchase.prepare` | analysis | write |
| `request_redeem_investment` | `investment.redeem.prepare` | analysis | write |

`evaluate_transfer_risk` 是 v1 已确定、由 B 新增的独立只读 Tool。输入为
`source_account_id`、`target_account_id`、`amount`、`currency`，输出为 `RiskAssessment`。
Payment Graph 通过它决定交互路径；Action Service 在创建和执行 Action 时仍必须执行自己的
不可绕过风控，不能信任 Graph 传回的风险结论。

## 8. 日志

Tool 开始和结束事件必须共享 `tool_call_id`，并包含 `request_id`、`session_id`、`graph`、
`node_id`、`specialist`、`domain`、`capability`、`access`、`attempt`。结束事件额外包含
`duration_ms` 和 `result`。日志必须脱敏；原始审计日志不直接提供给前端。

## 9. 兼容和变更

- v1 内可以增加可选字段，不得删除字段或改变字段含义。
- Capability 字符串一旦发布不得改名；需要替代时新增 Capability 并弃用旧值。
- 破坏性变更升级 `protocol_version`。
- A 可以使用 Fake Registry 开发；Fake 返回也必须符合本协议。
- B 可以自由修改银行 HTTP 路径和内部数据模型，但不得影响本协议。

## 10. B 的验收条件

1. 新 `context=` 调用可用，旧接口在迁移期兼容。
2. Registry 在执行时拒绝未授权 specialist。
3. 所有 Tool Manifest 字段齐全且 Capability 与上表一致。
4. Tool Result 迁移为结构化错误。
5. `get_balance` 提供 `available_balance`、币种、状态和 `as_of`。
6. 实现 `evaluate_transfer_risk`，返回符合 `RiskAssessment` 的结构化结果。
7. Pending Action 符合合同类型，写操作继续由 Action Service 执行。
8. Tool 日志可使用 `tool_call_id` 与请求上下文完整关联。
9. 增加合同测试，并保持现有安全与幂等测试通过。
