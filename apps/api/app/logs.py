from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from pathlib import Path

from .settings import LOGS_DIR


def _task_log_path(task_id: str) -> Path:
    return LOGS_DIR / f"{task_id}.jsonl"


def reset_log_events(task_id: str) -> None:
    log_path = _task_log_path(task_id)
    if log_path.exists():
        log_path.unlink()


def append_log_event(
    task_id: str,
    *,
    level: str,
    source: str,
    message: str,
    trace_id: str,
    tool_call_id: str | None = None,
    metadata: dict | None = None,
) -> dict:
    payload = {
        "id": str(uuid.uuid4()),
        "timestamp": datetime.now(UTC).isoformat(),
        "level": level,
        "source": source,
        "message": message,
        "trace_id": trace_id,
        "tool_call_id": tool_call_id,
        "metadata": metadata,
    }
    log_path = _task_log_path(task_id)
    with log_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=True))
        handle.write("\n")
    return payload


def read_log_events(task_id: str) -> list[dict]:
    log_path = _task_log_path(task_id)
    if not log_path.exists():
        return []

    events: list[dict] = []
    with log_path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            events.append(json.loads(line))
    return events
