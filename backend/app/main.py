import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.db.database import init_db
from app.api.health import router as health_router
from app.api.voice_ws import router as ws_router
from app.api.assistants import router as assistants_router
from app.api.calls import router as calls_router

logging.basicConfig(
    level=logging.INFO if settings.DEBUG else logging.WARNING,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)

logger = logging.getLogger("voxai.main")

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Attach Routers
app.include_router(health_router, prefix="/api", tags=["Health"])
app.include_router(assistants_router, prefix="/api", tags=["Assistants"])
app.include_router(calls_router, prefix="/api", tags=["Call Logs"])
app.include_router(ws_router, tags=["Voice WebSocket"])

@app.on_event("startup")
async def startup_event():
    await init_db()
    logger.info(f"⚡ VoxAI Voice Platform v{settings.VERSION} starting up...")
    logger.info(f"WebSocket endpoint live at ws://{settings.HOST}:{settings.PORT}/ws/call/{{session_id}}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=settings.HOST, port=settings.PORT, reload=settings.DEBUG)
