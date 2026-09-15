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
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

import numpy as np
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from bank_agent.runtime import create_runtime
from bank_agent.voice_audio import OpenAICompatibleASR, VoiceAudioConfig, VoiceTurnDetector
from bank_agent.voice_transfer import fast_voice_response as _fast_voice_response

try:
    from aiortc import RTCPeerConnection, RTCSessionDescription
    from av import AudioResampler
except ImportError:  # Existing text-only installs must remain usable.
    RTCPeerConnection = RTCSessionDescription = AudioResampler = None


ROOT = Path(__file__).resolve().parent
PAGE = ROOT / "voice.html"


class Offer(BaseModel):
    sdp: str
    type: str


def _event(channel, event_type, text=None, **payload):
    if channel.readyState == "open":
        event = {"type": event_type, **payload}
        if text is not None:
            event["text"] = text
        channel.send(json.dumps(event, ensure_ascii=False))


def create_app(runtime=None, asr=None):
    peers = set()
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
        state = {"channel": None, "detector": None, "capturing": True, "voice_context": {}}
        user_id = os.environ.get("BANK_USER_ID", "U4")
        session_id = "VOICE" + uuid.uuid4().hex[:12].upper()
        session_lock = asyncio.Lock()

        @pc.on("datachannel")
        def on_datachannel(channel):
            state["channel"] = channel

            @channel.on("message")
            def on_message(message):
                try:
                    event = json.loads(message)
                except (TypeError, json.JSONDecodeError):
                    return
                event_type = event.get("type")
                if event_type == "playback_started":
                    state["capturing"] = False
                    if state["detector"]:
                        state["detector"].reset()
                    return
                if event_type == "playback_finished":
                    state["capturing"] = True
                    if state["detector"]:
                        state["detector"].reset()
                    _event(channel, "capture", enabled=True)
                    return
                if event_type != "end_utterance" or not state["capturing"]:
                    return
                state["capturing"] = False
                _event(channel, "capture", enabled=False)
                detector = state["detector"]
                utterance = detector.flush() if detector else None
                if utterance:
                    asyncio.create_task(process_utterance(utterance))
                else:
                    state["capturing"] = True
                    _event(channel, "capture", enabled=True)
                    _event(channel, "status", "还没有检测到有效语音，请再试一次")

        @pc.on("connectionstatechange")
        async def on_connectionstatechange():
            if pc.connectionState in {"failed", "closed"}:
                await pc.close()
                peers.discard(pc)

        async def process_utterance(pcm):
            channel = state["channel"]
            if not channel:
                return
            async with session_lock:
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
                        state["voice_context"],
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
                finally:
                    state["capturing"] = True
                    _event(channel, "capture", enabled=True)

        @pc.on("track")
        def on_track(track):
            if track.kind != "audio":
                return

            async def consume():
                detector = VoiceTurnDetector(audio_config)
                state["detector"] = detector
                resampler = AudioResampler(format="s16", layout="mono", rate=16_000)
                try:
                    while True:
                        source = await track.recv()
                        for frame in resampler.resample(source):
                            if not state["capturing"]:
                                continue
                            samples = frame.to_ndarray().reshape(-1).astype(np.int16)
                            pcm = samples.tobytes()
                            rms = int(np.sqrt(np.mean(samples.astype(np.float64) ** 2))) if samples.size else 0
                            started, utterance = detector.push(pcm, rms)
                            if started and state["channel"]:
                                _event(state["channel"], "status", "正在聆听…")
                            if utterance:
                                state["capturing"] = False
                                _event(state["channel"], "capture", enabled=False)
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
