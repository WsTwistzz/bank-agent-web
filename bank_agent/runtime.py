"""Shared construction of the Bank Agent runtime for CLI and voice entry points."""

import os
import sqlite3
from pathlib import Path

from langgraph.checkpoint.sqlite import SqliteSaver

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


class BankAgentRuntime:
    def __init__(self, agent, connection, logs, config, banking_tools):
        self.agent = agent
        self.connection = connection
        self.logs = logs
        self.config = config
        self.banking_tools = banking_tools

    def close(self):
        self.connection.close()


def create_runtime(otp_sender=None):
    agent_config = AgentConfig.from_env()
    model_configs = model_configs_from_env()
    logs = AuditLogs(ROOT / "logs")
    gateway = BankGateway(
        os.environ.get("BANK_BASE_URL", "http://127.0.0.1:8000"),
        api_token=os.environ.get("BANK_API_TOKEN"), audit_log=logs.risk_api,
    )
    sender = otp_sender or (
        lambda user, code: print(f"[仅开发环境] {user} 的验证码：{code}")
    )
    otp = OTPVerifier(sender, ROOT / "otp.db")
    actions = create_bank_action_service(
        gateway, ROOT / "actions.db", otp,
        authorization_log=logs.authorization, risk_log=logs.risk_api,
    )
    banking_tools = BankingTools(gateway, actions)
    registry = create_banking_tool_registry(banking_tools)
    models = {
        role: OpenAICompatibleModel(
            config.api_key, config.model, config.base_url,
            system_prompt=SYSTEM_PROMPT,
        )
        for role, config in model_configs.items()
    }
    connection = sqlite3.connect(ROOT / "checkpoints.db", check_same_thread=False)
    agent = BankAgent(
        models["general"], registry, banking_tools, SqliteSaver(connection),
        max_steps=agent_config.max_steps, trace=logs.agent,
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
    return BankAgentRuntime(agent, connection, logs, agent_config, banking_tools)
