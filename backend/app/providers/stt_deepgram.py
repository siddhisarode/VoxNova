import logging
import asyncio
import json
import httpx
from typing import AsyncGenerator, Optional
from app.providers.base import BaseSTTProvider, STTEvent
from app.core.config import settings

logger = logging.getLogger("voxai.providers.deepgram")

class DeepgramSTTProvider(BaseSTTProvider):
    """
    Deepgram STT Provider for real-time speech recognition.
    Supports Nova-2 streaming model.
    """
    def __init__(self, api_key: Optional[str] = None, model: str = "nova-2"):
        self.api_key = api_key or settings.DEEPGRAM_API_KEY
        self.model = model

    async def process_audio_chunk(self, chunk: bytes) -> AsyncGenerator[STTEvent, None]:
        if not chunk:
            return

        if not self.api_key:
            logger.warning("DEEPGRAM_API_KEY not configured. Deepgram STT skipping audio chunk.")
            return

        # Direct REST preroll / buffer STT if needed, or WebSocket adapter
        # Here we handle audio buffer stream evaluation via Deepgram Listen API
        url = f"https://api.deepgram.com/v1/listen?model={self.model}&smart_formatting=true"
        headers = {
            "Authorization": f"Token {self.api_key}",
            "Content-Type": "audio/wav"
        }

        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.post(url, headers=headers, content=chunk)
                if resp.status_code == 200:
                    data = resp.json()
                    channels = data.get("results", {}).get("channels", [])
                    if channels and channels[0].get("alternatives"):
                        alt = channels[0]["alternatives"][0]
                        transcript = alt.get("transcript", "").strip()
                        confidence = alt.get("confidence", 1.0)
                        if transcript:
                            yield STTEvent(text=transcript, is_final=True, confidence=confidence)
                else:
                    logger.error(f"Deepgram HTTP {resp.status_code}: {resp.text}")

        except Exception as e:
            logger.error(f"Deepgram STT chunk error: {e}")

    async def close(self):
        pass
