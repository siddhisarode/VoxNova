import logging
from typing import AsyncGenerator
from app.providers.base import BaseSTTProvider, STTEvent

logger = logging.getLogger("voxai.providers.stt_fallback")

class FallbackSTTProvider(BaseSTTProvider):
    """
    Fallback STT Provider for browser testing when direct text/speech events 
    are passed over WebSocket or when Deepgram API key is omitted.
    """
    async def process_audio_chunk(self, chunk: bytes) -> AsyncGenerator[STTEvent, None]:
        # Silence/noop for raw audio if no key, as text is handled via WS JSON messages directly
        yield STTEvent(text="", is_final=False)

    async def close(self):
        pass
