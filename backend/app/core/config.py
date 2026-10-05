import os
from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    PROJECT_NAME: str = "VoxAI Voice Platform"
    VERSION: str = "0.1.0"
    API_V1_STR: str = "/api/v1"
    
    # Server settings
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    DEBUG: bool = True
    
    # API Keys
    GROQ_API_KEY: Optional[str] = None
    OPENROUTER_API_KEY: Optional[str] = None
    DEEPGRAM_API_KEY: Optional[str] = None
    ELEVENLABS_API_KEY: Optional[str] = None
    
    # Storage
    DATABASE_URL: str = "sqlite+aiosqlite:///./voxai.db"
    REDIS_URL: Optional[str] = None
    
    DEFAULT_SYSTEM_PROMPT: str = (
        "You are VoxAI, a helpful, real-time voice assistant. "
        "Your responses will be spoken aloud to the caller. "
        "Keep your answers concise, clear, natural, and brief (1-3 sentences maximum unless asked for details). "
        "Avoid special characters, markdown formatting, bullet points, or emojis."
    )

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
