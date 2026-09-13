# Action & Security

可复用的红、黄、绿权限分级和 Action 状态机，只使用 Python 标准库和 SQLite。

## 权限等级

- `GREEN`：自动执行
- `YELLOW`：等待用户确认
- `RED`：等待强验证

调用方不能传入风险等级。等级必须由注册的固定规则或规则函数计算。没有规则的操作默认拒绝。

```python
from actions import ActionService, OTPVerifier, PermissionPolicy, RiskLevel

policy = PermissionPolicy()
policy.register("GET_BALANCE", RiskLevel.GREEN)
policy.register("CANCEL_SUBSCRIPTION", RiskLevel.YELLOW)
policy.register("PURCHASE_INVESTMENT", RiskLevel.RED)

otp = OTPVerifier(send_sms_code, db_path="otp.db")
service = ActionService(policy, verifier=otp)
service.register("GET_BALANCE", lambda payload: {"balance": "1000.00"})

result = service.submit("GET_BALANCE", {"account_id": "A1001"}, user_id="U1")
```

动态规则可以使用可信上下文：

```python
def transfer_risk(payload, context):
    daily_total = context["daily_transfer_total"]
    return RiskLevel.YELLOW if daily_total + int(payload["amount"]) <= 1000 else RiskLevel.RED

policy.register("TRANSFER", transfer_risk)
```

可信上下文由 `context_provider` 提供，不接受 Agent 传入的累计金额或风险等级。

## 状态

```text
WAITING_CONFIRMATION
WAITING_STRONG_AUTH
CONFIRMED
EXECUTING
SUCCEEDED
FAILED
REJECTED
EXPIRED
BLOCKED
```

相同幂等键会返回原 Action，不会重复执行；数据库唯一约束和冲突回读也会处理并发提交，
确保同一幂等请求只有一个执行者。空字符串或过长幂等键会被拒绝。红色操作连续三次验证失败
后进入 `BLOCKED`。Action 和审计日志保存在 SQLite，重启后仍然存在。

## 会话和待确认操作

敏感操作必须绑定用户会话，一个会话同时最多存在一个待确认 Action：

```python
session = service.create_session("U1")
session_id = session["session_id"]

pending = service.get_pending_action("U1", session_id)
result = service.confirm_pending("U1", session_id)
```

会话绑定用户，其他用户不能读取、确认或验证该会话的 Action。红色 Action 先调用 `request_pending_verification()` 发送验证码，再使用 `verify_pending()` 验证；拒绝使用 `reject_pending()`。

验证码绑定 `user_id + action_id`，有效期默认 5 分钟，只能使用一次。数据库只保存带随机盐的哈希，不保存验证码明文；连续三次失败后 Action 进入 `BLOCKED`。

## 红色操作的密码新鲜期

`StepUpVerifier` 支持“近期密码认证 + 当前 TOTP”。默认密码新鲜期为 900 秒：

```text
15 分钟内验证过密码：只要求当前 TOTP
超过 15 分钟：要求密码和当前 TOTP
```

```python
from actions import StepUpVerifier

verifier = StepUpVerifier(
    password_authenticated_at=session_store.password_authenticated_at,
    verify_password=user_store.verify_password,
    verify_totp=user_store.verify_totp,
    record_password_authentication=session_store.record_password_authentication,
    password_max_age_seconds=900,
)
```

调用 `request_verification()` 会返回 `password_required` 和 `totp_required`，供前端决定显示哪些输入框。密码和 TOTP 必须由独立 HTTPS 验证接口接收，不能作为 Agent Tool 参数或写入 Agent 日志。

运行测试：

```bash
cd actions
python3 -m unittest -v
```
