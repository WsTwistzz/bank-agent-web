import os
import uuid
from pathlib import Path

from dotenv import load_dotenv
from prompt_toolkit import PromptSession
from prompt_toolkit.history import FileHistory

from bank_agent.runtime import create_runtime


ROOT = Path(__file__).resolve().parent


def main():
    load_dotenv(ROOT.parent / ".env")
    try:
        runtime = create_runtime()
    except ValueError as error:
        raise SystemExit(f"配置错误：{error}") from error

    user_id = os.environ.get("BANK_USER_ID", "U4")
    session_id = os.environ.get("BANK_SESSION_ID", "SES" + uuid.uuid4().hex[:12].upper())
    agent_config = runtime.config
    trace = runtime.logs.agent
    agent = runtime.agent
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
        runtime.close()


if __name__ == "__main__":
    main()
