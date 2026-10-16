import json
import logging
import base64
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from app.voice.pipeline import VoicePipeline
from app.providers.factory import ProviderFactory
from app.db.database import AsyncSessionLocal
from app.db.models import Assistant, CallLog
from app.core.config import settings

logger = logging.getLogger("voxai.api.voice_ws")
router = APIRouter()

from app.voice.call_summary import generate_call_summary

async def persist_call_summary(summary: dict, api_key: str = None):
    """Persists a completed call session with AI-generated summary and discussion points."""
    if not summary.get("transcript") and summary.get("duration_seconds", 0) < 1.0:
        return
    try:
        transcript = summary.get("transcript", [])
        ai_analysis = await generate_call_summary(transcript, api_key=api_key)
        
        call_data = dict(summary)
        call_data["summary"] = ai_analysis.get("summary")
        call_data["discussion_points"] = ai_analysis.get("discussion_points", [])
        call_data["outcome"] = ai_analysis.get("outcome")
        call_data["sentiment"] = ai_analysis.get("sentiment")

        async with AsyncSessionLocal() as db:
            call_log = CallLog(**call_data)
            db.add(call_log)
            await db.commit()
            logger.info(f"Call session [{summary.get('session_id')}] persisted with AI summary to database.")
    except Exception as e:
        logger.error(f"Error persisting call log with AI summary: {e}")


@router.websocket("/ws/call/{session_id}")
async def voice_websocket_endpoint(websocket: WebSocket, session_id: str):
    await websocket.accept()
    logger.info(f"WebSocket connected for voice session [{session_id}]")

    async def send_ws_json(data: dict):
        try:
            await websocket.send_text(json.dumps(data))
        except Exception as e:
            logger.error(f"Error sending WS message: {e}")

    # Send connected event
    await send_ws_json({
        "type": "connection_established",
        "session_id": session_id,
        "message": "VoxAI WebSocket pipeline connected ready"
    })

    # Default pipeline configuration
    pipeline = VoicePipeline(
        session_id=session_id,
        send_ws_message=send_ws_json
    )

    end_reason = "user_hangup"

    try:
        while True:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                logger.info(f"WebSocket client disconnected [{session_id}]")
                break
            
            # Handle binary audio frame stream
            if "bytes" in message and message["bytes"]:
                await pipeline.process_audio_chunk(message["bytes"])
                continue


            # Handle text message
            if "text" in message:
                raw_data = message["text"]
                try:
                    msg = json.loads(raw_data)
                    msg_type = msg.get("type")

                    if msg_type == "config":
                        assistant_id = msg.get("assistant_id")
                        if assistant_id:
                            pipeline.assistant_id = assistant_id
                            async with AsyncSessionLocal() as db:
                                res = await db.execute(select(Assistant).where(Assistant.id == assistant_id))
                                ast = res.scalar_one_or_none()
                                if ast:
                                    pipeline.system_prompt = msg.get("system_prompt") or ast.system_prompt
                                    if ast.end_call_phrases:
                                        pipeline.end_call_phrases = ast.end_call_phrases
                                    if msg.get("temperature") is not None:
                                        pipeline.temperature = float(msg["temperature"])
                                    elif getattr(ast, "temperature", None) is not None:
                                        pipeline.temperature = float(ast.temperature)
                                    pipeline.llm_provider = ProviderFactory.get_llm_provider(
                                        provider_name=msg.get("llm_provider") or ast.llm_provider,
                                        model=msg.get("llm_model") or ast.llm_model,
                                        api_key=msg.get("llm_api_key") or ast.llm_api_key or msg.get("groq_api_key") or msg.get("openrouter_api_key")
                                    )
                                    pipeline.tts_provider = ProviderFactory.get_tts_provider(
                                        provider_name=msg.get("tts_provider") or ast.tts_provider,
                                        voice_id=msg.get("tts_voice_id") or ast.tts_voice_id,
                                        api_key=msg.get("tts_api_key") or ast.tts_api_key or msg.get("elevenlabs_api_key") or msg.get("deepgram_api_key")
                                    )
                                    pipeline.stt_provider = ProviderFactory.get_stt_provider(
                                        provider_name=msg.get("stt_provider") or ast.stt_provider,
                                        api_key=msg.get("stt_api_key") or ast.stt_api_key or msg.get("deepgram_api_key")
                                    )
                                    # Trigger first greeting message if set
                                    greeting = msg.get("first_message") or ast.first_message
                                    if greeting and not pipeline.messages:
                                        asyncio.create_task(pipeline.speak_greeting(greeting))

                        if not assistant_id:
                            pipeline.system_prompt = msg.get("system_prompt", pipeline.system_prompt)
                            if msg.get("temperature") is not None:
                                pipeline.temperature = float(msg["temperature"])
                            pipeline.llm_provider = ProviderFactory.get_llm_provider(
                                provider_name=msg.get("llm_provider", "groq"),
                                model=msg.get("llm_model"),
                                api_key=msg.get("llm_api_key") or msg.get("groq_api_key") or msg.get("openrouter_api_key")
                            )
                            pipeline.tts_provider = ProviderFactory.get_tts_provider(
                                provider_name=msg.get("tts_provider", "elevenlabs"),
                                voice_id=msg.get("tts_voice_id"),
                                api_key=msg.get("tts_api_key") or msg.get("elevenlabs_api_key") or msg.get("deepgram_api_key")
                            )
                            greeting = msg.get("first_message")
                            if greeting and not pipeline.messages:
                                asyncio.create_task(pipeline.speak_greeting(greeting))

                        await send_ws_json({"type": "config_updated", "status": "success"})

                    elif msg_type == "user_text":
                        text = msg.get("text", "")
                        await pipeline.process_user_text(text)

                    elif msg_type == "barge_in":
                        pipeline.trigger_barge_in()

                    elif msg_type == "audio_chunk":
                        b64_str = msg.get("audio_b64", "")
                        if b64_str:
                            audio_bytes = base64.b64decode(b64_str)
                            await pipeline.process_audio_chunk(audio_bytes)

                    elif msg_type == "end_call":
                        end_reason = "client_end_call"
                        break

                    elif msg_type == "ping":
                        await send_ws_json({"type": "pong"})

                except json.JSONDecodeError:
                    # Direct plain text message fallback
                    await pipeline.process_user_text(raw_data)

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for session [{session_id}]")
    except Exception as e:
        logger.error(f"Unexpected WebSocket error in session [{session_id}]: {e}")
        end_reason = "error"
    finally:
        summary = pipeline.get_call_summary(end_reason=end_reason)
        llm_key = getattr(pipeline.llm_provider, "api_key", None)
        await persist_call_summary(summary, api_key=llm_key)


