from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import AgentPreset
from ..schemas import AgentPresetCreate, AgentPresetOut

router = APIRouter(prefix="/agents", tags=["agents"])


@router.get("", response_model=list[AgentPresetOut])
def list_agent_presets(db: Session = Depends(get_db)) -> list[AgentPreset]:
    return db.scalars(select(AgentPreset).order_by(AgentPreset.updated_at.desc(), AgentPreset.created_at.desc())).all()


@router.post("", response_model=AgentPresetOut, status_code=status.HTTP_201_CREATED)
def create_agent_preset(payload: AgentPresetCreate, db: Session = Depends(get_db)) -> AgentPreset:
    preset = AgentPreset(
        name=payload.name,
        title=payload.title,
        goal=payload.goal,
        workspace_path=payload.workspace_path,
        risk_level=payload.risk_level,
        created_by=payload.created_by,
    )
    db.add(preset)
    db.commit()
    db.refresh(preset)
    return preset


@router.delete("/{preset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_agent_preset(preset_id: str, db: Session = Depends(get_db)) -> None:
    preset = db.get(AgentPreset, preset_id)
    if preset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Saved agent not found")
    db.delete(preset)
    db.commit()
