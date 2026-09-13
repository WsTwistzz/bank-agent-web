import os
import sqlite3
import uuid
from pathlib import Path

from langgraph.checkpoint.sqlite import SqliteSaver
from dotenv import load_dotenv
from prompt_toolkit import PromptSession
from prompt_toolkit.history import FileHistory

from actions import OTPVerifier
from bank_agent.agent import BankAgent
from bank_agent.config import AgentConfig, model_configs_from_env
from bank_agent.dag_executor import ExecutionPolicy
from bank_agent.model import OpenAICompatibleModel
from bank_agent.prompts import SYSTEM_PROMPT
from bank_agent.trace import AuditLogs
from bank_gateway import BankGateway
from tools import BankingTools, create_bank_action_service, create_banking_tool_registry


ROOT = Path(__file__).resolve().parent


def main():
    load_dotenv(ROOT.parent / ".env")
    try:
        agent_config = AgentConfig.from_env()
        model_configs = model_configs_from_env()
    except ValueError as error:
        raise SystemExit(f"配置错误：{error}") from error

    user_id = os.environ.get("BANK_USER_ID", "U4")
    session_id = os.environ.get("BANK_SESSION_ID", "SES" + uuid.uuid4().hex[:12].upper())
    logs = AuditLogs(ROOT / "logs")
    gateway = BankGateway(
        os.environ.get("BANK_BASE_URL", "http://127.0.0.1:8000"),
        api_token=os.environ.get("BANK_API_TOKEN"),
        audit_log=logs.risk_api,
    )
    otp = OTPVerifier(
        lambda user, code: print(f"[仅开发环境] {user} 的验证码：{code}"),
        ROOT / "otp.db",
    )
    actions = create_bank_action_service(
        gateway, ROOT / "actions.db", otp,
        authorization_log=logs.authorization, risk_log=logs.risk_api,
    )
    banking_tools = BankingTools(gateway, actions)
    registry = create_banking_tool_registry(banking_tools)
    models = {
        role: OpenAICompatibleModel(
            config.api_key,
            config.model,
            config.base_url,
            system_prompt=SYSTEM_PROMPT,
        )
        for role, config in model_configs.items()
    }
    connection = sqlite3.connect(ROOT / "checkpoints.db", check_same_thread=False)
    trace = logs.agent
    agent = BankAgent(
        models["general"], registry, banking_tools, SqliteSaver(connection),
        max_steps=agent_config.max_steps, trace=trace,
        mode=agent_config.mode, models=models,
        max_plan_nodes=agent_config.max_plan_nodes,
        max_rounds=agent_config.max_rounds,
        max_model_calls=agent_config.max_model_calls,
        timeout_seconds=agent_config.timeout_seconds,
        max_parallelism=agent_config.max_parallelism,
        execution_policy=ExecutionPolicy(
            max_parallel_reads=agent_config.max_parallel_reads,
            read_retries=agent_config.read_retries,
            node_timeout_seconds=agent_config.node_timeout_seconds,
        ),
    )
    prompt = PromptSession(history=FileHistory(str(ROOT / "cli_history")))

    print(
        f"Bank Agent 已启动（用户 {user_id}，会话 {session_id}，"
        f"模式 {agent_config.mode}），输入 exit 退出。\n"
        f"审计日志目录：{ROOT / 'logs'}"
    )
    try:
        while True:
            try:
                message = prompt.prompt("你：").strip()
            except (EOFError, KeyboardInterrupt):
                break
            if message.lower() in {"exit", "quit"}:
                break
            if message:
                try:
                    response = agent.chat(user_id, session_id, message)["response"]
                    print("Agent：" + response)
                except RuntimeError as error:
                    trace.write(
                        "agent_error", user_id, session_id,
                        error_type=type(error).__name__, error=str(error),
                    )
                    print(f"Agent：{error}。你可以继续输入或稍后重试。")
    finally:
        connection.close()


if __name__ == "__main__":
    main()
