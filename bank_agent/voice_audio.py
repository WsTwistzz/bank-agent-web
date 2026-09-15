"""Audio turn detection and ASR adapter for the WebRTC voice prototype."""

import io
import wave
from dataclasses import dataclass

import httpx


@dataclass(frozen=True)
class VoiceAudioConfig:
    sample_rate: int = 16_000
    silence_ms: int = 700
    min_speech_ms: int = 300
    rms_threshold: int = 500


class VoiceTurnDetector:
    """Collect 16-bit mono PCM and emit complete utterances after silence."""

    def __init__(self, config=None):
        self.config = config or VoiceAudioConfig()
        self._speech = bytearray()
        self._speech_ms = 0.0
        self._silence_ms = 0.0
        self._active = False

    @property
    def active(self):
        return self._active

    def push(self, pcm, rms):
        frame_ms = len(pcm) / 2 / self.config.sample_rate * 1000
        is_speech = rms >= self.config.rms_threshold
        started = is_speech and not self._active
        if is_speech:
            self._active = True
            self._speech.extend(pcm)
            self._speech_ms += frame_ms
            self._silence_ms = 0
        elif self._active:
            self._speech.extend(pcm)
            self._silence_ms += frame_ms

        utterance = None
        if self._active and self._silence_ms >= self.config.silence_ms:
            if self._speech_ms >= self.config.min_speech_ms:
                utterance = bytes(self._speech)
            self.reset()
        return started, utterance

    def flush(self):
        utterance = None
        if self._active and self._speech_ms >= self.config.min_speech_ms:
            utterance = bytes(self._speech)
        self.reset()
        return utterance

    def reset(self):
        self._speech.clear()
        self._speech_ms = 0
        self._silence_ms = 0
        self._active = False


def pcm_to_wav(pcm, sample_rate=16_000):
    output = io.BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(pcm)
    return output.getvalue()


class OpenAICompatibleASR:
    def __init__(self, base_url, model, api_key="", timeout=60, client=None):
        self.url = base_url.rstrip("/") + "/audio/transcriptions"
        self.model = model
        self.api_key = api_key
        self.timeout = timeout
        self.client = client

    async def transcribe(self, pcm, sample_rate=16_000):
        if not self.api_key:
            raise RuntimeError("VOICE_ASR_API_KEY 未配置")
        headers = {"Authorization": f"Bearer {self.api_key}"}
        files = {
            "file": ("speech.wav", pcm_to_wav(pcm, sample_rate), "audio/wav"),
            "model": (None, self.model),
        }
        owns_client = self.client is None
        client = self.client or httpx.AsyncClient(timeout=self.timeout)
        try:
            response = await client.post(self.url, headers=headers, files=files)
            try:
                response.raise_for_status()
            except httpx.HTTPStatusError as error:
                trace_id = response.headers.get("x-siliconcloud-trace-id")
                suffix = f"，trace_id={trace_id}" if trace_id else ""
                raise RuntimeError(
                    f"ASR 服务请求失败（HTTP {response.status_code}{suffix}）"
                ) from error
            payload = response.json()
        finally:
            if owns_client:
                await client.aclose()
        text = payload.get("text")
        if text is None and payload.get("choices"):
            text = payload["choices"][0].get("message", {}).get("content")
        if not isinstance(text, str):
            raise RuntimeError("ASR 服务响应中没有 text")
        return text.strip()


class OpenAICompatibleTTS:
    """Stream raw PCM audio from an OpenAI-compatible speech endpoint."""

    def __init__(
        self, base_url, model, api_key="", voice=None, sample_rate=24_000,
        timeout=60, client=None,
    ):
        self.url = base_url.rstrip("/") + "/audio/speech"
        self.model = model
        self.api_key = api_key
        self.voice = voice or f"{model}:anna"
        self.sample_rate = sample_rate
        self.timeout = timeout
        self.client = client

    async def stream(self, text):
        if not self.api_key:
            raise RuntimeError("VOICE_TTS_API_KEY 未配置")
        body = {
            "model": self.model,
            "voice": self.voice,
            "input": text,
            "response_format": "pcm",
            "sample_rate": self.sample_rate,
            "stream": True,
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        owns_client = self.client is None
        client = self.client or httpx.AsyncClient(timeout=self.timeout)
        try:
            async with client.stream("POST", self.url, headers=headers, json=body) as response:
                try:
                    response.raise_for_status()
                except httpx.HTTPStatusError as error:
                    raise RuntimeError(
                        f"TTS 服务请求失败（HTTP {response.status_code}）"
                    ) from error
                async for chunk in response.aiter_bytes():
                    if chunk:
                        yield chunk
        finally:
            if owns_client:
                await client.aclose()
