import audioop
import base64
import json
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger("voxai.voice.twilio")

class TwilioAudioConverter:
    """
    Converts audio between Twilio Media Streams (G.711 u-law 8000Hz) 
    and VoxAI Voice Engine (PCM 16000Hz / 16-bit linear).
    """
    @staticmethod
    def ulaw_to_pcm16(ulaw_bytes: bytes) -> bytes:
        """Convert G.711 u-law 8kHz to Linear PCM 16kHz."""
        try:
            pcm_8k = audioop.ulaw2lin(ulaw_bytes, 2)
            pcm_16k, _ = audioop.ratecv(pcm_8k, 2, 1, 8000, 16000, None)
            return pcm_16k
        except Exception as e:
            logger.error(f"ulaw to pcm error: {e}")
            return b""

    @staticmethod
    def pcm16_to_ulaw(pcm16_bytes: bytes) -> bytes:
        """Convert Linear PCM 16kHz to G.711 u-law 8kHz."""
        try:
            pcm_8k, _ = audioop.ratecv(pcm16_bytes, 2, 1, 16000, 8000, None)
            ulaw_bytes = audioop.lin2ulaw(pcm_8k, 2)
            return ulaw_bytes
        except Exception as e:
            logger.error(f"pcm to ulaw error: {e}")
            return b""

    @staticmethod
    def create_twilio_media_event(stream_sid: str, ulaw_payload_b64: str) -> str:
        """Format base64 u-law audio payload for Twilio WebSocket client."""
        return json.dumps({
            "event": "media",
            "streamSid": stream_sid,
            "media": {
                "payload": ulaw_payload_b64
            }
        })
