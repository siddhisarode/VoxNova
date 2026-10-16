from fastapi import APIRouter
from app.core.config import settings

router = APIRouter()

@router.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "providers": {
            "groq": "available" if settings.GROQ_API_KEY else "unconfigured",
            "openrouter": "available" if settings.OPENROUTER_API_KEY else "unconfigured",
            "deepgram": "available" if settings.DEEPGRAM_API_KEY else "unconfigured",
            "elevenlabs": "available" if settings.ELEVENLABS_API_KEY else "unconfigured"
        }
    }

