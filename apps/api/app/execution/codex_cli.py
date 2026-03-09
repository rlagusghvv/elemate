from __future__ import annotations

import json
import subprocess
import threading
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from ..database import SessionLocal
from ..logs import append_log_event
from ..models import (
    Approval,
    ApprovalActionType,
    ApprovalStatus,
    Artifact,
    Step,
    StepStatus,
    Task,
    TaskStatus,
)
from ..settings import ARTIFACTS_DIR, PUBLIC_ARTIFACT_PREFIX
from .config import RuntimeStatus, get_runtime_status

TASK_LOAD_OPTIONS = (
    selectinload(Task.steps),
    selectinload(Task.approvals),
    selectinload(Task.artifacts),
)

APPROVAL_REQUIRED_PATTERNS: tuple[tuple[ApprovalActionType, tuple[str, ...]], ...] = (
    (ApprovalActionType.GIT_PUSH, ("git push",)),
    (ApprovalActionType.FILE_DELETE, ("rm ", "rm -", "unlink ", "trash ", "delete ")),
    (ApprovalActionType.DEPLOY, ("deploy", "release", "vercel --prod", "kubectl apply", "terraform apply")),
    (ApprovalActionType.EXTERNAL_SUBMIT, ("submit", "confirm", "continue", "login")),
    (ApprovalActionType.EMAIL_SEND, ("send", "email", "mail")),
    (ApprovalActionType.PAYMENT, ("checkout", "buy", "purchase", "payment", "order")),
)


@dataclass(slots=True)
class CodexSessionState:
    task_id: str
    stop_event: threading.Event = field(default_factory=threading.Event)
    thread: threading.Thread | None = None
    process: subprocess.Popen[str] | None = None
    thread_id: str | None = None
    approved_commands: set[str] = field(default_factory=set)


@dataclass(slots=True)
class StreamResult:
    paused: bool
    returncode: int
    final_message: str | None


_SESSIONS: dict[str, CodexSessionState] = {}
_LOCK = threading.Lock()


def running_codex_task_count() -> int:
    with _LOCK:
        return sum(1 for state in _SESSIONS.values() if state.thread and state.thread.is_alive())


def has_codex_session(task_id: str) -> bool:
    with _LOCK:
        return task_id in _SESSIONS


def start_codex_task(task_id: str) -> None:
    state = _get_or_create_state(task_id)
    if state.thread and state.thread.is_alive():
        return
    state.stop_event.clear()
    state.approved_commands.clear()
    thread = threading.Thread(target=_run_codex_task, args=(task_id,), daemon=True, name=f"elemate-codex-{task_id}")
    state.thread = thread
    thread.start()


def resume_codex_task(
    task_id: str,
    *,
    approval_id: str,
    approved: bool,
    reason: str | None,
    decided_by: str | None,
) -> None:
    state = _get_or_create_state(task_id)
    if state.thread and state.thread.is_alive():
        return
    state.stop_event.clear()
    thread = threading.Thread(
        target=_run_codex_task,
        kwargs={
            "task_id": task_id,
            "approval_id": approval_id,
            "approved": approved,
            "reason": reason,
            "decided_by": decided_by,
        },
        daemon=True,
        name=f"elemate-codex-resume-{task_id}",
    )
    state.thread = thread
    thread.start()


def cancel_codex_task(task_id: str) -> bool:
    with _LOCK:
        state = _SESSIONS.get(task_id)
    if state is None:
        return False
    state.stop_event.set()
    process = state.process
    if process is not None and process.poll() is None:
        process.terminate()
    return True


