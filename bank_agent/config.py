import os
from dataclasses import dataclass


MODEL_ROLES = (
    "supervisor",
    "planner",
    "account",
    "operations",
    "investment",
    "general",
    "aggregator",
)


@dataclass(frozen=True)
class ModelConfig:
    api_key: str
    base_url: str
    model: str


@dataclass(frozen=True)
class AgentConfig:
    mode: str = "standard"
    max_steps: int = 5
    max_plan_nodes: int = 10
    max_parallel_reads: int = 3
    read_retries: int = 1
    node_timeout_seconds: float = 30.0
    max_rounds: int = 3
    max_model_calls: int = 12
    timeout_seconds: float = 90.0
    max_parallelism: int = 3

    @classmethod
    def from_env(cls):
        mode = os.environ.get("AGENT_MODE", "standard").strip().lower()
        if mode not in {"standard", "expert"}:
            raise ValueError("AGENT_MODE must be standard or expert")
        try:
            max_steps = int(os.environ.get("AGENT_MAX_STEPS", "5"))
            max_plan_nodes = int(os.environ.get("DAG_MAX_NODES", "10"))
            max_parallel_reads = int(os.environ.get("DAG_MAX_PARALLEL_READS", "3"))
            read_retries = int(os.environ.get("DAG_READ_RETRIES", "1"))
            node_timeout_seconds = float(os.environ.get("DAG_NODE_TIMEOUT_SECONDS", "30"))
            max_rounds = int(os.environ.get("AGENT_MAX_ROUNDS", "3"))
            max_model_calls = int(os.environ.get("AGENT_MAX_MODEL_CALLS", "12"))
            timeout_seconds = float(os.environ.get("AGENT_TIMEOUT_SECONDS", "90"))
            max_parallelism = int(os.environ.get("AGENT_MAX_PARALLELISM", "3"))
        except ValueError as error:
            raise ValueError("agent execution limits must be numeric") from error
        if (max_steps < 1 or max_plan_nodes < 1 or max_parallel_reads < 1
                or read_retries < 0 or node_timeout_seconds <= 0 or max_rounds < 1
                or max_model_calls < 1 or timeout_seconds <= 0 or max_parallelism < 1):
            raise ValueError("agent execution limits are out of range")
        return cls(
            mode=mode,
            max_steps=max_steps,
            max_plan_nodes=max_plan_nodes,
            max_parallel_reads=max_parallel_reads,
            read_retries=read_retries,
            node_timeout_seconds=node_timeout_seconds,
            max_rounds=max_rounds,
            max_model_calls=max_model_calls,
            timeout_seconds=timeout_seconds,
            max_parallelism=max_parallelism,
        )


def model_configs_from_env():
    api_key = os.environ.get("LLM_API_KEY", "")
    if not api_key:
        raise ValueError("LLM_API_KEY is required")
    base_url = os.environ.get("LLM_BASE_URL", "https://api.deepseek.com")
    default_model = os.environ.get("LLM_DEFAULT_MODEL") or os.environ.get(
        "LLM_MODEL", "deepseek-v4-pro"
    )
    return {
        role: ModelConfig(
            api_key=api_key,
            base_url=os.environ.get(f"LLM_{role.upper()}_BASE_URL", base_url),
            model=os.environ.get(f"LLM_{role.upper()}_MODEL", default_model),
        )
        for role in MODEL_ROLES
    }
