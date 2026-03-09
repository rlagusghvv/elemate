from __future__ import annotations

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..identity import get_actor_identity
from ..schemas import ChatMessageCreate, ChatSessionCreate, ChatSessionDetailOut, ChatSessionOut
from ..services.chat import create_chat_session, delete_chat_session, get_chat_session, list_chat_sessions, send_chat_message

router = APIRouter(prefix="/chat", tags=["chat"])


@router.get("/sessions", response_model=list[ChatSessionOut])
def get_chat_sessions(request: Request, db: Session = Depends(get_db)) -> list[ChatSessionOut]:
    actor = get_actor_identity(request)
    return list_chat_sessions(db, actor)


@router.post("/sessions", response_model=ChatSessionDetailOut, status_code=status.HTTP_201_CREATED)
def create_session(payload: ChatSessionCreate, request: Request, db: Session = Depends(get_db)) -> ChatSessionDetailOut:
    actor = get_actor_identity(request)
    session = create_chat_session(db, payload, actor)
    return get_chat_session(db, session.id, actor)


@router.get("/sessions/{session_id}", response_model=ChatSessionDetailOut)
def get_session(session_id: str, request: Request, db: Session = Depends(get_db)) -> ChatSessionDetailOut:
    actor = get_actor_identity(request)
    return get_chat_session(db, session_id, actor)


@router.post("/sessions/{session_id}/messages", response_model=ChatSessionDetailOut)
def post_message(session_id: str, payload: ChatMessageCreate, request: Request, db: Session = Depends(get_db)) -> ChatSessionDetailOut:
    actor = get_actor_identity(request)
    return send_chat_message(db, session_id, payload, actor)


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(session_id: str, request: Request, db: Session = Depends(get_db)) -> None:
    actor = get_actor_identity(request)
    delete_chat_session(db, session_id, actor)
