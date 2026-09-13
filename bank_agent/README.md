# Bank Agent

LangGraph 只负责编排。银行调用必须经过 `ToolRegistry`，修改类操作必须经过 `ActionService`。

第一版支持：

- 查询类工具调用
- 黄色操作明确确认
- 红色操作发送并校验 OTP
- 按 `session_id` 保存 LangGraph 对话状态
- 每个专家执行受计划节点、并发、重试和超时预算限制
- Supervisor 在标准模式路由一个专业 Agent，在专家模式可并行路由多个专业 Agent
- 各专家拥有独立模型实例、上下文、工具白名单和执行步数预算
- Result Aggregator 汇总跨领域专家结果并提示冲突
- Planner 为每次新请求生成结构化任务 DAG，并在执行前验证工具权限、参数、依赖和输出引用
- 方向键上下翻看历史输入，方向键左右移动光标
- 脱敏 JSONL 轨迹日志

模型适配器实现 `respond(messages, tools)`，返回：

```python
{"content": "", "tool_calls": [{"id": "1", "name": "get_balance", "arguments": {"account_id": "A1001"}}]}
```

`user_id` 和 `session_id` 必须由登录后的服务端注入，不能取自模型输出。

当前测试使用 `MemorySaver`。实际服务建议使用 `langgraph-checkpoint-sqlite` 的 `SqliteSaver`；多实例部署时改用 PostgreSQL checkpointer。

## Multi-Agent 模式

`AGENT_MODE=standard` 保持单专家、低延迟执行；`AGENT_MODE=expert` 允许 Supervisor
把跨领域请求拆给最多三个专家，由 LangGraph 动态并行分发并在全部完成后汇总。单领域请求在
expert 模式下仍只运行一个专家，不额外增加模型调用。

并行专家只能使用只读工具。包含转账、申购、赎回、冻结卡等修改意图的请求必须由
Supervisor 单独委派给对应专家；即使路由模型错误地返回多个任务，编排层也会从所有并行
分支中移除修改类工具。确认、OTP 和实际执行仍完全由 Action & Security 层控制。

所有角色默认使用 `LLM_MODEL`。以下环境变量可以为角色选择不同的兼容模型：

- `LLM_SUPERVISOR_MODEL`
- `LLM_PLANNER_MODEL`
- `LLM_ACCOUNT_MODEL`
- `LLM_OPERATIONS_MODEL`
- `LLM_INVESTMENT_MODEL`
- `LLM_GENERAL_MODEL`
- `LLM_AGGREGATOR_MODEL`

也可用对应的 `LLM_<ROLE>_BASE_URL` 为某个角色覆盖模型服务地址。每个角色都会创建独立
模型适配器实例。

## 受控自治循环

纯查询和分析任务按“计划 → 执行 → 专家评估 → 必要时重规划 → 总结”循环。评估器只能提交
结构化充分性判断；修订计划会收到上一轮执行结果和评估反馈，计划版本逐轮递增。任何包含写
工具、进入 `WAITING`、执行失败或无需工具的计划都不会自治重规划。

全局硬限制由以下配置控制：

- `AGENT_MAX_ROUNDS`：每个专家最多执行的规划轮数，默认 3
- `AGENT_MAX_PARALLELISM`：一次请求最多并行专家数，默认 3
- `AGENT_TIMEOUT_SECONDS`：整个请求的自治时间预算，默认 90 秒
- `AGENT_MAX_MODEL_CALLS`：Supervisor、Planner、评估、总结和聚合共享的模型调用预算，默认 12

轨迹记录每轮计划、执行、评估、重规划请求以及最终预算消耗。预算耗尽时安全停止，不扩大
工具权限，也不会把写操作转入自治循环。

## 任务规划

`Planner` 通过 `submit_task_plan` 结构化调用返回最多 10 个节点的 DAG。每个节点包含
`id`、`tool`、`arguments` 和 `depends_on`。后续节点可以使用
`{"$ref": "node_id.output.0.id"}` 引用依赖节点的输出。

计划进入 Agent 工具调用循环前会执行确定性验证：

- 节点 ID 唯一，依赖存在且图中无环
- 工具必须存在并属于 Supervisor 选中的专业 Agent
- 参数字段、必填项和字面量类型符合工具定义
- `$ref` 只能引用当前节点的直接或间接依赖
- 模型不能在计划中提供 `user_id` 或 `session_id`
- 每个计划最多包含一个修改类工具节点

