import logging
from typing import Optional
from app.providers.base import BaseSTTProvider, BaseLLMProvider, BaseTTSProvider
from app.providers.stt_deepgram import DeepgramSTTProvider
from app.providers.stt_fallback import FallbackSTTProvider
from app.providers.llm_groq import GroqLLMProvider
from app.providers.llm_openrouter import OpenRouterLLMProvider
from app.providers.tts_elevenlabs import ElevenLabsTTSProvider
from app.providers.tts_aura import DeepgramAuraTTSProvider
from app.providers.tts_fallback import FallbackTTSProvider
from app.core.config import settings

logger = logging.getLogger("voxai.providers.factory")

class ProviderFactory:
    @staticmethod
    def get_stt_provider(provider_name: str = "deepgram", api_key: Optional[str] = None) -> BaseSTTProvider:
        name = (provider_name or "deepgram").lower()
        key = api_key or settings.DEEPGRAM_API_KEY
        
        if name == "deepgram" and key:
            return DeepgramSTTProvider(api_key=key)
        
        logger.info(f"Using Fallback STT Provider (requested: '{name}')")
        return FallbackSTTProvider()

    @staticmethod
    def get_llm_provider(
        provider_name: str = "groq",
        model: Optional[str] = None,
        api_key: Optional[str] = None
    ) -> BaseLLMProvider:
        name = (provider_name or "groq").lower()
        
        if name == "groq":
            key = api_key or settings.GROQ_API_KEY
            selected_model = model or "qwen/qwen3.8-27b"
            return GroqLLMProvider(api_key=key, model=selected_model)
        
        elif name in ["openrouter", "openai", "claude"]:
            key = api_key or settings.OPENROUTER_API_KEY
            selected_model = model or "openai/gpt-4o-mini"
            return OpenRouterLLMProvider(api_key=key, model=selected_model)
        
        # Default to Groq
        return GroqLLMProvider(api_key=api_key or settings.GROQ_API_KEY, model=model or "qwen/qwen3.8-27b")

    @staticmethod
    def get_tts_provider(
        provider_name: str = "elevenlabs",
        voice_id: Optional[str] = None,
        api_key: Optional[str] = None
    ) -> BaseTTSProvider:
        name = (provider_name or "elevenlabs").lower()
        
        if name == "elevenlabs":
            key = api_key or settings.ELEVENLABS_API_KEY
            v_id = voice_id or "JBFqnCBsd6RMkjVDRZzb"
            if key:
                return ElevenLabsTTSProvider(api_key=key, voice_id=v_id)
            
        elif name in ["aura", "deepgram"]:
            key = api_key or settings.DEEPGRAM_API_KEY
            model = voice_id or "aura-asteria-en"
            if key:
                return DeepgramAuraTTSProvider(api_key=key, model=model)

        logger.info(f"Using Fallback TTS Provider (requested: '{name}')")
        return FallbackTTSProvider()
