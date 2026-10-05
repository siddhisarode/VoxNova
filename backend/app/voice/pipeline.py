import asyncio
import logging
import base64
from typing import Dict, Any, List, Optional, Callable, Awaitable
from app.providers.base import BaseSTTProvider, BaseLLMProvider, BaseTTSProvider
from app.providers.factory import ProviderFactory
from app.voice.barge_in import CancellationToken
from app.voice.sentence_streamer import SentenceStreamer
from app.voice.metrics import LatencyTracker
from app.core.config import settings

logger = logging.getLogger("voxai.voice.pipeline")

class VoicePipeline:
    """
    Main Real-time Voice Call Orchestrator.
    Manages session lifecycle, STT -> LLM -> TTS stream processing,
    Barge-in interruption handling, and latency breakdown reporting.
    """
    def __init__(
        self,
        session_id: str,
        system_prompt: Optional[str] = None,
        stt_provider_name: str = "deepgram",
        llm_provider_name: str = "groq",
        llm_model: str = "qwen/qwen3.8-27b",
        tts_provider_name: str = "elevenlabs",
        tts_voice_id: Optional[str] = None,
        send_ws_message: Optional[Callable[[Dict[str, Any]], Awaitable[None]]] = None,
        stt_api_key: Optional[str] = None,
        llm_api_key: Optional[str] = None,
        tts_api_key: Optional[str] = None,
    ):
        self.session_id = session_id
        self.system_prompt = system_prompt or settings.DEFAULT_SYSTEM_PROMPT
        self.send_ws_message = send_ws_message
        
        # Instantiate Providers
        self.stt_provider = ProviderFactory.get_stt_provider(stt_provider_name, stt_api_key)
        self.llm_provider = ProviderFactory.get_llm_provider(llm_provider_name, llm_model, llm_api_key)
        self.tts_provider = ProviderFactory.get_tts_provider(tts_provider_name, tts_voice_id, tts_api_key)
        
        # Helper utilities
        self.sentence_streamer = SentenceStreamer()
        self.latency_tracker = LatencyTracker()
        self.cancellation_token: Optional[CancellationToken] = None
        self.current_processing_task: Optional[asyncio.Task] = None
        
        # Conversation state
        self.messages: List[Dict[str, str]] = []
        self.is_speaking = False

    def trigger_barge_in(self):
        """Interrupt active LLM & TTS pipeline immediately upon client speech."""
        if self.cancellation_token and not self.cancellation_token.is_cancelled():
            logger.info(f"Session [{self.session_id}] Barge-in triggered! Cancelling active response.")
            self.cancellation_token.cancel()
            
        if self.current_processing_task and not self.current_processing_task.done():
            self.current_processing_task.cancel()

        self.is_speaking = False
        
        # Notify client to flush audio playback buffer
        if self.send_ws_message:
            asyncio.create_task(self.send_ws_message({
                "type": "barge_in",
                "message": "Playback buffer cleared by barge-in"
            }))

    async def process_user_text(self, text: str):
        """Process user text transcript (from WebSockets or STT)."""
        if not text or not text.strip():
            return

        # 1. Trigger barge-in if assistant is currently speaking or generating
        self.trigger_barge_in()

        # 2. Reset cancellation token for new turn
        self.cancellation_token = CancellationToken()
        self.latency_tracker.reset()
        self.latency_tracker.mark_user_eos()
        self.latency_tracker.mark_stt_final()

        # 3. Add to conversation history
        self.messages.append({"role": "user", "content": text.strip()})

        # 4. Notify client of user final transcript
        if self.send_ws_message:
            await self.send_ws_message({
                "type": "user_transcript",
                "text": text.strip(),
                "is_final": True
            })

        # 5. Launch turn execution task
        self.current_processing_task = asyncio.create_task(
            self._execute_assistant_turn(self.cancellation_token)
        )

    async def _execute_assistant_turn(self, cancel_token: CancellationToken):
        """Executes LLM streaming -> Sentence Streamer -> TTS streaming -> WS Audio frames."""
        try:
            self.is_speaking = True
            if self.send_ws_message:
                await self.send_ws_message({"type": "status", "state": "thinking"})

            assistant_reply_full = ""
            
            # Create LLM token stream generator
            llm_stream = self.llm_provider.stream_completion(
                messages=self.messages,
                system_prompt=self.system_prompt,
                cancellation_token=cancel_token
            )

            # Sentence stream generator
            sentence_stream = self.sentence_streamer.extract_sentences(llm_stream, cancel_token)

            async for sentence in sentence_stream:
                if cancel_token.is_cancelled():
                    break

                self.latency_tracker.mark_llm_first_token()
                assistant_reply_full += f" {sentence}"

                # Send streaming text chunk to UI
                if self.send_ws_message:
                    await self.send_ws_message({
                        "type": "assistant_text_chunk",
                        "text": sentence
                    })

                # Synthesize TTS audio for sentence
                audio_stream = self.tts_provider.synthesize(
                    text=sentence,
                    cancellation_token=cancel_token
                )

                async for audio_bytes in audio_stream:
                    if cancel_token.is_cancelled():
                        break

                    self.latency_tracker.mark_tts_first_audio()

                    # Send audio chunk to WebSocket as base64 string
                    if self.send_ws_message:
                        audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
                        await self.send_ws_message({
                            "type": "audio_chunk",
                            "audio_b64": audio_b64,
                            "format": "mp3"
                        })

            if not cancel_token.is_cancelled() and assistant_reply_full.strip():
                # Save assistant response to conversation history
                self.messages.append({"role": "assistant", "content": assistant_reply_full.strip()})

                # Send final turn completion & latency waterfall metrics
                latency_metrics = self.latency_tracker.get_breakdown()
                if self.send_ws_message:
                    await self.send_ws_message({
                        "type": "turn_completed",
                        "full_text": assistant_reply_full.strip(),
                        "latency_metrics": latency_metrics
                    })

        except asyncio.CancelledError:
            logger.info(f"Session [{self.session_id}] turn execution task cancelled.")
        except Exception as e:
            logger.error(f"Session [{self.session_id}] Error in assistant turn: {e}")
            if self.send_ws_message:
                await self.send_ws_message({
                    "type": "error",
                    "message": f"Pipeline error: {str(e)}"
                })
        finally:
            self.is_speaking = False
            if self.send_ws_message:
                await self.send_ws_message({"type": "status", "state": "listening"})
