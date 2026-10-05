from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from app.db.database import get_db
from app.db.models import Assistant
from app.db.schemas import AssistantCreate, AssistantUpdate, AssistantResponse

router = APIRouter(prefix="/assistants", tags=["Assistants"])

@router.post("", response_model=AssistantResponse, status_code=status.HTTP_201_CREATED)
async def create_assistant(data: AssistantCreate, db: AsyncSession = Depends(get_db)):
    assistant = Assistant(**data.model_dump())
    db.add(assistant)
    await db.commit()
    await db.refresh(assistant)
    return assistant

@router.get("", response_model=List[AssistantResponse])
async def list_assistants(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Assistant).order_by(Assistant.created_at.desc()))
    return result.scalars().all()

@router.get("/{assistant_id}", response_model=AssistantResponse)
async def get_assistant(assistant_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Assistant).where(Assistant.id == assistant_id))
    assistant = result.scalar_one_or_none()
    if not assistant:
        raise HTTPException(status_code=404, detail="Assistant not found")
    return assistant

@router.patch("/{assistant_id}", response_model=AssistantResponse)
async def update_assistant(assistant_id: str, data: AssistantUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Assistant).where(Assistant.id == assistant_id))
    assistant = result.scalar_one_or_none()
    if not assistant:
        raise HTTPException(status_code=404, detail="Assistant not found")

    update_data = data.model_dump(exclude_unset=True)
    for field, val in update_data.items():
        setattr(assistant, field, val)

    await db.commit()
    await db.refresh(assistant)
    return assistant

@router.delete("/{assistant_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_assistant(assistant_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Assistant).where(Assistant.id == assistant_id))
    assistant = result.scalar_one_or_none()
    if not assistant:
        raise HTTPException(status_code=404, detail="Assistant not found")

    await db.delete(assistant)
    await db.commit()
    return None
