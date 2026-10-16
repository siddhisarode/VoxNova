import logging
import httpx
from typing import AsyncGenerator, Optional
from app.providers.base import BaseTTSProvider
from app.voice.barge_in import CancellationToken
from app.core.config import settings

from app.voice.speech_normalizer import normalize_speech_text

logger = logging.getLogger("voxai.providers.elevenlabs")

class ElevenLabsTTSProvider(BaseTTSProvider):
    """
    ElevenLabs TTS Provider using low-latency streaming endpoint.
    Default voice: Sarah (EXAVITQu4vr4xnSDxMaL) or George (JBFqnCBsd6RMkjVDRZzb) - studio human realism.
    """
    DEFAULT_VOICE_ID = "EXAVITQu4vr4xnSDxMaL"

    def __init__(self, api_key: Optional[str] = None, voice_id: str = "EXAVITQu4vr4xnSDxMaL"):
        self.api_key = api_key or settings.ELEVENLABS_API_KEY
        self.voice_id = voice_id or self.DEFAULT_VOICE_ID
        self.model_id = "eleven_turbo_v2_5" # Lowest latency model for voice calls

    async def synthesize(
        self,
        text: str,
        voice_id: Optional[str] = None,
        cancellation_token: Optional[CancellationToken] = None
    ) -> AsyncGenerator[bytes, None]:
        if not text or not text.strip():
            return

        cleaned_text = normalize_speech_text(text)
        if not cleaned_text:
            return

        initial_voice = voice_id or self.voice_id
        if not self.api_key:
            logger.warning("ELEVENLABS_API_KEY not set. Using fallback synthesizer.")
            from app.providers.tts_fallback import FallbackTTSProvider
            fallback = FallbackTTSProvider()
            async for chunk in fallback.synthesize(cleaned_text, cancellation_token=cancellation_token):
                yield chunk
            return

        # Filter known paid-only library voices for free keys
        voices_to_try = []
        if initial_voice and initial_voice != "21m00Tcm4TlvDq8ikWAM":
            voices_to_try.append(initial_voice)

        for free_voice in [self.DEFAULT_VOICE_ID, "JBFqnCBsd6RMkjVDRZzb", "cgSgspJ2msm6clMCkdW9", "pNInz6obpgDQGcFmaJgB"]:
            if free_voice not in voices_to_try:
                voices_to_try.append(free_voice)

        headers = {
            "xi-api-key": self.api_key,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg"
        }

        for target_voice in voices_to_try:
            url = f"https://api.elevenlabs.io/v1/text-to-speech/{target_voice}/stream"
            payload = {
                "text": cleaned_text,
                "model_id": self.model_id,
                "voice_settings": {
                    "stability": 0.50,
                    "similarity_boost": 0.75,
                    "style": 0.20,
                    "use_speaker_boost": True,
                    "optimize_streaming_latency": 3
                }
            }

            try:
                async with httpx.AsyncClient(timeout=15.0) as client:
                    async with client.stream("POST", url, headers=headers, json=payload) as response:
                        if response.status_code == 200:
                            audio_bytes = await response.aread()
                            if cancellation_token and cancellation_token.is_cancelled():
                                logger.info("ElevenLabs TTS stream interrupted by barge-in!")
                                return
                            if audio_bytes:
                                yield audio_bytes
                            return
                        else:
                            err = await response.aread()
                            logger.warning(f"ElevenLabs TTS voice '{target_voice}' failed HTTP {response.status_code}: {err.decode('utf-8')}. Trying fallback voice...")

            except Exception as e:
                logger.warning(f"ElevenLabs TTS exception for voice '{target_voice}': {e}")

        # If ElevenLabs fails (e.g. 401 or quota), fallback to ultra-natural Deepgram Aura before robotic gTTS
        if settings.DEEPGRAM_API_KEY:
            logger.info("ElevenLabs unavailable. Using high-fidelity Deepgram Aura human voice.")
            from app.providers.tts_aura import DeepgramAuraTTSProvider
            aura = DeepgramAuraTTSProvider(api_key=settings.DEEPGRAM_API_KEY, model="aura-asteria-en")
            async for chunk in aura.synthesize(text, cancellation_token=cancellation_token):
                yield chunk
            return

        logger.info("All primary voices unavailable. Using Fallback TTS provider.")
        from app.providers.tts_fallback import FallbackTTSProvider
        fallback = FallbackTTSProvider()
        async for chunk in fallback.synthesize(text, cancellation_token=cancellation_token):
            yield chunk
