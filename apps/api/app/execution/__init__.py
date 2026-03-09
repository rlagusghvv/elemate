from .codex_cli import cancel_codex_task, has_codex_session, resume_codex_task, running_codex_task_count, start_codex_task
from .config import AuthSessionStatus, RuntimeStatus, get_auth_session_status, get_runtime_status, set_runtime_preference
from .live import cancel_live_task, has_live_session, resume_live_task, running_task_count as running_live_task_count, start_live_task


def running_task_count() -> int:
    return running_live_task_count() + running_codex_task_count()


def has_task_session(task_id: str) -> bool:
    return has_live_session(task_id) or has_codex_session(task_id)


def start_task_execution(task_id: str, *, mode: str) -> None:
    if mode == "live":
        start_live_task(task_id)
        return
    if mode == "codex":
        start_codex_task(task_id)
        return
    raise ValueError(f"Unsupported execution mode: {mode}")


def resume_task_execution(
    task_id: str,
    *,
    provider: str,
    approval_id: str,
    approved: bool,
    reason: str | None,
    decided_by: str | None,
) -> None:
    if provider == "live":
        resume_live_task(
            task_id,
            approval_id=approval_id,
            approved=approved,
            reason=reason,
            decided_by=decided_by,
        )
        return
    if provider == "codex":
        resume_codex_task(
            task_id,
            approval_id=approval_id,
            approved=approved,
            reason=reason,
            decided_by=decided_by,
        )
        return
    raise ValueError(f"Unsupported execution provider: {provider}")


def cancel_task_runtime(task_id: str) -> bool:
    return cancel_live_task(task_id) or cancel_codex_task(task_id)


__all__ = [
    "AuthSessionStatus",
    "RuntimeStatus",
    "cancel_task_runtime",
    "get_auth_session_status",
    "get_runtime_status",
    "has_task_session",
    "resume_task_execution",
    "running_task_count",
    "set_runtime_preference",
    "start_task_execution",
]
