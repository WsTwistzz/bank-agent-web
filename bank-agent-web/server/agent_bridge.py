"""Agent 桥接服务（放在前端仓库内，不改动队友的 bank-agent 仓库）。

为什么需要它
------------
bank-agent 后端只提供两种入口：CLI（bank_agent/cli.py）与 WebRTC 语音
（voice_server）。没有任何 HTTP 文本对话接口，也没有配置 CORS，前端无法直接
调用。本服务用 FastAPI 把 ``bank_agent.runtime.create_runtime()`` 包一层：

    GET  /health   就绪探测（附带"为什么不可用"的原因），前端据此决定是否降级
    POST /chat     SSE 流式对话；把 logs/frontend_events.jsonl 的投影事件按序转发，
                   并把 OTPVerifier 下发的验证码作为 otp 事件推给前端

验证码说明
----------
强验证（RED）动作会调用 OTPVerifier，验证码通过 ``otp_sender`` 回调下发。
生产环境应接短信网关；演示环境这里把验证码保留在内存里，由前端展示给演示者，
以便完整走通"密码 + 验证码"的人机协同流程。

运行（复用后端已有的虚拟环境，避免重复装依赖）：
    d:\\Fintech\\bank-agent\\.venv\\Scripts\\python.exe server\\agent_bridge.py

环境变量：
    BRIDGE_PORT        桥接服务端口，默认 8099
    BANK_AGENT_ROOT    后端仓库根目录，默认取同级目录 d:\\Fintech\\bank-agent
"""

import json
import os
import sys
import threading
import time
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from urllib import error as urlerror
from urllib import request as urlrequest

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

HERE = Path(__file__).resolve().parent
PROJECT_ROOT = HERE.parent
BANK_AGENT_ROOT = Path(os.environ.get("BANK_AGENT_ROOT", PROJECT_ROOT.parent / "bank-agent"))

# 后端 .env 优先；前端仓库的 server/.env.local 可覆盖，便于前端自行填密钥而不动后端仓库。
load_dotenv(BANK_AGENT_ROOT / ".env")
load_dotenv(HERE / ".env.local", override=True)

sys.path.insert(0, str(BANK_AGENT_ROOT))

EVENTS_LOG = BANK_AGENT_ROOT / "bank_agent" / "logs" / "frontend_events.jsonl"
CHAT_TIMEOUT_SECONDS = float(os.environ.get("BRIDGE_CHAT_TIMEOUT_SECONDS", "180"))

app = FastAPI(title="Bank Agent Bridge", docs_url=None, redoc_url=None)
# 仅供本机开发：Vite 走代理其实用不到 CORS，但放开后便于直接 curl / 浏览器调试。
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_runtime = None
_runtime_lock = threading.Lock()

# 演示用验证码收件箱：{seq, user_id, code, at}，只保留最近若干条。
_otp_inbox = deque(maxlen=50)
_otp_seq = 0


def _now():
    return datetime.now(timezone.utc).isoformat()


def _otp_sender(user_id, code):
    """OTPVerifier 下发验证码时的回调。"""
    global _otp_seq
    _otp_seq += 1
    _otp_inbox.append({"seq": _otp_seq, "user_id": user_id, "code": code, "at": _now()})
    print(f"[bridge] 演示验证码 user={user_id} code={code}", flush=True)


class ChatRequest(BaseModel):
    user_id: str
    session_id: str
    message: str


class JsonlTail:
    """按行增量读取 JSONL，容忍文件尚不存在与日志轮转。"""

    def __init__(self, path):
        self.path = Path(path)
        self.offset = self.path.stat().st_size if self.path.exists() else 0
        self._buffer = b""

    def read(self):
        if not self.path.exists():
            return []
        with self.path.open("rb") as handle:
            if self.path.stat().st_size < self.offset:
                self.offset = 0
                self._buffer = b""
            handle.seek(self.offset)
            chunk = handle.read()
            self.offset = handle.tell()
        lines = (self._buffer + chunk).split(b"\n")
        self._buffer = lines.pop() if lines else b""
        records = []
        for line in lines:
            line = line.strip()
            if not line:
                continue
            try:
                records.append(json.loads(line.decode("utf-8")))
            except json.JSONDecodeError:
                continue
        return records


def agent_readiness():
    """后端 Agent 是否具备启动条件（不做重量级构造）。"""
    if not os.environ.get("LLM_API_KEY"):
        return False, "缺少 LLM_API_KEY：bank-agent/.env 未配置，Agent 无法调用大模型"
    return True, ""


