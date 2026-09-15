import json
import struct
import unittest

import httpx

from bank_agent.voice_audio import (
    OpenAICompatibleASR, OpenAICompatibleTTS, VoiceAudioConfig,
    VoiceTurnDetector, pcm_to_wav,
)


def frame(value, milliseconds=100, rate=16_000):
    return struct.pack("<h", value) * (rate * milliseconds // 1000)


class VoiceTurnDetectorTest(unittest.TestCase):
    def test_emits_only_after_minimum_speech_and_silence(self):
        detector = VoiceTurnDetector(VoiceAudioConfig(
            silence_ms=200, min_speech_ms=200, rms_threshold=500,
        ))
        self.assertEqual(detector.push(frame(1000), 1000), (True, None))
        self.assertEqual(detector.push(frame(1000), 1000), (False, None))
        self.assertEqual(detector.push(frame(0), 0), (False, None))
        started, utterance = detector.push(frame(0), 0)
        self.assertFalse(started)
        self.assertIsNotNone(utterance)
        self.assertFalse(detector.active)

    def test_short_noise_is_discarded(self):
        detector = VoiceTurnDetector(VoiceAudioConfig(
            silence_ms=200, min_speech_ms=200, rms_threshold=500,
        ))
        detector.push(frame(1000), 1000)
        detector.push(frame(0), 0)
        self.assertEqual(detector.push(frame(0), 0), (False, None))

    def test_pcm_to_wav_has_riff_header(self):
        self.assertTrue(pcm_to_wav(frame(42)).startswith(b"RIFF"))


class ASRClientTest(unittest.IsolatedAsyncioTestCase):
    async def test_sends_siliconflow_compatible_multipart_request(self):
        async def handler(request):
            self.assertEqual(request.url.path, "/v1/audio/transcriptions")
            self.assertEqual(request.headers["authorization"], "Bearer secret")
            body = await request.aread()
            self.assertIn(b'form-data; name="file"; filename="speech.wav"', body)
            self.assertIn(b'form-data; name="model"', body)
            self.assertIn(b"FunAudioLLM/SenseVoiceSmall", body)
            return httpx.Response(200, json={"text": "查询余额"})

        client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        try:
            asr = OpenAICompatibleASR(
                "https://api.siliconflow.cn/v1", "FunAudioLLM/SenseVoiceSmall",
                "secret", client=client,
            )
            self.assertEqual(await asr.transcribe(frame(1000)), "查询余额")
        finally:
            await client.aclose()

    async def test_requires_api_key(self):
        asr = OpenAICompatibleASR(
            "https://api.siliconflow.cn/v1", "FunAudioLLM/SenseVoiceSmall",
        )
        with self.assertRaisesRegex(RuntimeError, "VOICE_ASR_API_KEY"):
            await asr.transcribe(frame(1000))


class TTSClientTest(unittest.IsolatedAsyncioTestCase):
    async def test_streams_pcm_with_siliconflow_parameters(self):
        async def handler(request):
            self.assertEqual(request.url.path, "/v1/audio/speech")
            self.assertEqual(request.headers["authorization"], "Bearer secret")
            payload = json.loads(await request.aread())
            self.assertTrue(payload["stream"])
            self.assertEqual("pcm", payload["response_format"])
            self.assertEqual(24_000, payload["sample_rate"])
            return httpx.Response(200, content=b"\x01\x00\x02\x00")

        client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        try:
            tts = OpenAICompatibleTTS(
                "https://api.siliconflow.cn/v1", "FunAudioLLM/CosyVoice2-0.5B",
                "secret", client=client,
            )
            chunks = [chunk async for chunk in tts.stream("测试")]
            self.assertEqual(b"\x01\x00\x02\x00", b"".join(chunks))
        finally:
            await client.aclose()
