from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import DATABASE_URL, get_db
from ..execution import get_runtime_status, has_task_session, running_task_count, start_task_execution
from ..models import Approval, ApprovalStatus, Task, TaskStatus
from ..schemas import OperatorRecoveryOut, RuntimeDiagnosticsOut
from ..settings import ARTIFACTS_DIR, LOGS_DIR

router = APIRouter(prefix="/operator", tags=["operator"])


@router.get("/diagnostics", response_model=RuntimeDiagnosticsOut)
def get_runtime_diagnostics(db: Session = Depends(get_db)) -> RuntimeDiagnosticsOut:
    runtime = get_runtime_status()
    total_tasks = db.scalar(select(func.count()).select_from(Task)) or 0
    waiting_approvals = db.scalar(
        select(func.count()).select_from(Approval).where(Approval.status == ApprovalStatus.PENDING)
    ) or 0
    completed_tasks = db.scalar(
        select(func.count()).select_from(Task).where(Task.status == TaskStatus.COMPLETED)
    ) or 0
    failed_tasks = db.scalar(
        select(func.count()).select_from(Task).where(Task.status.in_([TaskStatus.FAILED, TaskStatus.REJECTED, TaskStatus.CANCELED]))
    ) or 0

    return RuntimeDiagnosticsOut(
        app_version="0.2.0",
        selected_mode=runtime.selected_mode,
        preferred_mode=runtime.preferred_mode,
        auth_provider=runtime.auth_provider,
        runtime_reason=runtime.reason,
        workspace_root=runtime.workspace_root,
        artifacts_dir=str(ARTIFACTS_DIR),
        logs_dir=str(LOGS_DIR),
        database_url=str(DATABASE_URL),
        model=runtime.model,
        codex_model=runtime.codex_model,
        browser_available=runtime.browser_available,
        browser_channel=runtime.browser_channel,
        browser_executable_path=runtime.browser_executable_path,
        headless_browser=runtime.headless_browser,
        running_tasks=running_task_count(),
        total_tasks=int(total_tasks),
        waiting_approvals=int(waiting_approvals),
        completed_tasks=int(completed_tasks),
        failed_tasks=int(failed_tasks),
        login_command=runtime.auth_login_command,
        logout_command=runtime.auth_logout_command,
    )


@router.post("/recover", response_model=OperatorRecoveryOut)
def recover_stalled_tasks(db: Session = Depends(get_db)) -> OperatorRecoveryOut:
    runtime = get_runtime_status()
    candidates = db.scalars(
        select(Task).where(Task.status.in_([TaskStatus.PENDING, TaskStatus.PLANNING, TaskStatus.RUNNING]))
    ).all()

    restarted_task_ids: list[str] = []
    skipped_task_ids: list[str] = []
    for task in candidates:
        if has_task_session(task.id):
            skipped_task_ids.append(task.id)
            continue

        mode = _infer_task_mode(task, runtime.selected_mode)
        if mode is None:
            skipped_task_ids.append(task.id)
            continue

        start_task_execution(task.id, mode=mode)
        restarted_task_ids.append(task.id)

    return OperatorRecoveryOut(
        restarted_task_ids=restarted_task_ids,
        skipped_task_ids=skipped_task_ids,
        restarted_count=len(restarted_task_ids),
    )


def _infer_task_mode(task: Task, selected_mode: str) -> str | None:
    if task.model_profile == "codex-chatgpt-login":
        return "codex"
    if task.model_profile == "openai-responses":
        return "live"
    if selected_mode in {"codex", "live"}:
        return selected_mode
    return None