验证后的 DAG 由确定性调度器直接执行，专业 Agent 不能在计划之外自由调用工具：

- 调度器按拓扑依赖分层执行，只有依赖全部成功的节点才会启动
- 同层只读节点最多按 `DAG_MAX_PARALLEL_READS` 并行执行
- 写节点始终串行执行且绝不自动重试
- 每个计划最多包含 `DAG_MAX_NODES` 个节点
- 只读失败最多按 `DAG_READ_RETRIES` 重试
- 每批只读节点受 `DAG_NODE_TIMEOUT_SECONDS` 超时限制
- 上游失败或超时后，下游节点标记为 `SKIPPED`
- 写工具创建待确认 Action 后，节点和计划保持 `WAITING`，不会执行其后续节点
- `$ref` 在工具调用前解析，支持对象字段、点号数组索引和方括号数组索引

节点会记录 `status`、`attempts`、`resolved_arguments`、`output` 或 `error`。全部节点完成后，
专业模型只接收执行结果并在无工具权限的上下文中总结。若模型仍返回 Tool Call，运行时会拒绝
并记录 `unplanned_tool_calls_rejected` 审计事件。

## 使用 DeepSeek V4 Pro 测试

先启动 Mock Bank：

```bash
uv run python mock_bank/app.py
```

首次运行时，在仓库根目录创建本地配置并填入密钥：

```bash
cp .env.example .env
```

另开一个终端启动 Agent：

```bash
uv run python -m bank_agent.cli
```

默认模型是 `deepseek-v4-pro`，使用 DeepSeek 官方兼容 OpenAI Chat Completions 的接口。开发模式的 OTP 会打印在 Agent 终端。

## 排查日志

CLI 将审计记录按用途追加到 `bank_agent/logs/` 下的三份 JSONL 文件：

- `agent_operations.jsonl`：用户输入、模型可见上下文与输出、显式计划、路由摘要、Tool Call 和最终回复
- `user_authorizations.jsonl`：用户确认、拒绝、强认证发起、成功与失败结果
- `risk_and_api.jsonl`：风控输入/等级/处置结果、Action 执行结果、Bank Gateway HTTP 方法、路径、状态码与耗时

每行是一条带 UTC 时间、用户和会话标识的 JSON 事件。Bank Gateway 自身无法确定调用者时，接口事件的用户和会话标识为 `null`，可与同一时段的 Tool/Action 事件关联。内容包括：

- 用户输入和实际发送给模型的上下文
- Supervisor 路由结果和简短决策说明
- 模型可见输出和 Tool Call
- 工具参数、工具真实结果及最终回复
- 待确认 Action 输入和运行错误

OTP、password、token、credential 等敏感字段会自动遮盖。日志不会记录模型不可见的内部思维链；“思考”仅指模型显式输出的计划、路由理由和决策摘要。`actions.db` 仍是 Action 状态和授权审计的持久化事实源，JSONL 用于检索与排障。

## WebRTC 语音原型

语音入口保留现有 Supervisor、Planner、BankingTools、Action、OTP 和审计逻辑。浏览器通过
WebRTC 发送麦克风音轨；服务端转为 16 kHz PCM，经静音分段后调用兼容 OpenAI
`/audio/transcriptions` 的 ASR 服务。最终文本才会提交给 Bank Agent，增量识别文本不会触发
银行操作。回复文本目前使用浏览器 SpeechSynthesis 播放，便于先验证交互效果。

安装语音依赖：

```bash
uv sync --extra voice
```

配置 `.env` 中的 `VOICE_ASR_BASE_URL`、`VOICE_ASR_MODEL` 和可选密钥。Qwen3-ASR 的
OpenAI-compatible transcription 服务示例：

```bash
qwen-asr-serve Qwen/Qwen3-ASR-1.7B \
  --host 127.0.0.1 --port 8094 --gpu-memory-utilization 0.8
```

依次启动 Mock Bank 和语音服务：

```bash
uv run python mock_bank/app.py
uv run --extra voice python -m bank_agent.voice_server
```

打开 `http://127.0.0.1:8090`，点击“开始语音”并允许麦克风权限。默认按 700ms 静音判定
一轮结束；可通过 `VOICE_SILENCE_MS`、`VOICE_MIN_SPEECH_MS` 和
`VOICE_RMS_THRESHOLD` 调整。该原型仅默认绑定 localhost，尚未包含公网 TURN、登录态绑定
和服务端流式 TTS，不应直接作为生产银行入口部署。
