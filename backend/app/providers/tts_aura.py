import logging
import httpx
from typing import AsyncGenerator, Optional
from app.providers.base import BaseTTSProvider
from app.voice.barge_in import CancellationToken
from app.core.config import settings

logger = logging.getLogger("voxai.providers.aura")

class DeepgramAuraTTSProvider(BaseTTSProvider):
    """
    Deepgram Aura TTS Provider - ultra cheap and high speed voice synthesis.
    Model: aura-asteria-en, aura-luna-en, aura-stella-en, etc.
    """
    def __init__(self, api_key: Optional[str] = None, model: str = "aura-asteria-en"):
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

        if not self.api_key:
            logger.warning("DEEPGRAM_API_KEY not set. Using fallback TTS.")
            from app.providers.tts_fallback import FallbackTTSProvider
            fallback = FallbackTTSProvider()
            async for chunk in fallback.synthesize(text, cancellation_token=cancellation_token):
                yield chunk
            return

        model_name = voice_id or self.model
        url = f"https://api.deepgram.com/v1/speak?model={model_name}&encoding=mp3"
        payload = {"text": text.strip()}
        headers = {
            "Authorization": f"Token {self.api_key}",
            "Content-Type": "application/json"
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                async with client.stream("POST", url, headers=headers, json=payload) as response:
                    if response.status_code != 200:
                        err = await response.aread()
                        logger.error(f"Deepgram Aura TTS error HTTP {response.status_code}: {err.decode('utf-8')}")
                        from app.providers.tts_fallback import FallbackTTSProvider
                        fallback = FallbackTTSProvider()
                        async for chunk in fallback.synthesize(text, cancellation_token=cancellation_token):
                            yield chunk
                        return

                    async for chunk in response.aiter_bytes(chunk_size=1024):
                        if cancellation_token and cancellation_token.is_cancelled():
                            logger.info("Deepgram Aura TTS interrupted by barge-in!")
                            break
                        if chunk:
                            yield chunk

        except Exception as e:
            logger.error(f"Deepgram Aura TTS exception: {e}")
            from app.providers.tts_fallback import FallbackTTSProvider
            fallback = FallbackTTSProvider()
            async for chunk in fallback.synthesize(text, cancellation_token=cancellation_token):
                yield chunk
