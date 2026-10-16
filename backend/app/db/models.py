import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, Boolean, Float, Integer, DateTime, JSON, ForeignKey
from sqlalchemy.orm import relationship
from app.db.database import Base

def generate_uuid():
    return str(uuid.uuid4())

def utc_now():
    return datetime.now(timezone.utc)

class Assistant(Base):
    __tablename__ = "assistants"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(100), nullable=False, default="My Voice Assistant")
    description = Column(Text, nullable=True)
    
    # Provider configuration
    stt_provider = Column(String(50), default="deepgram")
    llm_provider = Column(String(50), default="groq")
    llm_model = Column(String(100), default="qwen/qwen3.8-27b")
    tts_provider = Column(String(50), default="elevenlabs")
    tts_voice_id = Column(String(100), default="EXAVITQu4vr4xnSDxMaL")
    
    # Behavior configuration
    system_prompt = Column(Text, nullable=False)
    first_message = Column(Text, nullable=True, default="Hello! Welcome to VoxNova. My name is VoxNova. To get started, who do I have the pleasure of speaking with today?")
    temperature = Column(Float, default=0.75) # Human conversational realism (0.70 - 0.75 recommended)
    end_call_phrases = Column(JSON, default=list) # e.g. ["goodbye", "have a nice day"]
    silence_timeout_seconds = Column(Integer, default=15)
    
    # Custom API keys overrides
    stt_api_key = Column(String(255), nullable=True)
    llm_api_key = Column(String(255), nullable=True)
    tts_api_key = Column(String(255), nullable=True)

    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)

    call_logs = relationship("CallLog", back_populates="assistant", cascade="all, delete-orphan")


class CallLog(Base):
    __tablename__ = "call_logs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    assistant_id = Column(String(36), ForeignKey("assistants.id", ondelete="SET NULL"), nullable=True)
    session_id = Column(String(100), unique=True, index=True, nullable=False)
    
    status = Column(String(50), default="ended") # in_progress, ended, failed
    duration_seconds = Column(Float, default=0.0)
    end_reason = Column(String(100), default="user_hangup")
    
    transcript = Column(JSON, default=list) # [{role: 'user'|'assistant', text: '...', timestamp: '...'}]
    latency_metrics = Column(JSON, default=dict) # {avg_total_e2e_ms: 650, avg_stt_ms: 120, ...}
    cost_usd = Column(Float, default=0.0)

    # Post-call conversation analysis & summary
    summary = Column(Text, nullable=True)
    discussion_points = Column(JSON, default=list)
    outcome = Column(Text, nullable=True)
    sentiment = Column(String(50), nullable=True)
    
    created_at = Column(DateTime, default=utc_now)

    assistant = relationship("Assistant", back_populates="call_logs")



class ApiKey(Base):
    __tablename__ = "api_keys"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(100), nullable=False)
    prefix = Column(String(10), nullable=False)
    key_hash = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utc_now)

