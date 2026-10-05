from fastapi import APIRouter
from app.core.config import settings

router = APIRouter()

@router.get("/health")
async def health_check():
    return {
        "status": "online",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "providers": {
            "groq_configured": bool(settings.GROQ_API_KEY),
            "openrouter_configured": bool(settings.OPENROUTER_API_KEY),
            "deepgram_configured": bool(settings.DEEPGRAM_API_KEY),
            "elevenlabs_configured": bool(settings.ELEVENLABS_API_KEY)
        }
    }
