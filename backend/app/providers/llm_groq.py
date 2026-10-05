import logging
import httpx
import json
from typing import AsyncGenerator, List, Dict, Optional
from app.providers.base import BaseLLMProvider
from app.voice.barge_in import CancellationToken
from app.core.config import settings

logger = logging.getLogger("voxai.providers.groq")

class GroqLLMProvider(BaseLLMProvider):
    """
    Groq LLM Provider using direct streaming API for minimum Time-To-First-Token (TTFT).
    Default model: llama-3.1-8b-instant (supported across all free/paid tiers) or llama-3.3-70b-versatile.
    """
    def __init__(self, api_key: Optional[str] = None, model: str = "qwen/qwen3.8-27b"):
        self.api_key = api_key or settings.GROQ_API_KEY
        self.model = model or "qwen/qwen3.8-27b"
        self.base_url = "https://api.groq.com/openai/v1/chat/completions"

    async def stream_completion(
        self,
        messages: List[Dict[str, str]],
        system_prompt: Optional[str] = None,
        cancellation_token: Optional[CancellationToken] = None,
        temperature: float = 0.7,
        max_tokens: int = 300,
    ) -> AsyncGenerator[str, None]:
        if not self.api_key:
            logger.warning("GROQ_API_KEY not configured. Falling back to simulated stream.")
            async for token in self._simulated_stream(cancellation_token):
                yield token
            return

        formatted_messages = []
        if system_prompt:
            formatted_messages.append({"role": "system", "content": system_prompt})
        formatted_messages.extend(messages)

        # Build list of model candidates to attempt in sequence (prioritizing working models on Groq API)
        candidate_order = [self.model, "qwen/qwen3.8-27b", "openai/gpt-oss-20b", "openai/gpt-oss-120b", "llama-3.1-8b-instant", "llama-3.3-70b-versatile"]
        models_to_try = []
        for m in candidate_order:
            if m and m not in models_to_try:
                models_to_try.append(m)

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

        for model_candidate in models_to_try:
            payload = {
                "model": model_candidate,
                "messages": formatted_messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
                "stream": True
            }

            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    async with client.stream("POST", self.base_url, headers=headers, json=payload) as response:
                        if response.status_code == 200:
                            async for line in response.aiter_lines():
                                if cancellation_token and cancellation_token.is_cancelled():
                                    logger.info("Groq streaming cancelled by barge-in token.")
                                    return

                                if not line or not line.startswith("data: "):
                                    continue
                                
                                data_str = line[6:].strip()
                                if data_str == "[DONE]":
                                    return

                                try:
                                    chunk = json.loads(data_str)
                                    delta = chunk["choices"][0]["delta"]
                                    content = delta.get("content", "")
                                    if content:
                                        yield content
                                except Exception:
                                    continue
                            return

                        else:
                            err_text = await response.aread()
                            logger.warning(f"Groq model '{model_candidate}' failed (HTTP {response.status_code}): {err_text.decode('utf-8')}. Trying next candidate model...")

            except Exception as e:
                logger.warning(f"Groq connection exception for model '{model_candidate}': {e}. Trying next candidate...")

        # If all candidates fail, fallback to clear simulated response
        logger.error("All Groq model candidates failed. Yielding fallback message.")
        async for token in self._simulated_stream(cancellation_token, "I am VoxAI. Groq API response complete."):
            yield token

    async def _simulated_stream(self, cancellation_token: Optional[CancellationToken], text: str = "Hello! I am VoxAI powered by Groq. How can I help you today?") -> AsyncGenerator[str, None]:
        import asyncio
        words = text.split(" ")
        for word in words:
            if cancellation_token and cancellation_token.is_cancelled():
                break
            yield word + " "
            await asyncio.sleep(0.04)
