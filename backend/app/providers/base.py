from abc import ABC, abstractmethod
from typing import AsyncGenerator, List, Dict, Any, Optional
from app.voice.barge_in import CancellationToken

class STTEvent:
    def __init__(self, text: str, is_final: bool, confidence: float = 1.0, speech_started: bool = False):
        self.text = text
        self.is_final = is_final
        self.confidence = confidence
        self.speech_started = speech_started

    def __repr__(self):
        return f"<STTEvent final={self.is_final} text='{self.text}'>"

class BaseSTTProvider(ABC):
    @abstractmethod
    async def process_audio_chunk(self, chunk: bytes) -> AsyncGenerator[STTEvent, None]:
        """Process incoming audio bytes (PCM/wav/webm) and yield STT events."""
        pass

    @abstractmethod
    async def close(self):
        """Clean up connections."""
        pass


class BaseLLMProvider(ABC):
    @abstractmethod
    async def stream_completion(
        self,
        messages: List[Dict[str, str]],
        system_prompt: Optional[str] = None,
        cancellation_token: Optional[CancellationToken] = None,
        temperature: float = 0.7,
        max_tokens: int = 250,
    ) -> AsyncGenerator[str, None]:
        """Stream response tokens from LLM provider."""
        pass


class BaseTTSProvider(ABC):
    @abstractmethod
    async def synthesize(
        self,
        text: str,
        voice_id: Optional[str] = None,
        cancellation_token: Optional[CancellationToken] = None
    ) -> AsyncGenerator[bytes, None]:
        """Synthesize text to audio stream (PCM/mp3 audio chunks)."""
        pass
