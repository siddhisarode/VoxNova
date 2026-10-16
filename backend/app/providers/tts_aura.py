import logging
import httpx
from typing import AsyncGenerator, Optional
from app.providers.base import BaseTTSProvider
from app.voice.barge_in import CancellationToken
from app.core.config import settings

logger = logging.getLogger("voxai.providers.aura")

from app.voice.speech_normalizer import normalize_speech_text

class DeepgramAuraTTSProvider(BaseTTSProvider):
    """
    Deepgram Aura TTS Provider - ultra cheap and high speed voice synthesis.
    Model: aura-luna-en, aura-athena-en, aura-orion-en, aura-asteria-en, etc.
    """
    def __init__(self, api_key: Optional[str] = None, model: str = "aura-luna-en"):
        self.api_key = api_key or settings.DEEPGRAM_API_KEY
        self.model = model

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

        if not self.api_key:
            logger.warning("DEEPGRAM_API_KEY not set. Using fallback TTS.")
            from app.providers.tts_fallback import FallbackTTSProvider
            fallback = FallbackTTSProvider()
            async for chunk in fallback.synthesize(cleaned_text, cancellation_token=cancellation_token):
                yield chunk
            return

        model_name = voice_id or self.model
        url = f"https://api.deepgram.com/v1/speak?model={model_name}&encoding=mp3"
        payload = {"text": cleaned_text}
        headers = {
            "Authorization": f"Token {self.api_key}",
            "Content-Type": "application/json"
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(url, headers=headers, json=payload)
                if response.status_code != 200:
                    logger.error(f"Deepgram Aura TTS error HTTP {response.status_code}: {response.text}")
                    from app.providers.tts_fallback import FallbackTTSProvider
                    fallback = FallbackTTSProvider()
                    async for chunk in fallback.synthesize(text, cancellation_token=cancellation_token):
                        yield chunk
                    return

                if cancellation_token and cancellation_token.is_cancelled():
                    logger.info("Deepgram Aura TTS interrupted by barge-in!")
                    return

                audio_bytes = response.content
                if audio_bytes:
                    yield audio_bytes

        except Exception as e:
            logger.error(f"Deepgram Aura TTS exception: {e}")
            from app.providers.tts_fallback import FallbackTTSProvider
            fallback = FallbackTTSProvider()
            async for chunk in fallback.synthesize(text, cancellation_token=cancellation_token):
                yield chunk
