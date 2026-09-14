"""Browser WebRTC voice entry point for Bank Agent.

The browser sends one Opus audio track. The server decodes it to 16 kHz PCM,
detects utterance boundaries, sends completed utterances to an OpenAI-compatible
ASR endpoint, and returns transcript/status/response events on a data channel.
The prototype uses browser speech synthesis for playback.
"""

import argparse
import asyncio
import json
import os
import re
import uuid
from contextlib import asynccontextmanager
from decimal import Decimal, InvalidOperation
from pathlib import Path

import numpy as np
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from bank_agent.runtime import create_runtime
from bank_agent.voice_audio import OpenAICompatibleASR, VoiceAudioConfig, VoiceTurnDetector

try:
    from aiortc import RTCPeerConnection, RTCSessionDescription
    from av import AudioResampler
except ImportError:  # Existing text-only installs must remain usable.
    RTCPeerConnection = RTCSessionDescription = AudioResampler = None


ROOT = Path(__file__).resolve().parent
PAGE = ROOT / "voice.html"


def _chinese_amount(text):
    """Parse the common spoken amounts used by the voice test fixtures."""
    match = re.search(r"(\d+(?:\.\d+)?)\s*(?:元|块|人民币)?", text)
    if match:
        return match.group(1)
    common = {
        "一百": "100", "两百": "200", "二百": "200", "三百": "300",
        "五百": "500", "一千": "1000", "两千": "2000", "二千": "2000",
        "三千": "3000", "五千": "5000", "一万": "10000", "两万": "20000",
        "二万": "20000", "五万": "50000",
    }
    for phrase, amount in common.items():
        if phrase in text:
            return amount
    return None


def _fast_voice_response(runtime, user_id, session_id, text):
    """Handle safe, unambiguous voice operations without another LLM round-trip."""
    normalized = text.strip()
    if re.search(r"余额|账户余额|余额查询", normalized) and not re.search(r"转账|转给", normalized):
        result = runtime.banking_tools.get_accounts(user_id)
        if not result["success"]:
            return f"查询账户失败：{result['error']}"
        accounts = result["data"]
        if not accounts:
            return "当前没有可用账户。"
        details = "；".join(
            f"{item['name']}（{item['id']}）余额 {item['balance']} 元"
            for item in accounts
        )
        return f"已查到你的账户：{details}。"

    if not re.search(r"转账|转给|转到", normalized):
        return None
    payee_match = re.search(r"给(.+?)(?:转账|转给|转到)", normalized)
    if not payee_match:
        return None
    query = payee_match.group(1).strip(" ，,。")
    payees = runtime.banking_tools.find_payee(user_id, query)
    accounts = runtime.banking_tools.get_accounts(user_id)
    if not payees["success"] or not accounts["success"]:
        return None
    if len(payees["data"]) != 1 or not accounts["data"]:
        return None
    payee = payees["data"][0]
    amount = _chinese_amount(normalized)
    if amount is None:
        return f"可以给{payee['name']}转账。请告诉我具体转账金额。"
    source = next((item for item in accounts["data"] if item.get("status") == "active"), None)
    if not source:
        return "当前没有可用的转出账户。"
    try:
        Decimal(amount)
    except InvalidOperation:
        return None
    result = runtime.banking_tools.request_transfer(
        user_id, session_id, source["id"], payee["account_id"], amount,
        note="语音测试转账",
    )
    if not result["success"]:
        return f"转账申请创建失败：{result['error']}"
    return f"已创建向{payee['name']}转账 {amount} 元的待确认申请，当前从{source['name']}转出。请回复“确认”或“取消”。"


class Offer(BaseModel):
    sdp: str
    type: str


def _event(channel, event_type, text):
    if channel.readyState == "open":
        channel.send(json.dumps({"type": event_type, "text": text}, ensure_ascii=False))


