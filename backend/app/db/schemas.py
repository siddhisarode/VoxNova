from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

class AssistantBase(BaseModel):
    name: str = Field(default="My Voice Assistant", example="Customer Care AI")
    description: Optional[str] = None
    stt_provider: str = Field(default="deepgram")
    llm_provider: str = Field(default="groq")
    llm_model: str = Field(default="qwen/qwen3.8-27b")
    tts_provider: str = Field(default="elevenlabs")
    tts_voice_id: str = Field(default="JBFqnCBsd6RMkjVDRZzb")
    system_prompt: str = Field(default="You are VoxAI, a helpful, real-time voice assistant. Keep answers concise and direct.")
    first_message: Optional[str] = "Hello! How can I help you today?"
    end_call_phrases: Optional[List[str]] = []
    silence_timeout_seconds: Optional[int] = 15
    stt_api_key: Optional[str] = None
    llm_api_key: Optional[str] = None
    tts_api_key: Optional[str] = None

class AssistantCreate(AssistantBase):
    pass

class AssistantUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    stt_provider: Optional[str] = None
    llm_provider: Optional[str] = None
    llm_model: Optional[str] = None
    tts_provider: Optional[str] = None
    tts_voice_id: Optional[str] = None
    system_prompt: Optional[str] = None
    first_message: Optional[str] = None
    end_call_phrases: Optional[List[str]] = None
    silence_timeout_seconds: Optional[int] = None
    stt_api_key: Optional[str] = None
    llm_api_key: Optional[str] = None
    tts_api_key: Optional[str] = None

class AssistantResponse(AssistantBase):
    id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CallLogResponse(BaseModel):
    id: str
    assistant_id: Optional[str]
    session_id: str
    status: str
    duration_seconds: float
    end_reason: str
    transcript: List[Dict[str, Any]]
    latency_metrics: Dict[str, Any]
    cost_usd: float
    created_at: datetime

    class Config:
        from_attributes = True
