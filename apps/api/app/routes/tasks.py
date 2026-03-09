from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..database import get_db
from ..logs import read_log_events
from ..schemas import (
    ApprovalDecision,
    ApprovalOut,
    TaskCreate,
    TaskDetailOut,
    TaskListItemOut,
    TaskLogsOut,
    TaskReplayOut,
)
from ..services import (
    cancel_task_execution,
    create_task_submission,
    get_task_detail,
    get_task_logs_payload,
    get_task_replay_payload,
    handle_approval_decision,
    list_tasks_with_counts,
)

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("", response_model=list[TaskListItemOut])
def list_tasks(limit: int = 20, db: Session = Depends(get_db)) -> list[TaskListItemOut]:
    if limit < 1 or limit > 100:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="limit must be 1-100")
    return list_tasks_with_counts(db, limit=limit)


@router.post("", response_model=TaskDetailOut, status_code=status.HTTP_201_CREATED)
def create_task(payload: TaskCreate, db: Session = Depends(get_db)) -> TaskDetailOut:
    return create_task_submission(db, payload)


@router.get("/{task_id}", response_model=TaskDetailOut)
def get_task(task_id: str, db: Session = Depends(get_db)) -> TaskDetailOut:
    return get_task_detail(db, task_id)


@router.post("/{task_id}/approve", response_model=ApprovalOut)
def approve_task(task_id: str, payload: ApprovalDecision, db: Session = Depends(get_db)) -> ApprovalOut:
    return handle_approval_decision(db, task_id, payload, approve=True)


@router.post("/{task_id}/reject", response_model=ApprovalOut)
def reject_task(task_id: str, payload: ApprovalDecision, db: Session = Depends(get_db)) -> ApprovalOut:
    return handle_approval_decision(db, task_id, payload, approve=False)


@router.post("/{task_id}/cancel", response_model=TaskDetailOut)
def cancel_task(task_id: str, db: Session = Depends(get_db)) -> TaskDetailOut:
    return cancel_task_execution(db, task_id)


@router.get("/{task_id}/logs", response_model=TaskLogsOut)
def get_task_logs(task_id: str, db: Session = Depends(get_db)) -> TaskLogsOut:
    return get_task_logs_payload(db, task_id)


@router.get("/{task_id}/events/stream")
async def stream_task_events(task_id: str, request: Request, db: Session = Depends(get_db)) -> StreamingResponse:
    get_task_detail(db, task_id)
    last_event_id = request.headers.get("last-event-id")

    async def event_stream():
        cursor = 0
        if last_event_id:
            existing = read_log_events(task_id)
            for index, event in enumerate(existing):
                if str(event.get("id")) == last_event_id:
                    cursor = index + 1
                    break

        while True:
            if await request.is_disconnected():
                break

            events = read_log_events(task_id)
            if cursor > len(events):
                cursor = 0

            for event in events[cursor:]:
                payload = json.dumps(event, ensure_ascii=True)
                yield f"id: {event['id']}\nevent: log\ndata: {payload}\n\n"
                cursor += 1

            yield ": keep-alive\n\n"
            await asyncio.sleep(1)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/{task_id}/replay", response_model=TaskReplayOut)
def get_task_replay(task_id: str, db: Session = Depends(get_db)) -> TaskReplayOut:
    return get_task_replay_payload(db, task_id)
