import asyncio
import logging

logger = logging.getLogger("voxai.barge_in")

class CancellationToken:
    """
    Thread-safe & Async-safe token for immediate barge-in interruption.
    When a user speaks while LLM is generating or TTS is synthesizing,
    calling cancel() aborts downstream tasks immediately.
    """
    def __init__(self):
        self._cancelled = False
        self._event = asyncio.Event()

    def cancel(self):
        if not self._cancelled:
            self._cancelled = True
            self._event.set()
            logger.info("Barge-in triggered: Cancellation token set!")

    def is_cancelled(self) -> bool:
        return self._cancelled

    def reset(self):
        self._cancelled = False
        self._event.clear()

    async def wait_until_cancelled(self):
        await self._event.wait()
