import struct
import unittest

from bank_agent.voice_audio import VoiceAudioConfig, VoiceTurnDetector, pcm_to_wav


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
