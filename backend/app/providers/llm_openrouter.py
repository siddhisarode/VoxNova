import logging
import httpx
import json
from typing import AsyncGenerator, List, Dict, Optional
from app.providers.base import BaseLLMProvider
from app.voice.barge_in import CancellationToken
from app.core.config import settings

logger = logging.getLogger("voxai.providers.openrouter")

class OpenRouterLLMProvider(BaseLLMProvider):
    """
    OpenRouter LLM Provider supporting hundreds of models (Claude, GPT-4o, Llama, Mistral).
    """
    def __init__(self, api_key: Optional[str] = None, model: str = "openai/gpt-4o-mini"):
        self.api_key = api_key or settings.OPENROUTER_API_KEY
        self.model = model
        self.base_url = "https://openrouter.ai/api/v1/chat/completions"

    async def stream_completion(
        self,
        messages: List[Dict[str, str]],
        system_prompt: Optional[str] = None,
        cancellation_token: Optional[CancellationToken] = None,
        temperature: float = 0.7,
        max_tokens: int = 300,
    ) -> AsyncGenerator[str, None]:
        if not self.api_key:
            logger.warning("OPENROUTER_API_KEY not set. Falling back to simulated response.")
            async for token in self._simulated_stream(cancellation_token):
                yield token
            return

        formatted_messages = []
        if system_prompt:
            formatted_messages.append({"role": "system", "content": system_prompt})
        formatted_messages.extend(messages)

        payload = {
            "model": self.model,
            "messages": formatted_messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True
        }

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "HTTP-Referer": "https://github.com/voxai",
            "X-Title": "VoxAI Real-Time Voice Platform",
            "Content-Type": "application/json"
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                async with client.stream("POST", self.base_url, headers=headers, json=payload) as response:
                    if response.status_code != 200:
                        err_text = await response.aread()
                        logger.error(f"OpenRouter HTTP {response.status_code}: {err_text.decode('utf-8')}")
                        async for token in self._simulated_stream(cancellation_token, f"[OpenRouter error {response.status_code}]"):
                            yield token
                        return

                    async for line in response.aiter_lines():
                        if cancellation_token and cancellation_token.is_cancelled():
                            logger.info("OpenRouter streaming cancelled by barge-in.")
                            break

                        if not line or not line.startswith("data: "):
                            continue

                        data_str = line[6:].strip()
                        if data_str == "[DONE]":
                            break

                        try:
                            chunk = json.loads(data_str)
                            delta = chunk["choices"][0]["delta"]
                            content = delta.get("content", "")
                            if content:
                                yield content
                        except Exception:
                            continue

        except Exception as e:
            logger.error(f"OpenRouter exception: {e}")
            async for token in self._simulated_stream(cancellation_token, "OpenRouter connection issue."):
                yield token

    async def _simulated_stream(self, cancellation_token: Optional[CancellationToken], text: str = "Hello from OpenRouter voice assistant!") -> AsyncGenerator[str, None]:
        import asyncio
        for word in text.split(" "):
            if cancellation_token and cancellation_token.is_cancelled():
                break
            yield word + " "
            await asyncio.sleep(0.04)