def _run_codex_task(
    task_id: str,
    *,
    approval_id: str | None = None,
    approved: bool | None = None,
    reason: str | None = None,
    decided_by: str | None = None,
) -> None:
    db = SessionLocal()
    state = _get_or_create_state(task_id)
    runtime = get_runtime_status()
    trace_id = str(uuid.uuid4())

    try:
        task = _load_task(db, task_id)
        if not runtime.codex_mode_available:
            _fail_task(
                db,
                task,
                trace_id=trace_id,
                message="Codex login is not configured, so ChatGPT runtime is unavailable.",
            )
            return

        if approval_id is None:
            _transition(task, TaskStatus.PLANNING)
            task.final_report = "Task queued for Codex CLI execution."
            append_log_event(
                task.id,
                level="info",
                source="agent",
                message="Starting Codex CLI execution",
                trace_id=trace_id,
                metadata={"provider": "chatgpt_login", "model": runtime.codex_model or "config default"},
            )
            _transition(task, TaskStatus.RUNNING)
            db.commit()
            prompt = _initial_prompt(task, runtime)
            primary_command = _build_exec_command(task, runtime, prompt)
            fallback_command = None
        else:
            approval = db.scalar(select(Approval).where(Approval.id == approval_id, Approval.task_id == task.id))
            if approval is None:
                _fail_task(db, task, trace_id=trace_id, message="Approval context was missing for Codex resume.")
                return
            pending_step = _pending_approval_step(task)
            if not approved:
                approval.status = ApprovalStatus.REJECTED
                approval.rejected_at = datetime.now(UTC)
                approval.decided_by = decided_by or "user"
                approval.reason = reason
                if pending_step is not None:
                    pending_step.status = StepStatus.SKIPPED
                    pending_step.output_data = {
                        **(pending_step.output_data or {}),
                        "summary": "User rejected the guarded Codex command.",
                        "approval_result": "rejected",
                    }
                    pending_step.ended_at = datetime.now(UTC)
                _transition(task, TaskStatus.REJECTED)
                task.final_report = "Execution stopped because the user rejected the guarded Codex action."
                append_log_event(
                    task.id,
                    level="warning",
                    source="approval",
                    message="User rejected the Codex approval request",
                    trace_id=trace_id,
                    metadata={"approval_id": approval.id},
                )
                db.commit()
                _cleanup_session(task.id)
                return

            approval.status = ApprovalStatus.APPROVED
            approval.approved_at = datetime.now(UTC)
            approval.decided_by = decided_by or "user"
            approval.reason = reason
            blocked_command = str(approval.payload.get("blocked_command", "")).strip() if approval.payload else ""
            if blocked_command:
                state.approved_commands = {blocked_command}
            if pending_step is not None:
                pending_step.status = StepStatus.SUCCESS
                pending_step.ended_at = datetime.now(UTC)
                pending_step.duration_ms = _step_duration_ms(pending_step)
                pending_step.output_data = {
                    **(pending_step.output_data or {}),
                    "summary": "User approved the guarded Codex command. Execution resumed.",
                    "approval_result": "approved",
                }
            _transition(task, TaskStatus.RUNNING)
            append_log_event(
                task.id,
                level="info",
                source="approval",
                message="Approval received; resuming Codex execution",
                trace_id=trace_id,
                metadata={"blocked_command": blocked_command, "approval_id": approval.id},
            )
            db.commit()

            prompt = _resume_prompt(task, blocked_command=blocked_command, reason=reason, decided_by=decided_by)
            thread_id = str(approval.payload.get("thread_id", "")).strip() if approval.payload else ""
            primary_command = _build_resume_command(task, runtime, prompt, thread_id=thread_id) if thread_id else _build_exec_command(task, runtime, prompt)
            fallback_command = _build_exec_command(task, runtime, prompt) if thread_id else None

        result = _stream_codex_process(
            db=db,
            task=task,
            runtime=runtime,
            state=state,
            trace_id=trace_id,
            command=primary_command,
        )

        if not result.paused and result.returncode != 0 and fallback_command is not None and not state.stop_event.is_set():
            append_log_event(
                task.id,
                level="warning",
                source="agent",
                message="Codex resume failed, retrying as a fresh run with approval context",
                trace_id=trace_id,
                metadata={"returncode": result.returncode},
            )
            result = _stream_codex_process(
                db=db,
                task=_load_task(db, task.id),
                runtime=runtime,
                state=state,
                trace_id=trace_id,
                command=fallback_command,
            )

        task = _load_task(db, task.id)
        if result.paused:
            _create_timeline_artifact(db, task, label="codex-timeline")
            db.commit()
            return

        if state.stop_event.is_set():
            _cancel_task(db, task, trace_id)
            return

        if result.returncode != 0:
            _fail_task(db, task, trace_id=trace_id, message=f"Codex CLI exited with code {result.returncode}.")
            return

        _transition(task, TaskStatus.COMPLETED)
        task.final_report = (result.final_message or "Codex CLI completed without a final summary.").strip()
        append_log_event(
            task.id,
            level="info",
            source="agent",
            message="Codex CLI execution completed",
            trace_id=trace_id,
            metadata={"provider": "chatgpt_login"},
        )
        _create_timeline_artifact(db, task, label="codex-timeline")
        db.commit()
    except Exception as exc:  # noqa: BLE001
        task = _load_task(db, task_id)
        if task.status not in {TaskStatus.REJECTED, TaskStatus.CANCELED, TaskStatus.COMPLETED}:
            _fail_task(db, task, trace_id=trace_id, message=str(exc))
    finally:
        process = state.process
        if process is not None and process.poll() is None:
            process.terminate()
        state.process = None
        db.close()
        _cleanup_session(task_id)


