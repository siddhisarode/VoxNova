import logging
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from app.core.config import settings

logger = logging.getLogger("voxai.db.database")

# Ensure SQLite async URL format if needed
db_url = settings.DATABASE_URL
if db_url.startswith("sqlite://"):
    db_url = db_url.replace("sqlite://", "sqlite+aiosqlite://")

engine = create_async_engine(
    db_url,
    echo=False,
    connect_args={"check_same_thread": False} if "sqlite" in db_url else {}
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False
)

Base = declarative_base()

from sqlalchemy import text

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Safe migration for existing SQLite database
        if "sqlite" in db_url:
            columns_to_add = [
                ("summary", "TEXT"),
                ("discussion_points", "JSON"),
                ("outcome", "TEXT"),
                ("sentiment", "VARCHAR(50)")
            ]
            for col_name, col_type in columns_to_add:
                try:
                    await conn.execute(text(f"ALTER TABLE call_logs ADD COLUMN {col_name} {col_type}"))
                except Exception:
                    pass # Column already exists
            try:
                await conn.execute(text("ALTER TABLE assistants ADD COLUMN temperature FLOAT DEFAULT 0.7"))
            except Exception:
                pass # Column already exists
    logger.info("Database tables initialized with summary & temperature schema.")


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