def bank_readiness():
    """Mock Bank REST 是否在线。"""
    base_url = os.environ.get("BANK_BASE_URL", "http://127.0.0.1:8000")
    try:
        with urlrequest.urlopen(f"{base_url}/users/U1/accounts", timeout=1.5) as response:
            return response.status == 200, base_url
    except (urlerror.URLError, OSError):
        return False, base_url


def get_runtime():
    """惰性构造后端运行时；失败时抛出可直接展示的中文原因。"""
    global _runtime
    with _runtime_lock:
        if _runtime is not None:
            return _runtime
        ready, reason = agent_readiness()
        if not ready:
            raise RuntimeError(reason)
        from bank_agent.runtime import create_runtime

        try:
            _runtime = create_runtime(otp_sender=_otp_sender)
        except Exception as error:  # noqa: BLE001 - 需要把任何启动异常转成可读原因
            raise RuntimeError(f"Agent 运行时启动失败：{type(error).__name__}: {error}") from error
        return _runtime


def _sse(event, payload):
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


@app.get("/health")
def health():
    agent_ok, agent_reason = agent_readiness()
    bank_ok, bank_base = bank_readiness()
    return {
        "ready": agent_ok and bank_ok,
        "agent": {
            "ready": agent_ok,
            "running": _runtime is not None,
            "reason": agent_reason,
        },
        "bank": {"ready": bank_ok, "base_url": bank_base},
        "events_log": str(EVENTS_LOG),
    }


@app.post("/chat")
def chat(payload: ChatRequest):
    if not payload.message.strip():
        raise HTTPException(status_code=400, detail="message is required")
    try:
        runtime = get_runtime()
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error

    user_id, session_id, message = payload.user_id, payload.session_id, payload.message
    seen_otp = _otp_seq

    def stream():
        outcome = {}
        started_at = time.time()

        def worker():
            try:
                outcome["response"] = runtime.agent.chat(user_id, session_id, message)["response"]
            except Exception as error:  # noqa: BLE001
                outcome["error"] = f"{type(error).__name__}: {error}"
            finally:
                outcome["finished"] = True

        thread = threading.Thread(target=worker, daemon=True)
        thread.start()
        yield _sse("start", {"user_id": user_id, "session_id": session_id, "at": _now()})

        tail = JsonlTail(EVENTS_LOG)
        last_ping = time.time()
        while not outcome.get("finished"):
            for record in tail.read():
                if record.get("user_id") == user_id and record.get("session_id") == session_id:
                    yield _sse("event", record)
            nonlocal seen_otp
            for item in list(_otp_inbox):
                if item["seq"] > seen_otp and item["user_id"] == user_id:
                    seen_otp = item["seq"]
                    yield _sse("otp", {"code": item["code"], "issued_at": item["at"]})
            if time.time() - started_at > CHAT_TIMEOUT_SECONDS:
                outcome["error"] = f"Agent 响应超时（{CHAT_TIMEOUT_SECONDS:.0f}s）"
                outcome["finished"] = True
                break
            if time.time() - last_ping > 10:
                last_ping = time.time()
                yield ": ping\n\n"
            time.sleep(0.12)

        # 收尾：把最后一批事件补完
        for record in tail.read():
            if record.get("user_id") == user_id and record.get("session_id") == session_id:
                yield _sse("event", record)
        yield _sse(
            "done",
            {
                "response": outcome.get("response", ""),
                "error": outcome.get("error"),
                "duration_ms": int((time.time() - started_at) * 1000),
            },
        )

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


def _log(line):
    # 后台运行时 stdout 不是终端，需要手动 flush，否则日志会一直看不到
    print(line, flush=True)


def main():
    import uvicorn

    port = int(os.environ.get("BRIDGE_PORT", "8099"))
    agent_ok, agent_reason = agent_readiness()
    bank_ok, bank_base = bank_readiness()
    _log(f"[bridge] 后端仓库：{BANK_AGENT_ROOT}")
    _log(f"[bridge] 事件日志：{EVENTS_LOG}")
    _log(f"[bridge] Agent：{'就绪' if agent_ok else '未就绪 - ' + agent_reason}")
    _log(f"[bridge] Mock Bank {bank_base}：{'在线' if bank_ok else '未连接'}")
    _log(f"[bridge] 监听 http://127.0.0.1:{port}")
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")


if __name__ == "__main__":
    main()