from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional

from app.db.database import get_db
from app.db.models import CallLog
from app.db.schemas import CallLogResponse, CallLogCreate

router = APIRouter(prefix="/calls", tags=["Call Logs"])

@router.post("", response_model=CallLogResponse, status_code=status.HTTP_201_CREATED)
async def create_or_update_call_log(data: CallLogCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CallLog).where(CallLog.session_id == data.session_id))
    call = result.scalar_one_or_none()
    if call:
        for field, val in data.model_dump(exclude_unset=True).items():
            setattr(call, field, val)
    else:
        call = CallLog(**data.model_dump())
        db.add(call)
    await db.commit()
    await db.refresh(call)
    return call

@router.get("", response_model=List[CallLogResponse])
async def list_call_logs(limit: int = 50, assistant_id: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    query = select(CallLog)
    if assistant_id:
        query = query.where(CallLog.assistant_id == assistant_id)
    result = await db.execute(query.order_by(CallLog.created_at.desc()).limit(limit))
    return result.scalars().all()

@router.get("/export")
async def export_call_logs(format: str = "json", db: AsyncSession = Depends(get_db)):
    import csv
    import io
    from fastapi.responses import StreamingResponse
    result = await db.execute(select(CallLog).order_by(CallLog.created_at.desc()))
    calls = result.scalars().all()

    if format == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["ID", "Session ID", "Status", "Duration (s)", "End Reason", "Summary", "Outcome", "Sentiment", "Cost (USD)", "Created At"])
        for c in calls:
            writer.writerow([
                c.id,
                c.session_id,
                c.status,
                c.duration_seconds,
                c.end_reason,
                c.summary or "",
                c.outcome or "",
                c.sentiment or "",
                c.cost_usd,
                c.created_at.isoformat() if c.created_at else ""
            ])
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=voxnova_call_logs.csv"}
        )

    return [CallLogResponse.model_validate(c) for c in calls]


@router.get("/{call_id}", response_model=CallLogResponse)
async def get_call_log(call_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CallLog).where((CallLog.id == call_id) | (CallLog.session_id == call_id)))
    call = result.scalar_one_or_none()
    if not call:
        raise HTTPException(status_code=404, detail="Call log not found")
    return call

@router.delete("/{call_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_call_log(call_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CallLog).where((CallLog.id == call_id) | (CallLog.session_id == call_id)))
    call = result.scalar_one_or_none()
    if not call:
        raise HTTPException(status_code=404, detail="Call log not found")
    await db.delete(call)
    await db.commit()
    return None

@router.post("/{call_id}/summarize", response_model=CallLogResponse)
async def trigger_call_summarize(call_id: str, db: AsyncSession = Depends(get_db)):
    from app.voice.call_summary import generate_call_summary
    result = await db.execute(select(CallLog).where((CallLog.id == call_id) | (CallLog.session_id == call_id)))
    call = result.scalar_one_or_none()
    if not call:
        raise HTTPException(status_code=404, detail="Call log not found")
    
    analysis = await generate_call_summary(call.transcript or [])
    call.summary = analysis.get("summary")
    call.discussion_points = analysis.get("discussion_points", [])
    call.outcome = analysis.get("outcome")
    call.sentiment = analysis.get("sentiment")

    await db.commit()
    await db.refresh(call)
    return call