def _stream_codex_process(
    *,
    db: Session,
    task: Task,
    runtime: RuntimeStatus,
    state: CodexSessionState,
    trace_id: str,
    command: list[str],
) -> StreamResult:
    workspace = task.workspace_path or runtime.workspace_root
    directory = ARTIFACTS_DIR / task.id
    directory.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%S")
    raw_events_path = directory / f"codex-events-{stamp}.jsonl"
    final_message: str | None = None
    step_map: dict[str, str] = {}
    paused = False

    with raw_events_path.open("w", encoding="utf-8") as handle:
        process = subprocess.Popen(
            command,
            cwd=workspace,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        state.process = process

        assert process.stdout is not None
        for line in process.stdout:
            handle.write(line)
            handle.flush()

            if state.stop_event.is_set():
                process.terminate()
                break

            event = _parse_event_line(line)
            if event is None:
                trimmed = line.strip()
                if trimmed:
                    append_log_event(
                        task.id,
                        level="info",
                        source="runtime",
                        message="Codex runtime output",
                        trace_id=trace_id,
                        metadata={"line": trimmed[:1200]},
                    )
                continue

            if event.get("type") == "thread.started":
                thread_id = event.get("thread_id")
                if isinstance(thread_id, str):
                    state.thread_id = thread_id
                append_log_event(
                    task.id,
                    level="info",
                    source="runtime",
                    message="Codex session started",
                    trace_id=trace_id,
                    metadata={"thread_id": state.thread_id},
                )
                continue

            if event.get("type") == "turn.started":
                append_log_event(
                    task.id,
                    level="info",
                    source="runtime",
                    message="Codex turn started",
                    trace_id=trace_id,
                    metadata=None,
                )
                continue

            if event.get("type") == "turn.completed":
                usage = event.get("usage") if isinstance(event.get("usage"), dict) else None
                append_log_event(
                    task.id,
                    level="info",
                    source="runtime",
                    message="Codex turn completed",
                    trace_id=trace_id,
                    metadata=usage,
                )
                continue

            item = event.get("item") if isinstance(event.get("item"), dict) else None
            if not item:
                continue

            item_id = str(item.get("id", ""))
            item_type = str(item.get("type", ""))
            if item_type == "agent_message":
                text = item.get("text")
                if isinstance(text, str) and text.strip():
                    final_message = text.strip()
                    append_log_event(
                        task.id,
                        level="info",
                        source="agent",
                        message=text.strip(),
                        trace_id=trace_id,
                        metadata={"item_id": item_id},
                    )
                continue

            if item_type == "command_execution":
                command_text = str(item.get("command", "")).strip()
                step = _get_or_create_command_step(db, task.id, item_id, command_text, step_map)
                if event.get("type") == "item.started":
                    action = _approval_action_for_preview(command_text)
                    if action is not None and command_text not in state.approved_commands:
                        step.status = StepStatus.PENDING
                        step.requires_approval = True
                        step.output_data = {
                            "summary": "Blocked before command execution pending user approval.",
                            "preview": command_text,
                            "action_type": action.value,
                        }
                        db.commit()
                        approval = Approval(
                            task_id=task.id,
                            action_type=action,
                            payload={
                                "provider": "codex",
                                "action_type": action.value,
                                "preview": command_text,
                                "why_blocked": "This Codex command matches the local approval policy.",
                                "thread_id": state.thread_id,
                                "blocked_command": command_text,
                            },
                            status=ApprovalStatus.PENDING,
                        )
                        db.add(approval)
                        current_task = _load_task(db, task.id)
                        _transition(current_task, TaskStatus.WAITING_APPROVAL)
                        current_task.final_report = f"Paused for approval before `{action.value}`."
                        append_log_event(
                            task.id,
                            level="warning",
                            source="approval",
                            message="Codex execution paused for user approval",
                            trace_id=trace_id,
                            metadata={"action_type": action.value, "preview": command_text, "thread_id": state.thread_id},
                        )
                        db.commit()
                        process.terminate()
                        paused = True
                        break
                    if command_text in state.approved_commands:
                        state.approved_commands.remove(command_text)
                    append_log_event(
                        task.id,
                        level="info",
                        source="tool",
                        message=f"shell.exec::{command_text}",
                        trace_id=trace_id,
                        tool_call_id=item_id or None,
                        metadata={"status": "started"},
                    )
                else:
                    aggregated_output = item.get("aggregated_output")
                    exit_code = item.get("exit_code")
                    step.status = StepStatus.SUCCESS if exit_code == 0 else StepStatus.FAILED
                    step.output_data = {
                        "stdout": aggregated_output[-6000:] if isinstance(aggregated_output, str) else "",
                        "exit_code": exit_code,
                    }
                    step.ended_at = datetime.now(UTC)
                    step.duration_ms = _step_duration_ms(step)
                    db.commit()
                    append_log_event(
                        task.id,
                        level="info" if exit_code == 0 else "warning",
                        source="tool",
                        message=f"shell.exec finished: {command_text}",
                        trace_id=trace_id,
                        tool_call_id=item_id or None,
                        metadata={"exit_code": exit_code},
                    )
                    _create_action_artifact(
                        db,
                        task.id,
                        label=f"Command #{step.position}",
                        file_name=f"command-{step.position:03d}.json",
                        payload={
                            "command": command_text,
                            "exit_code": exit_code,
                            "output": aggregated_output,
                        },
                    )
                continue

            if item_type == "file_change" and event.get("type") == "item.completed":
                changes = item.get("changes") if isinstance(item.get("changes"), list) else []
                step = Step(
                    task_id=task.id,
                    type="file_change",
                    title=_file_change_title(changes),
                    position=_next_step_position(db, task.id),
                    tool_name="file.write",
                    input_data={"changes": changes},
                    output_data={"summary": f"{len(changes)} file change(s) recorded by Codex."},
                    status=StepStatus.SUCCESS,
                    attempt=1,
                    duration_ms=0,
                    requires_approval=False,
                    started_at=datetime.now(UTC),
                    ended_at=datetime.now(UTC),
                )
                db.add(step)
                db.commit()
                append_log_event(
                    task.id,
                    level="info",
                    source="tool",
                    message="file.write applied",
                    trace_id=trace_id,
                    tool_call_id=item_id or None,
                    metadata={"changes": changes},
                )
                _create_action_artifact(
                    db,
                    task.id,
                    label=f"File change #{step.position}",
                    file_name=f"file-change-{step.position:03d}.json",
                    payload={"changes": changes},
                )

        returncode = process.wait()

    _create_action_artifact(
        db,
        task.id,
        label=f"Codex raw events {stamp}",
        file_name=f"codex-events-{stamp}.jsonl",
        payload=None,
        existing_path=raw_events_path,
        mime_type="application/jsonl",
    )
    db.commit()
    return StreamResult(paused=paused, returncode=returncode, final_message=final_message)


def _get_or_create_command_step(
    db: Session,
    task_id: str,
    item_id: str,
    command_text: str,
    step_map: dict[str, str],
) -> Step:
    step_id = step_map.get(item_id)
    if step_id:
        step = db.scalar(select(Step).where(Step.id == step_id))
        if step is not None:
            return step

    step = Step(
        task_id=task_id,
        type="command_execution",
        title=f"Run `{command_text}`",
        position=_next_step_position(db, task_id),
        tool_name="shell.exec",
        input_data={"command": command_text},
        output_data=None,
        status=StepStatus.RUNNING,
        attempt=1,
        duration_ms=None,
        requires_approval=False,
        started_at=datetime.now(UTC),
        ended_at=None,
    )
    db.add(step)
    db.commit()
    step_map[item_id] = step.id
    return step


def _build_exec_command(task: Task, runtime: RuntimeStatus, prompt: str) -> list[str]:
    workspace = task.workspace_path or runtime.workspace_root
    command = [
        "codex",
        "exec",
        "--json",
        "--color",
        "never",
        "--skip-git-repo-check",
        "-c",
        'approval_policy="never"',
        "-c",
        'sandbox_mode="workspace-write"',
    ]
    if runtime.codex_model:
        command.extend(["--model", runtime.codex_model])
    command.extend(["-C", workspace, prompt])
    return command


def _build_resume_command(task: Task, runtime: RuntimeStatus, prompt: str, *, thread_id: str) -> list[str]:
    command = [
        "codex",
        "exec",
        "resume",
        "--json",
        "--color",
        "never",
        "--skip-git-repo-check",
        "-c",
        'approval_policy="never"',
        "-c",
        'sandbox_mode="workspace-write"',
    ]
    if runtime.codex_model:
        command.extend(["--model", runtime.codex_model])
    command.extend([thread_id, prompt])
    return command


def _initial_prompt(task: Task, runtime: RuntimeStatus) -> str:
    workspace = task.workspace_path or runtime.workspace_root
    return (
        "You are EleMate running through Codex CLI.\n\n"
        f"Workspace root: {workspace}\n"
        f"Task title: {task.title}\n"
        f"Task goal: {task.goal}\n\n"
        "Rules:\n"
        "- Work only inside the workspace.\n"
        "- Use web search for latest official documentation when needed.\n"
        "- Never delete files, push to git, deploy, submit external forms after login, send email, or place orders without explicit approval.\n"
        "- If a risky action is needed, explain briefly and stop before executing it.\n"
        "- Prefer minimal changes and concise progress narration.\n"
        "- End with a short final report covering changes, checks, and remaining risks."
    )


def _resume_prompt(task: Task, *, blocked_command: str, reason: str | None, decided_by: str | None) -> str:
    reason_line = f"Decision note: {reason}\n" if reason else ""
    approved_line = f"Approved command: {blocked_command}\n" if blocked_command else ""
    decided_by_line = f"Approved by: {decided_by or 'user'}\n"
    return (
        "Resume the previous EleMate task.\n"
        f"{approved_line}"
        f"{reason_line}"
        f"{decided_by_line}"
        f"Original task: {task.goal}\n"
        "The user approved the blocked command above. Continue from the current workspace state and finish the task."
    )


def _file_change_title(changes: list[dict]) -> str:
    if not changes:
        return "Apply file changes"
    first = changes[0]
    path = first.get("path")
    kind = first.get("kind")
    if isinstance(path, str) and isinstance(kind, str):
        return f"{kind.title()} `{path}`"
    return f"Apply {len(changes)} file change(s)"


def _parse_event_line(line: str) -> dict | None:
    stripped = line.strip()
    if not stripped or not stripped.startswith("{"):
        return None
    try:
        payload = json.loads(stripped)
    except json.JSONDecodeError:
        return None
    return payload if isinstance(payload, dict) else None


def _create_action_artifact(
    db: Session,
    task_id: str,
    *,
    label: str,
    file_name: str,
    payload: dict | None,
    existing_path: Path | None = None,
    mime_type: str = "application/json",
) -> None:
    directory = ARTIFACTS_DIR / task_id
    directory.mkdir(parents=True, exist_ok=True)
    file_path = existing_path or directory / file_name
    if existing_path is None and payload is not None:
        file_path.write_text(json.dumps(payload, ensure_ascii=True, indent=2), encoding="utf-8")
    descriptor = _descriptor(task_id, file_path)
    db.add(
        Artifact(
            task_id=task_id,
            type="action",
            path=descriptor["public_path"],
            metadata_json={"label": label},
            sha256=descriptor["sha256"],
            size=descriptor["size"],
            mime_type=mime_type,
        )
    )


def _load_task(db: Session, task_id: str) -> Task:
    task = db.scalar(select(Task).where(Task.id == task_id).options(*TASK_LOAD_OPTIONS))
    if task is None:
        raise RuntimeError(f"Task not found: {task_id}")
    task.steps.sort(key=lambda item: item.position)
    task.approvals.sort(key=lambda item: item.requested_at, reverse=True)
    task.artifacts.sort(key=lambda item: item.created_at)
    return task


def _next_step_position(db: Session, task_id: str) -> int:
    max_position = db.scalar(select(func.max(Step.position)).where(Step.task_id == task_id)) or 0
    return int(max_position) + 1


def _pending_approval_step(task: Task) -> Step | None:
    for step in task.steps:
        if step.requires_approval and step.status == StepStatus.PENDING:
            return step
    return None


def _step_duration_ms(step: Step) -> int | None:
    if step.started_at is None:
        return None
    if step.started_at.tzinfo is None:
        return int((datetime.utcnow() - step.started_at).total_seconds() * 1000)
    return int((datetime.now(UTC) - step.started_at).total_seconds() * 1000)


def _transition(task: Task, next_status: TaskStatus) -> None:
    allowed = {
        TaskStatus.PENDING: {TaskStatus.PLANNING, TaskStatus.FAILED, TaskStatus.CANCELED},
        TaskStatus.PLANNING: {TaskStatus.RUNNING, TaskStatus.FAILED, TaskStatus.CANCELED},
        TaskStatus.RUNNING: {TaskStatus.WAITING_APPROVAL, TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELED},
        TaskStatus.WAITING_APPROVAL: {TaskStatus.RUNNING, TaskStatus.REJECTED, TaskStatus.CANCELED},
        TaskStatus.COMPLETED: set(),
        TaskStatus.FAILED: set(),
        TaskStatus.REJECTED: set(),
        TaskStatus.CANCELED: set(),
    }
    if task.status == next_status:
        return
    if next_status not in allowed[task.status]:
        raise RuntimeError(f"Invalid task transition {task.status.value} -> {next_status.value}")
    task.status = next_status


def _fail_task(db: Session, task: Task, *, trace_id: str, message: str) -> None:
    if task.status in {TaskStatus.PENDING, TaskStatus.PLANNING, TaskStatus.RUNNING}:
        _transition(task, TaskStatus.FAILED)
    _finalize_open_steps(task, failed=True)
    task.final_report = message
    append_log_event(
        task.id,
        level="error",
        source="agent",
        message="Codex execution failed",
        trace_id=trace_id,
        metadata={"error": message},
    )
    db.commit()
    _cleanup_session(task.id)


def _cancel_task(db: Session, task: Task, trace_id: str) -> None:
    if task.status in {TaskStatus.COMPLETED, TaskStatus.REJECTED, TaskStatus.FAILED}:
        return
    _transition(task, TaskStatus.CANCELED)
    _finalize_open_steps(task, failed=False)
    task.final_report = "Task canceled by the user."
    append_log_event(
        task.id,
        level="warning",
        source="agent",
        message="Task canceled",
        trace_id=trace_id,
        metadata=None,
    )
    db.commit()
    _cleanup_session(task.id)


def _create_timeline_artifact(db: Session, task: Task, *, label: str) -> None:
    directory = ARTIFACTS_DIR / task.id
    directory.mkdir(parents=True, exist_ok=True)
    file_path = directory / f"{label}.json"
    payload = {
        "task_id": task.id,
        "status": task.status.value,
        "steps": [
            {
                "position": step.position,
                "title": step.title,
                "tool_name": step.tool_name,
                "status": step.status.value,
            }
            for step in task.steps
        ],
    }
    file_path.write_text(json.dumps(payload, ensure_ascii=True, indent=2), encoding="utf-8")
    descriptor = _descriptor(task.id, file_path)
    existing = db.scalar(
        select(Artifact).where(Artifact.task_id == task.id, Artifact.type == "timeline", Artifact.path == descriptor["public_path"])
    )
    if existing is None:
        db.add(
            Artifact(
                task_id=task.id,
                type="timeline",
                path=descriptor["public_path"],
                metadata_json={"label": "Execution timeline"},
                sha256=descriptor["sha256"],
                size=descriptor["size"],
                mime_type="application/json",
            )
        )


def _descriptor(task_id: str, file_path: Path) -> dict[str, str | int]:
    raw = file_path.read_bytes()
    return {
        "public_path": f"{PUBLIC_ARTIFACT_PREFIX}/{task_id}/{file_path.name}",
        "sha256": __import__("hashlib").sha256(raw).hexdigest(),
        "size": file_path.stat().st_size,
    }


def _approval_action_for_preview(preview: str) -> ApprovalActionType | None:
    lowered = preview.lower()
    for action, patterns in APPROVAL_REQUIRED_PATTERNS:
        if any(pattern in lowered for pattern in patterns):
            return action
    return None


def _finalize_open_steps(task: Task, *, failed: bool) -> None:
    for step in task.steps:
        if step.status == StepStatus.RUNNING:
            step.status = StepStatus.FAILED if failed else StepStatus.SKIPPED
            step.ended_at = datetime.now(UTC)
            step.duration_ms = _step_duration_ms(step)
            if step.output_data is None:
                step.output_data = {}
            step.output_data = {
                **step.output_data,
                "summary": "Step closed because the task terminated early.",
            }


def _get_or_create_state(task_id: str) -> CodexSessionState:
    with _LOCK:
        state = _SESSIONS.get(task_id)
        if state is None:
            state = CodexSessionState(task_id=task_id)
            _SESSIONS[task_id] = state
        return state


def _cleanup_session(task_id: str) -> None:
    with _LOCK:
        _SESSIONS.pop(task_id, None)
