from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from app.db.database import get_db
from app.db.models import CallLog
from app.db.schemas import CallLogResponse

router = APIRouter(prefix="/calls", tags=["Call Logs"])

@router.get("", response_model=List[CallLogResponse])
async def list_call_logs(limit: int = 50, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CallLog).order_by(CallLog.created_at.desc()).limit(limit))
    return result.scalars().all()

@router.get("/{call_id}", response_model=CallLogResponse)
async def get_call_log(call_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CallLog).where(CallLog.id == call_id))
    call = result.scalar_one_or_none()
    if not call:
        raise HTTPException(status_code=404, detail="Call log not found")
    return call
