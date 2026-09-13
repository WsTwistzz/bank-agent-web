# Linux 测试服务器部署

服务器需安装 Git、uv 和 Caddy。克隆私人仓库后，在仓库根目录执行：

```bash
uv sync --frozen
uv run python -m mock_bank.manage set-password U1
uv run python -m mock_bank.manage set-password U2
uv run python -m mock_bank.manage set-password U3
uv run python -m mock_bank.manage set-password U4
```

复制 `mock-bank-portal.service.example` 到 `/etc/systemd/system/mock-bank-portal.service`，替换其中的用户和仓库绝对路径。然后启动：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now mock-bank-portal
```

将 `Caddyfile.example` 中的域名替换为真实域名并加入 Caddy 配置。Caddy 负责 HTTPS，FastAPI 只监听 `127.0.0.1:8080`，不要直接开放 8080 或内部 API 的 8000 端口。

查看运行日志：

```bash
sudo journalctl -u mock-bank-portal -f
```
