import logging
import asyncio
import io
from typing import AsyncGenerator, Optional
from app.providers.base import BaseTTSProvider
from app.voice.barge_in import CancellationToken

logger = logging.getLogger("voxai.providers.tts_fallback")

class FallbackTTSProvider(BaseTTSProvider):
    """
    Fallback TTS provider using gTTS or synthesized tone chunks if API keys are missing.
    Ensures seamless end-to-end sandbox testing.
    """
    async def synthesize(
        self,
        text: str,
        voice_id: Optional[str] = None,
        cancellation_token: Optional[CancellationToken] = None
    ) -> AsyncGenerator[bytes, None]:
        if not text or not text.strip():
            return

        try:
            # Try gTTS in an async thread pool
            from gtts import gTTS
            
            def generate_mp3():
                tts = gTTS(text=text.strip(), lang='en')
                fp = io.BytesIO()
                tts.write_to_fp(fp)
                fp.seek(0)
                return fp.read()

            loop = asyncio.get_running_loop()
            mp3_bytes = await loop.run_in_executor(None, generate_mp3)

            # Yield complete MP3 buffer intact to avoid broken audio frames
            if cancellation_token and cancellation_token.is_cancelled():
                logger.info("Fallback TTS interrupted by barge-in!")
                return
            if mp3_bytes:
                yield mp3_bytes

        except Exception as e:
            logger.warning(f"gTTS fallback failed ({e}), generating silent/simulated audio stream.")
            # Yield dummy byte blocks for audio player simulation
            dummy_data = b'\x00' * 512
            for _ in range(5):
                if cancellation_token and cancellation_token.is_cancelled():
                    break
                yield dummy_data
                await asyncio.sleep(0.05)
