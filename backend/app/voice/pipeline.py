import asyncio
import logging
import base64
import time
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Callable, Awaitable
from app.providers.base import BaseSTTProvider, BaseLLMProvider, BaseTTSProvider
from app.providers.factory import ProviderFactory
from app.voice.barge_in import CancellationToken
from app.voice.sentence_streamer import SentenceStreamer
from app.voice.metrics import LatencyTracker
from app.core.config import settings
from app.core.prompts import build_effective_system_prompt

logger = logging.getLogger("voxai.voice.pipeline")

class VoicePipeline:
    """
    Main Real-time Voice Call Orchestrator.
    Manages session lifecycle, STT -> LLM -> TTS stream processing,
    Barge-in interruption handling, race-condition safe turn tracking,
    and call summary analytics for database persistence.
    """
    def __init__(
        self,
        session_id: str,
        assistant_id: Optional[str] = None,
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
        temperature: float = 0.7,
    ):
        self.session_id = session_id
        self.assistant_id = assistant_id
        self.system_prompt = system_prompt or settings.DEFAULT_SYSTEM_PROMPT
        self.temperature = temperature
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
        
        # Turn tracking to avoid cancellation race conditions
        self._turn_id = 0
        
        # Conversation & Session state
        self.messages: List[Dict[str, str]] = []
        self.transcript_history: List[Dict[str, Any]] = []
        self.is_speaking = False
        self.start_time = time.time()
        self.latest_latency_metrics: Dict[str, Any] = {}
        self.turn_metrics_history: List[Dict[str, Any]] = []
        self.end_call_phrases: List[str] = ["goodbye", "bye-bye", "bye bye", "have a great day", "have a nice day", "talk to you later"]

    def trigger_barge_in(self):
        """Interrupt active LLM & TTS pipeline immediately upon client speech."""
        self._turn_id += 1 # Invalidate previous turn callback
        
        if self.cancellation_token and not self.cancellation_token.is_cancelled():
            logger.info(f"Session [{self.session_id}] Barge-in triggered! Cancelling active response.")
            self.cancellation_token.cancel()
            
        if self.current_processing_task and not self.current_processing_task.done():
            self.current_processing_task.cancel()

        self.is_speaking = False
        
        # Notify client to flush audio playback buffer and resume listening
        if self.send_ws_message:
            asyncio.create_task(self.send_ws_message({
                "type": "barge_in",
                "message": "Playback buffer cleared by barge-in"
            }))
            asyncio.create_task(self.send_ws_message({
                "type": "status",
                "state": "listening"
            }))

    async def speak_greeting(self, text: str):
        """Synthesizes and streams an initial greeting when call connects."""
        if not text or not text.strip():
            return

        clean_text = text.strip()
        self.messages.append({"role": "assistant", "content": clean_text})
        self.transcript_history.append({
            "role": "assistant",
            "text": clean_text,
            "timestamp": datetime.now(timezone.utc).isoformat()
        })

        if self.send_ws_message:
            await self.send_ws_message({
                "type": "assistant_text_chunk",
                "text": clean_text
            })

        # Synthesize audio for greeting
        self.cancellation_token = CancellationToken()
        turn_id = self._turn_id
        
        try:
            self.is_speaking = True
            if self.send_ws_message:
                await self.send_ws_message({"type": "status", "state": "speaking"})

            audio_stream = self.tts_provider.synthesize(
                text=clean_text,
                cancellation_token=self.cancellation_token
            )

            async for audio_bytes in audio_stream:
                if self.cancellation_token.is_cancelled():
                    break
                if self.send_ws_message and audio_bytes:
                    audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
                    await self.send_ws_message({
                        "type": "audio_chunk",
                        "audio_b64": audio_b64,
                        "format": "mp3"
                    })
        except Exception as e:
            logger.error(f"Error speaking greeting: {e}")
        finally:
            if turn_id == self._turn_id:
                self.is_speaking = False
                if self.send_ws_message:
                    await self.send_ws_message({"type": "status", "state": "listening"})

    async def process_audio_chunk(self, chunk: bytes):
        """Processes raw audio bytes from client microphone through STT engine."""
        if not chunk or not self.stt_provider:
            return

        try:
            async for event in self.stt_provider.process_audio_chunk(chunk):
                if event.speech_started:
                    self.trigger_barge_in()

                if event.is_final and event.text.strip():
                    await self.process_user_text(event.text.strip())
                elif not event.is_final and event.text.strip():
                    # Send interim transcript
                    if self.send_ws_message:
                        await self.send_ws_message({
                            "type": "user_transcript",
                            "text": event.text.strip(),
                            "is_final": False
                        })
        except Exception as e:
            logger.error(f"Error in STT audio chunk processing: {e}")

    async def process_user_text(self, text: str):
        """Process user text transcript (from WebSockets or STT)."""
        if not text or not text.strip():
            return

        clean_text = text.strip()

        # Acoustic Echo Protection (Defense-in-depth):
        # Discard user input ONLY if assistant is actively speaking AND input is an echo of assistant's speech
        if self.is_speaking:
            clean_lower = clean_text.lower()
            recent_assistant_texts = [
                m["content"].lower() for m in self.messages[-3:] if m.get("role") == "assistant"
            ]
            is_echo = False
            for ast_text in recent_assistant_texts:
                clean_ast = ast_text.replace(",", "").replace(".", "").replace("!", "").replace("?", "").replace("'", "").strip()
                clean_usr = clean_lower.replace(",", "").replace(".", "").replace("!", "").replace("?", "").replace("'", "").strip()
                if clean_usr and len(clean_usr.split()) >= 3 and clean_usr in clean_ast:
                    is_echo = True
                    break
                if clean_usr and clean_usr == clean_ast:
                    is_echo = True
                    break

            if is_echo:
                logger.warning(f"Session [{self.session_id}] Discarded acoustic echo during playback: '{clean_text}'")
                return

        # 1. Trigger barge-in if assistant is currently speaking or generating
        self.trigger_barge_in()

        # 2. Reset cancellation token and increment turn ID
        self._turn_id += 1
        current_turn = self._turn_id
        self.cancellation_token = CancellationToken()
        self.latency_tracker.reset()
        self.latency_tracker.mark_user_eos()
        self.latency_tracker.mark_stt_final()

        # 3. Add to conversation history with smart deduplication & merging
        clean_text = text.strip()
        if self.messages and self.messages[-1].get("role") == "user":
            last_content = self.messages[-1].get("content", "").strip()
            if clean_text == last_content:
                logger.info(f"Session [{self.session_id}] Discarded identical duplicate speech event: '{clean_text}'")
                return
            elif clean_text.startswith(last_content) and len(clean_text) > len(last_content):
                self.messages[-1]["content"] = clean_text
                if self.transcript_history and self.transcript_history[-1].get("role") == "user":
                    self.transcript_history[-1]["text"] = clean_text
            else:
                self.messages[-1]["content"] += f". {clean_text}"
                if self.transcript_history and self.transcript_history[-1].get("role") == "user":
                    self.transcript_history[-1]["text"] += f". {clean_text}"
        else:
            self.messages.append({"role": "user", "content": clean_text})
            self.transcript_history.append({
                "role": "user",
                "text": clean_text,
                "timestamp": datetime.now(timezone.utc).isoformat()
            })

        # 4. Notify client of user final transcript
        if self.send_ws_message:
            await self.send_ws_message({
                "type": "user_transcript",
                "text": clean_text,
                "is_final": True
            })

        # 5. Launch turn execution task
        self.current_processing_task = asyncio.create_task(
            self._execute_assistant_turn(self.cancellation_token, current_turn)
        )

    async def _execute_assistant_turn(self, cancel_token: CancellationToken, turn_id: int):
        """Executes LLM streaming -> Sentence Streamer -> TTS streaming -> WS Audio frames."""
        try:
            self.is_speaking = True
            if self.send_ws_message:
                await self.send_ws_message({"type": "status", "state": "thinking"})

            assistant_reply_full = ""
            
            # Combine predesigned human behavioral prompt with user's custom purpose
            effective_prompt = build_effective_system_prompt(self.system_prompt)

            # Sanitize messages to guarantee strictly alternating dialogue turns
            sanitized_messages = []
            for m in self.messages:
                role = m.get("role", "user")
                content = m.get("content", "").strip()
                if not content:
                    continue
                if sanitized_messages and sanitized_messages[-1]["role"] == role and role != "system":
                    if sanitized_messages[-1]["content"] != content:
                        sanitized_messages[-1]["content"] += f". {content}"
                else:
                    sanitized_messages.append({"role": role, "content": content})

            # Create LLM token stream generator
            llm_stream = self.llm_provider.stream_completion(
                messages=sanitized_messages,
                system_prompt=effective_prompt,
                cancellation_token=cancel_token,
                temperature=self.temperature
            )

            # Sentence stream generator
            sentence_stream = self.sentence_streamer.extract_sentences(llm_stream, cancel_token)

            async for sentence in sentence_stream:
                if cancel_token.is_cancelled() or turn_id != self._turn_id:
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
                    if cancel_token.is_cancelled() or turn_id != self._turn_id:
                        break

                    self.latency_tracker.mark_tts_first_audio()

                    # Send audio chunk to WebSocket as base64 string
                    if self.send_ws_message and audio_bytes:
                        audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
                        await self.send_ws_message({
                            "type": "audio_chunk",
                            "audio_b64": audio_b64,
                            "format": "mp3"
                        })

            # Self-healing fallback: if LLM returned 0 tokens or empty response, provide active recovery
            if not cancel_token.is_cancelled() and turn_id == self._turn_id and not assistant_reply_full.strip():
                logger.warning(f"Session [{self.session_id}] Empty LLM response! Providing active recovery phrase.")
                recovery_text = "I'm right here! Could you please share a bit more detail on that?"
                assistant_reply_full = recovery_text
                if self.send_ws_message:
                    await self.send_ws_message({
                        "type": "assistant_text_chunk",
                        "text": recovery_text
                    })
                audio_stream = self.tts_provider.synthesize(
                    text=recovery_text,
                    cancellation_token=cancel_token
                )
                async for audio_bytes in audio_stream:
                    if cancel_token.is_cancelled() or turn_id != self._turn_id:
                        break
                    if self.send_ws_message and audio_bytes:
                        audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
                        await self.send_ws_message({
                            "type": "audio_chunk",
                            "audio_b64": audio_b64,
                            "format": "mp3"
                        })

            if not cancel_token.is_cancelled() and turn_id == self._turn_id and assistant_reply_full.strip():
                clean_full = assistant_reply_full.strip()
                # Save assistant response to conversation history
                self.messages.append({"role": "assistant", "content": clean_full})
                self.transcript_history.append({
                    "role": "assistant",
                    "text": clean_full,
                    "timestamp": datetime.now(timezone.utc).isoformat()
                })

                # Send final turn completion & latency waterfall metrics
                latency_metrics = self.latency_tracker.get_breakdown()
                self.latest_latency_metrics = latency_metrics
                self.turn_metrics_history.append(latency_metrics)
                
                if self.send_ws_message:
                    await self.send_ws_message({
                        "type": "turn_completed",
                        "full_text": clean_full,
                        "latency_metrics": latency_metrics
                    })

                    # Check for assistant end_call farewell
                    lower_clean = clean_full.lower()
                    if any(phrase in lower_clean for phrase in self.end_call_phrases):
                        logger.info(f"Session [{self.session_id}] End-call phrase detected in assistant turn.")
                        await self.send_ws_message({
                            "type": "call_ended",
                            "reason": "assistant_ended_call"
                        })

        except asyncio.CancelledError:
            logger.info(f"Session [{self.session_id}] turn execution task cancelled.")
            self.is_speaking = False
            if self.send_ws_message:
                await self.send_ws_message({"type": "status", "state": "listening"})
        except Exception as e:
            logger.error(f"Session [{self.session_id}] Error in assistant turn: {e}")
            if self.send_ws_message and turn_id == self._turn_id:
                await self.send_ws_message({
                    "type": "error",
                    "message": f"Pipeline error: {str(e)}"
                })
        finally:
            if turn_id == self._turn_id:
                self.is_speaking = False
                if self.send_ws_message:
                    await self.send_ws_message({"type": "status", "state": "listening"})

    def get_call_summary(self, end_reason: str = "user_hangup") -> Dict[str, Any]:
        """Calculates call statistics, duration, and metrics for CallLog persistence."""
        duration = round(time.time() - self.start_time, 2)
        
        avg_metrics = dict(self.latest_latency_metrics)
        if self.turn_metrics_history:
            total_turns = len(self.turn_metrics_history)
            avg_metrics = {
                "stt_latency_ms": round(sum(t.get("stt_latency_ms", 0) for t in self.turn_metrics_history) / total_turns, 1),
                "llm_ttft_ms": round(sum(t.get("llm_ttft_ms", 0) for t in self.turn_metrics_history) / total_turns, 1),
                "tts_ttfa_ms": round(sum(t.get("tts_ttfa_ms", 0) for t in self.turn_metrics_history) / total_turns, 1),
                "total_e2e_ms": round(sum(t.get("total_e2e_ms", 0) for t in self.turn_metrics_history) / total_turns, 1),
            }

        return {
            "session_id": self.session_id,
            "assistant_id": self.assistant_id,
            "status": "ended",
            "duration_seconds": duration,
            "end_reason": end_reason,
            "transcript": self.transcript_history,
            "latency_metrics": avg_metrics,
            "cost_usd": 0.0,
        }