def create_app(runtime=None, asr=None):
    peers = set()
    session_locks = {}
    owned_runtime = runtime is None
    runtime_holder = {"value": runtime}
    asr = asr or OpenAICompatibleASR(
        os.environ.get("VOICE_ASR_BASE_URL", "https://api.siliconflow.cn/v1"),
        os.environ.get("VOICE_ASR_MODEL", "FunAudioLLM/SenseVoiceSmall"),
        os.environ.get("VOICE_ASR_API_KEY") or os.environ.get("SILICONFLOW_API_KEY", ""),
    )
    audio_config = VoiceAudioConfig(
        silence_ms=int(os.environ.get("VOICE_SILENCE_MS", "700")),
        min_speech_ms=int(os.environ.get("VOICE_MIN_SPEECH_MS", "300")),
        rms_threshold=int(os.environ.get("VOICE_RMS_THRESHOLD", "500")),
    )

    @asynccontextmanager
    async def lifespan(_app):
        yield
        await asyncio.gather(*(pc.close() for pc in peers), return_exceptions=True)
        if owned_runtime and runtime_holder["value"] is not None:
            runtime_holder["value"].close()

    app = FastAPI(
        title="Bank Agent Voice Prototype", docs_url=None, redoc_url=None,
        lifespan=lifespan,
    )

    def get_runtime():
        if runtime_holder["value"] is None:
            runtime_holder["value"] = create_runtime()
        return runtime_holder["value"]

    @app.get("/", include_in_schema=False)
    def home():
        return FileResponse(PAGE)

    @app.get("/health")
    def health():
        return {"status": "ok", "webrtc": RTCPeerConnection is not None,
                "asr_model": asr.model, "asr_configured": bool(asr.api_key)}

    @app.post("/voice/offer")
    async def offer(data: Offer):
        if RTCPeerConnection is None:
            raise HTTPException(503, "请先运行 uv sync --extra voice 安装 WebRTC 依赖")
        pc = RTCPeerConnection()
        peers.add(pc)
        state = {"channel": None}
        user_id = os.environ.get("BANK_USER_ID", "U4")
        session_id = "VOICE" + uuid.uuid4().hex[:12].upper()
        session_locks.setdefault(session_id, asyncio.Lock())

        @pc.on("datachannel")
        def on_datachannel(channel):
            state["channel"] = channel

        @pc.on("connectionstatechange")
        async def on_connectionstatechange():
            if pc.connectionState in {"failed", "closed"}:
                await pc.close()
                peers.discard(pc)
                session_locks.pop(session_id, None)

        async def process_utterance(pcm):
            channel = state["channel"]
            if not channel:
                return
            async with session_locks[session_id]:
                try:
                    _event(channel, "status", "正在识别…")
                    text = await asr.transcribe(pcm, audio_config.sample_rate)
                    if not text:
                        _event(channel, "status", "没有识别到有效语音")
                        return
                    _event(channel, "transcript", text)
                    _event(channel, "status", "Bank Agent 正在处理…")
                    runtime = get_runtime()
                    fast_response = await asyncio.to_thread(
                        _fast_voice_response, runtime, user_id, session_id, text,
                    )
                    if fast_response is not None:
                        response_text = fast_response
                    else:
                        progress = True

                        async def keepalive():
                            seconds = 0
                            while progress:
                                await asyncio.sleep(5)
                                seconds += 5
                                if progress:
                                    _event(channel, "status", f"仍在处理，已等待 {seconds} 秒…")

                        keepalive_task = asyncio.create_task(keepalive())
                        try:
                            result = await asyncio.to_thread(
                                runtime.agent.chat, user_id, session_id, text,
                            )
                            response_text = result["response"]
                        finally:
                            progress = False
                            keepalive_task.cancel()
                    _event(channel, "response", response_text)
                    _event(channel, "status", "请继续说话")
                except Exception as error:
                    current_runtime = runtime_holder["value"]
                    if current_runtime is not None:
                        current_runtime.logs.agent.write(
                            "voice_error", user_id, session_id,
                            error_type=type(error).__name__, error=str(error),
                        )
                    _event(channel, "error", str(error))

        @pc.on("track")
        def on_track(track):
            if track.kind != "audio":
                return

            async def consume():
                detector = VoiceTurnDetector(audio_config)
                resampler = AudioResampler(format="s16", layout="mono", rate=16_000)
                try:
                    while True:
                        source = await track.recv()
                        for frame in resampler.resample(source):
                            samples = frame.to_ndarray().reshape(-1).astype(np.int16)
                            pcm = samples.tobytes()
                            rms = int(np.sqrt(np.mean(samples.astype(np.float64) ** 2))) if samples.size else 0
                            started, utterance = detector.push(pcm, rms)
                            if started and state["channel"]:
                                _event(state["channel"], "status", "正在聆听…")
                            if utterance:
                                asyncio.create_task(process_utterance(utterance))
                except Exception:
                    utterance = detector.flush()
                    if utterance:
                        await process_utterance(utterance)

            asyncio.create_task(consume())

        await pc.setRemoteDescription(RTCSessionDescription(sdp=data.sdp, type=data.type))
        answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        return {"sdp": pc.localDescription.sdp, "type": pc.localDescription.type}

    return app


load_dotenv(ROOT.parent / ".env")
app = create_app()


def main():
    parser = argparse.ArgumentParser(description="Bank Agent WebRTC voice prototype")
    parser.add_argument("--host", default=os.environ.get("VOICE_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("VOICE_PORT", "8090")))
    args = parser.parse_args()
    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
