# Mock Bank

一个可持久化的 mock bank API。

## 启动

项目统一使用 Python 3.12。先在仓库根目录运行 `uv sync --frozen`。

```bash
uv run python mock_bank/app.py
```

服务地址：`http://127.0.0.1:8000`

账户面板：`http://127.0.0.1:8000/admin`

测试是否启动成功：

```bash
curl http://127.0.0.1:8000/accounts/A1001
```

首次启动会创建 `bank.db` 和四个测试用户。重启服务会继续使用原数据库。

## 用户登录门户

先给测试用户设置密码：

```bash
uv run python -m mock_bank.manage list-users
uv run python -m mock_bank.manage set-password U4
```

查看该用户的 2FA 密钥、当前 6 位动态码和 Authenticator 导入地址：

```bash
uv run python -m mock_bank.manage show-totp U4
```

启动 FastAPI 用户门户：

```bash
uv run python -m mock_bank.portal
```

打开 `http://127.0.0.1:8080`，使用手机号、密码和动态码登录。登录后只能查看该用户自己的账户和流水。测试手机号为：

```text
Alice      13800000001  A1001
Bob        13800000000  A1002
Tujing He  13800000003  A1003
Ke Wei     13800000004  A1004
```

默认启用 2FA。仅在本地调试时可以关闭：

```bash
MOCK_BANK_2FA_ENABLED=false uv run python -m mock_bank.portal
```

`show-totp` 是测试环境的管理员命令，不应暴露给普通用户或放进公开网页。手机端可将它输出的 `Authenticator URI` 导入 Google Authenticator、Microsoft Authenticator、1Password 等兼容 TOTP 的应用。

## 账户面板

启动后打开 `http://127.0.0.1:8000/admin`，可以查看所有测试用户，以及每个用户的账户、余额和状态。刷新页面即可看到转账后的最新余额。

面板只读，不提供直接修改余额或绕过 Agent 安全流程的入口。

## 共享测试服务器

可以部署到 Linux 服务器，供少量可信测试者共享同一个 Mock Bank。公网环境必须设置 API Token：

```bash
export BANK_API_TOKEN="请替换为足够长的随机值"
uv run python mock_bank/app.py --host 0.0.0.0
```

其他测试者在自己的 `.env` 中配置：

```env
BANK_BASE_URL=https://你的测试域名
BANK_API_TOKEN=相同的随机值
BANK_USER_ID=U3
```

服务器前面必须使用 Nginx 或 Caddy 提供 HTTPS，并通过防火墙限制访问。未设置 Token 时，Mock Bank 会拒绝绑定非本机地址。

当前 `BANK_USER_ID` 仍由测试者选择，共享 Token 也不是正式用户登录。因此只能用于可信人员测试，不能存放真实银行数据或向公众开放。

对外测试时，建议只公开 FastAPI 门户的 `8080` 端口，并把内部银行 API 的 `8000` 端口限制为服务器本机访问。反向代理负责 HTTPS，然后设置：

```bash
export MOCK_BANK_2FA_ENABLED=true
export MOCK_BANK_SECURE_COOKIE=true
uv run python -m mock_bank.portal --host 0.0.0.0
```

FastAPI 提供登录和会话能力，但生产级部署仍需补充限流、密码重置、审计、CSRF 防护和密钥托管。此门户只用于不含真实数据的比赛测试环境。

Linux 服务器上的 systemd 与 Caddy 示例见 [`deploy/README.md`](deploy/README.md)。实际发布还需要服务器地址、域名和 SSH 登录方式。

## API

```text
GET  /accounts/A1001
GET  /users
GET  /accounts
GET  /users/U1/accounts
GET  /users/U1/payees
GET  /users/U1/cards
GET  /users/U1/debits
GET  /accounts/A1001/transactions?start_date=2026-09-01&limit=100
GET  /accounts/A1001/holdings
GET  /debits/D1001
GET  /debits
GET  /cards
GET  /payees
GET  /transfers/{transfer_id}
GET  /investments/products

POST /transfers/prepare
     {"from":"A1001","to":"A1002","amount":"100.00","note":"测试"}

POST /transfers/{transfer_id}/execute
     {}

POST /cards/C1001/freeze
POST /cards/C1001/unfreeze
POST /cards/C1001/report-lost
     {}

PUT  /cards/C1001/limit
     {"amount":"3000.00"}

POST /accounts/A1001/freeze
     {}

POST /accounts/A1001/investments
     {"product":"稳健理财","amount":"200.00"}

POST /accounts/A1001/investments/redeem
     {"product":"稳健理财","amount":"50.00"}

POST /debits/D1001/cancel
     {}
```

金额通过字符串传入并精确到分。`prepare` 只创建待执行转账，不修改余额；`execute` 才在同一个 SQLite 事务中修改余额、生成流水并更新转账状态。重复执行同一笔转账不会重复扣款。

默认测试用户：Alice（`U1`/`A1001`）、Bob（`U2`/`A1002`）、Tujing He（`U3`/`A1003`）和 Ke Wei（`U4`/`A1004`）。Agent 使用按用户查询接口，避免跨用户读取资源。

创建一组用于语音识别的中文姓名账户，并加入 `U4` 的收款人列表：

```bash
uv run python -m mock_bank.manage seed-voice-tests \
  --owner U4 --owner-balance 500000 --balance 100000
```

命令使用固定 ID，重复执行会更新而不会重复创建。`U4` 的测试余额设为 ¥500,000，每个收款
账户设为 ¥100,000。测试姓名包括张伟/张薇、王芳/王方、李娜/李楠和陈晨/陈辰；同时会把
Alice 和 Bob 加入 `U4` 的收款人列表，并配置“爱丽丝/艾丽丝”和“鲍勃/波波”等语音别名。

运行测试：

```bash
python3 -m unittest -v
```
