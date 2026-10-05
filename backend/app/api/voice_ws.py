import json
import logging
import uuid
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.voice.pipeline import VoicePipeline
from app.providers.factory import ProviderFactory
from app.core.config import settings

logger = logging.getLogger("voxai.api.voice_ws")
router = APIRouter()

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

    # Default pipeline configuration (can be updated via init payload)
    pipeline = VoicePipeline(
        session_id=session_id,
        send_ws_message=send_ws_json
    )

    try:
        while True:
            raw_data = await websocket.receive_text()
            try:
                msg = json.loads(raw_data)
                msg_type = msg.get("type")

                if msg_type == "config":
                    # Dynamic configuration update from client
                    pipeline.system_prompt = msg.get("system_prompt", pipeline.system_prompt)
                    pipeline.llm_provider = ProviderFactory.get_llm_provider(
                        provider_name=msg.get("llm_provider", "groq"),
                        model=msg.get("llm_model"),
                        api_key=msg.get("groq_api_key") or msg.get("openrouter_api_key")
                    )
                    pipeline.tts_provider = ProviderFactory.get_tts_provider(
                        provider_name=msg.get("tts_provider", "elevenlabs"),
                        voice_id=msg.get("tts_voice_id"),
                        api_key=msg.get("elevenlabs_api_key") or msg.get("deepgram_api_key")
                    )
                    await send_ws_json({"type": "config_updated", "status": "success"})

                elif msg_type == "user_text":
                    text = msg.get("text", "")
                    await pipeline.process_user_text(text)

                elif msg_type == "barge_in":
                    pipeline.trigger_barge_in()

                elif msg_type == "ping":
                    await send_ws_json({"type": "pong"})

            except json.JSONDecodeError:
                # Direct plain text message fallback
                await pipeline.process_user_text(raw_data)

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for session [{session_id}]")
    except Exception as e:
        logger.error(f"Unexpected WebSocket error in session [{session_id}]: {e}")
