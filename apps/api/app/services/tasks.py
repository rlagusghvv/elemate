from __future__ import annotations

import hashlib
import html
import json
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..execution import cancel_task_runtime, get_runtime_status, has_task_session, resume_task_execution, running_task_count, start_task_execution
from ..logs import append_log_event, read_log_events, reset_log_events
from ..models import (
    Approval,
    ApprovalActionType,
    ApprovalStatus,
    Artifact,
    RiskLevel,
    Step,
    StepStatus,
    Task,
    TaskStatus,
)
from ..schemas import ApprovalDecision, CapabilityOut, TaskCreate, TaskListItemOut, TaskLogsOut, TaskReplayOut
from ..settings import ARTIFACTS_DIR, PUBLIC_ARTIFACT_PREFIX

TASK_LOAD_OPTIONS = (
    selectinload(Task.steps),
    selectinload(Task.approvals),
    selectinload(Task.artifacts),
)

ALLOWED_TRANSITIONS: dict[TaskStatus, set[TaskStatus]] = {
    TaskStatus.PENDING: {TaskStatus.PLANNING, TaskStatus.CANCELED},
    TaskStatus.PLANNING: {TaskStatus.RUNNING, TaskStatus.FAILED, TaskStatus.CANCELED},
    TaskStatus.RUNNING: {
        TaskStatus.WAITING_APPROVAL,
        TaskStatus.COMPLETED,
        TaskStatus.FAILED,
        TaskStatus.CANCELED,
    },
    TaskStatus.WAITING_APPROVAL: {TaskStatus.RUNNING, TaskStatus.REJECTED, TaskStatus.CANCELED},
    TaskStatus.COMPLETED: set(),
    TaskStatus.FAILED: set(),
    TaskStatus.REJECTED: set(),
    TaskStatus.CANCELED: set(),
}

APPROVAL_KEYWORDS: tuple[tuple[ApprovalActionType, tuple[str, ...]], ...] = (
    (ApprovalActionType.EMAIL_SEND, ("email", "send mail", "mail", "이메일", "메일", "전송")),
    (ApprovalActionType.FILE_DELETE, ("delete", "remove", "rm ", "파일 삭제", "삭제")),
    (ApprovalActionType.GIT_PUSH, ("git push", "push to remote", "원격 반영", "푸시")),
    (ApprovalActionType.DEPLOY, ("deploy", "production", "배포", "릴리즈")),
    (ApprovalActionType.EXTERNAL_SUBMIT, ("submit", "form", "login and submit", "제출", "로그인 후 제출")),
    (ApprovalActionType.PAYMENT, ("payment", "checkout", "order", "buy", "결제", "주문")),
)

BASE_CAPABILITY_TOOLS = [
    {
        "name": "file.read",
        "description": "Inspect source trees, config files, and generated diffs inside the workspace.",
        "requires_approval": False,
        "category": "workspace",
    },
    {
        "name": "file.write",
        "description": "Apply patches and draft local file changes before any remote side effects.",
        "requires_approval": False,
        "category": "workspace",
    },
    {
        "name": "shell.exec",
        "description": "Run tests, linters, and local build commands in the sandbox.",
        "requires_approval": False,
        "category": "execution",
    },
    {
        "name": "web.search",
        "description": "Collect official documentation and current references from the web.",
        "requires_approval": False,
        "category": "research",
    },
]

LIVE_CAPABILITY_TOOLS = [
    {
        "name": "browser.extract",
        "description": "Read live pages and summarize the exact instructions or selectors needed.",
        "requires_approval": False,
        "category": "research",
    },
    {
        "name": "computer_use",
        "description": "Open desktop sessions, click, type, and scroll with replayable action logs.",
        "requires_approval": True,
        "category": "desktop",
    },
    {
        "name": "approval.request",
        "description": "Stop before risky actions and wait for an explicit user decision.",
        "requires_approval": True,
        "category": "governance",
    },
]


@dataclass(slots=True)
class StepBlueprint:
    type: str
    title: str
    tool_name: str
    input_data: dict
    output_data: dict
    status: StepStatus = StepStatus.SUCCESS
    requires_approval: bool = False
    duration_ms: int = 4000


def build_capabilities() -> CapabilityOut:
    runtime = get_runtime_status()
    tools = list(BASE_CAPABILITY_TOOLS)
    if runtime.selected_mode in {"live", "demo"}:
        tools.extend(LIVE_CAPABILITY_TOOLS)
    else:
        tools.append(LIVE_CAPABILITY_TOOLS[-1])
    return CapabilityOut(
        planner_model=runtime.model,
        coder_model="codex",
        worker_model="gpt-5-mini",
        sandbox="codex CLI workspace sandbox" if runtime.selected_mode == "codex" else "local workspace + desktop control gateway",
        desktop_control=runtime.selected_mode in {"live", "demo"},
        selected_mode=runtime.selected_mode,
        preferred_mode=runtime.preferred_mode,
        available_modes=runtime.available_modes,
        auth_provider=runtime.auth_provider,
        live_mode_available=runtime.live_mode_available,
        codex_mode_available=runtime.codex_mode_available,
        demo_mode_available=runtime.demo_mode_available,
        codex_cli_available=runtime.codex_cli_available,
        codex_login_configured=runtime.codex_login_configured,
        openai_api_key_configured=runtime.openai_api_key_configured,
        auth_account_email=runtime.auth_account_email,
        auth_account_id=runtime.auth_account_id,
        auth_plan_type=runtime.auth_plan_type,
        auth_last_refresh=runtime.auth_last_refresh,
        auth_login_command=runtime.auth_login_command,
        auth_logout_command=runtime.auth_logout_command,
        browser_available=runtime.browser_available,
        browser_channel=runtime.browser_channel,
        runtime_reason=runtime.reason,
        running_tasks=running_task_count(),
        tools=tools,
        approval_actions=[action.value for action, _ in APPROVAL_KEYWORDS],
    )


def list_tasks_with_counts(db: Session, limit: int = 20) -> list[TaskListItemOut]:
    tasks = db.scalars(
        select(Task)
        .order_by(Task.updated_at.desc(), Task.created_at.desc())
        .limit(limit)
        .options(*TASK_LOAD_OPTIONS)
    ).all()
    return [_task_to_list_item(task) for task in tasks]


def get_task_detail(db: Session, task_id: str) -> Task:
    task = db.scalar(select(Task).where(Task.id == task_id).options(*TASK_LOAD_OPTIONS))
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    task.steps.sort(key=lambda item: item.position)
    task.approvals.sort(key=lambda item: item.requested_at, reverse=True)
    task.artifacts.sort(key=lambda item: item.created_at)
    return task


def create_task_submission(db: Session, payload: TaskCreate) -> Task:
    runtime = get_runtime_status()
    if runtime.selected_mode == "demo":
        return create_task_with_plan(db, payload)
    if runtime.selected_mode == "disabled":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=runtime.reason)

    trace_id = str(uuid.uuid4())
    task = Task(
        title=payload.title,
        goal=payload.goal,
        risk_level=payload.risk_level,
        workspace_path=payload.workspace_path,
        requested_by=payload.requested_by,
        model_profile=payload.model_profile or ("codex-chatgpt-login" if runtime.selected_mode == "codex" else runtime.model),
        status=TaskStatus.PENDING,
        final_report=f"Task queued for {runtime.selected_mode} execution.",
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    reset_log_events(task.id)
    append_log_event(
        task.id,
        level="info",
        source="orchestrator",
        message=f"Task queued for {runtime.selected_mode} execution",
        trace_id=trace_id,
        metadata={"mode": runtime.selected_mode, "model": runtime.model, "auth_provider": runtime.auth_provider},
    )
    start_task_execution(task.id, mode=runtime.selected_mode)
    return get_task_detail(db, task.id)


def create_task_with_plan(db: Session, payload: TaskCreate) -> Task:
    trace_id = str(uuid.uuid4())
    task = Task(
        title=payload.title,
        goal=payload.goal,
        risk_level=payload.risk_level,
        workspace_path=payload.workspace_path,
        requested_by=payload.requested_by,
        model_profile=payload.model_profile or "openclaw-mvp",
        status=TaskStatus.PENDING,
    )
    db.add(task)
    db.flush()

    reset_log_events(task.id)
    append_log_event(
        task.id,
        level="info",
        source="orchestrator",
        message="Task accepted",
        trace_id=trace_id,
        metadata={"title": task.title, "workspace_path": task.workspace_path},
    )

    _transition_task(task, TaskStatus.PLANNING)
    append_log_event(
        task.id,
        level="info",
        source="planner",
        message="Generating execution plan",
        trace_id=trace_id,
        metadata={"goal": task.goal},
    )

    approval_action = _detect_approval_action(task.goal)
    task.risk_level = _elevate_risk(task.risk_level, approval_action)

    blueprints = _build_blueprints(task, approval_action)
    _transition_task(task, TaskStatus.RUNNING)

    base_time = datetime.now(UTC)
    pending_step: Step | None = None
    for index, blueprint in enumerate(blueprints, start=1):
        started_at = base_time + timedelta(seconds=(index - 1) * 8) if blueprint.status != StepStatus.PENDING else None
        ended_at = (
            started_at + timedelta(milliseconds=blueprint.duration_ms)
            if started_at is not None and blueprint.status == StepStatus.SUCCESS
            else None
        )
        step = Step(
            task_id=task.id,
            type=blueprint.type,
            title=blueprint.title,
            position=index,
            tool_name=blueprint.tool_name,
            input_data=blueprint.input_data,
            output_data=blueprint.output_data,
            status=blueprint.status,
            attempt=1,
            duration_ms=blueprint.duration_ms if blueprint.status == StepStatus.SUCCESS else None,
            requires_approval=blueprint.requires_approval,
            started_at=started_at,
            ended_at=ended_at,
        )
        db.add(step)
        if blueprint.status == StepStatus.PENDING:
            pending_step = step
        append_log_event(
            task.id,
            level="info" if blueprint.status == StepStatus.SUCCESS else "warning",
            source="tool",
            message=f"{blueprint.tool_name}::{blueprint.title}",
            trace_id=trace_id,
            tool_call_id=f"{task.id}:{index}",
            metadata={
                "step_type": blueprint.type,
                "status": blueprint.status.value,
                "input": blueprint.input_data,
                "output": blueprint.output_data,
            },
        )

    _create_replay_artifacts(db, task, blueprints, trace_id, approval_action)

    if approval_action and pending_step is not None:
        approval = Approval(
            task_id=task.id,
            action_type=approval_action,
            payload=_build_approval_payload(task, approval_action),
            status=ApprovalStatus.PENDING,
        )
        db.add(approval)
        _transition_task(task, TaskStatus.WAITING_APPROVAL)
        task.final_report = _awaiting_approval_report(task, approval_action)
        append_log_event(
            task.id,
            level="warning",
            source="approval",
            message="Risky action paused for approval",
            trace_id=trace_id,
            metadata=approval.payload,
        )
    else:
        completion_step = _build_completion_step(task, len(blueprints) + 1, trace_id)
        db.add(completion_step)
        _transition_task(task, TaskStatus.COMPLETED)
        task.final_report = _completed_report(task)
        append_log_event(
            task.id,
            level="info",
            source="runner",
            message="Task completed in demo execution mode",
            trace_id=trace_id,
            metadata={"step_count": len(blueprints) + 1},
        )

    db.commit()
    return get_task_detail(db, task.id)


def handle_approval_decision(
    db: Session,
    task_id: str,
    decision: ApprovalDecision,
    *,
    approve: bool,
) -> Approval:
    task = get_task_detail(db, task_id)
    approval = _get_pending_approval(task)
    provider = str(approval.payload.get("provider")) if approval.payload and approval.payload.get("provider") else None
    if provider in {"live", "codex"} or (approval.payload and approval.payload.get("response_id") and approval.payload.get("call_id")):
        resume_task_execution(
            task_id,
            provider=provider or "live",
            approval_id=approval.id,
            approved=approve,
            reason=decision.reason,
            decided_by=decision.decided_by,
        )
        db.refresh(approval)
        return approval

    if task.status != TaskStatus.WAITING_APPROVAL:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Task is not waiting for approval")

    trace_id = str(uuid.uuid4())
    pending_step = _get_pending_approval_step(task)
    if pending_step is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="No pending approval step for this task")

    if approve:
        approval.status = ApprovalStatus.APPROVED
        approval.approved_at = datetime.now(UTC)
        approval.decided_by = decision.decided_by or "user"
        approval.reason = decision.reason

        _transition_task(task, TaskStatus.RUNNING)
        started_at = datetime.now(UTC)
        pending_step.status = StepStatus.SUCCESS
        pending_step.started_at = started_at
        pending_step.ended_at = started_at + timedelta(milliseconds=3500)
        pending_step.duration_ms = 3500
        pending_step.output_data = {
            **(pending_step.output_data or {}),
            "summary": "Guarded desktop action executed after approval.",
            "approval_result": "approved",
        }

        completion_step = _build_completion_step(task, len(task.steps) + 1, trace_id)
        db.add(completion_step)
        _append_post_approval_artifacts(db, task, trace_id)
        _transition_task(task, TaskStatus.COMPLETED)
        task.final_report = _approved_report(task, approval.action_type)

        append_log_event(
            task.id,
            level="info",
            source="approval",
            message="Approval received and execution resumed",
            trace_id=trace_id,
            metadata={"action_type": approval.action_type.value, "decided_by": approval.decided_by},
        )
        append_log_event(
            task.id,
            level="info",
            source="desktop",
            message="computer_use executed guarded action",
            trace_id=trace_id,
            tool_call_id=f"{task.id}:approval",
            metadata={"action": "desktop.confirm", "result": "submitted"},
        )
    else:
        approval.status = ApprovalStatus.REJECTED
        approval.rejected_at = datetime.now(UTC)
        approval.decided_by = decision.decided_by or "user"
        approval.reason = decision.reason
        pending_step.status = StepStatus.SKIPPED
        pending_step.output_data = {
            **(pending_step.output_data or {}),
            "summary": "Guarded action was skipped after rejection.",
            "approval_result": "rejected",
        }
        _transition_task(task, TaskStatus.REJECTED)
        task.final_report = _rejected_report(task, approval.action_type)
        append_log_event(
            task.id,
            level="warning",
            source="approval",
            message="Approval rejected, execution stopped",
            trace_id=trace_id,
            metadata={"action_type": approval.action_type.value, "decided_by": approval.decided_by},
        )

    db.commit()
    db.refresh(approval)
    return approval


def cancel_task_execution(db: Session, task_id: str) -> Task:
    task = get_task_detail(db, task_id)
    if task.status in {TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.REJECTED, TaskStatus.CANCELED}:
        return task
    if task.status == TaskStatus.WAITING_APPROVAL:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Use approve/reject while the task is waiting for approval")
    if not has_task_session(task_id):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Task is not running in an active executor")
    cancel_task_runtime(task_id)
    return get_task_detail(db, task_id)


def get_task_logs_payload(db: Session, task_id: str) -> TaskLogsOut:
    task = get_task_detail(db, task_id)
    events = read_log_events(task_id)
    return TaskLogsOut(
        task_id=task.id,
        status=task.status,
        steps=task.steps,
        events=events,
    )


def get_task_replay_payload(db: Session, task_id: str) -> TaskReplayOut:
    task = get_task_detail(db, task_id)
    replay_artifact_types = {"screenshot", "action", "timeline"}
    artifacts = [
        artifact
        for artifact in sorted(task.artifacts, key=lambda item: item.created_at)
        if artifact.type in replay_artifact_types
    ]
    return TaskReplayOut(task_id=task.id, status=task.status, artifacts=artifacts)


def _task_to_list_item(task: Task) -> TaskListItemOut:
    return TaskListItemOut(
        id=task.id,
        title=task.title,
        goal=task.goal,
        status=task.status,
        risk_level=task.risk_level,
        workspace_path=task.workspace_path,
        requested_by=task.requested_by,
        model_profile=task.model_profile,
        final_report=task.final_report,
        created_at=task.created_at,
        updated_at=task.updated_at,
        step_count=len(task.steps),
        approval_count=len(task.approvals),
        pending_approval_count=sum(1 for approval in task.approvals if approval.status == ApprovalStatus.PENDING),
        artifact_count=len(task.artifacts),
    )


def _transition_task(task: Task, next_status: TaskStatus) -> None:
    if task.status == next_status:
        return
    allowed = ALLOWED_TRANSITIONS[task.status]
    if next_status not in allowed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Invalid task transition: {task.status.value} -> {next_status.value}",
        )
    task.status = next_status


def _detect_approval_action(goal: str) -> ApprovalActionType | None:
    lowered = goal.lower()
    for action, keywords in APPROVAL_KEYWORDS:
        if any(keyword in lowered for keyword in keywords):
            return action
    return None


def _elevate_risk(current: RiskLevel, approval_action: ApprovalActionType | None) -> RiskLevel:
    if approval_action is None:
        return current
    risk_rank = {
        RiskLevel.LOW: 0,
        RiskLevel.MEDIUM: 1,
        RiskLevel.HIGH: 2,
        RiskLevel.CRITICAL: 3,
    }
    action_risk = {
        ApprovalActionType.EMAIL_SEND: RiskLevel.HIGH,
        ApprovalActionType.FILE_DELETE: RiskLevel.HIGH,
        ApprovalActionType.GIT_PUSH: RiskLevel.HIGH,
        ApprovalActionType.DEPLOY: RiskLevel.CRITICAL,
        ApprovalActionType.EXTERNAL_SUBMIT: RiskLevel.HIGH,
        ApprovalActionType.PAYMENT: RiskLevel.CRITICAL,
    }[approval_action]
    return action_risk if risk_rank[action_risk] > risk_rank[current] else current


def _build_blueprints(task: Task, approval_action: ApprovalActionType | None) -> list[StepBlueprint]:
    lowered = task.goal.lower()
    wants_docs = any(keyword in lowered for keyword in ("latest", "docs", "documentation", "official", "최신", "문서"))
    wants_browser = any(
        keyword in lowered
        for keyword in ("browser", "site", "website", "page", "click", "scroll", "type", "브라우저", "사이트", "클릭", "입력")
    )
    wants_code = any(
        keyword in lowered
        for keyword in ("code", "repo", "project", "fix", "feature", "login", "api", "코드", "프로젝트", "로그인", "수정")
    )
    workspace = task.workspace_path or "/workspace"

    blueprints = [
        StepBlueprint(
            type="goal_analysis",
            title="Break down the user goal",
            tool_name="planner",
            input_data={"goal": task.goal, "risk_level": task.risk_level.value},
            output_data={
                "summary": "Mapped the request into a safe execution plan with explicit approval gates.",
                "planner": "gpt-5",
            },
            duration_ms=2200,
        ),
        StepBlueprint(
            type="workspace_scan",
            title="Inspect the local workspace",
            tool_name="file.read",
            input_data={"workspace_path": workspace},
            output_data={
                "summary": "Enumerated candidate files, config boundaries, and likely integration points.",
                "workspace_path": workspace,
            },
            duration_ms=2800,
        ),
    ]

    if wants_docs:
        blueprints.append(
            StepBlueprint(
                type="doc_research",
                title="Collect current reference material",
                tool_name="web.search",
                input_data={"query": task.goal},
                output_data={
                    "summary": "Pulled the latest official documentation and condensed the update path.",
                    "sources": ["official docs", "release notes"],
                },
                duration_ms=3600,
            )
        )

    if wants_browser or approval_action is not None:
        blueprints.append(
            StepBlueprint(
                type="desktop_navigation",
                title="Open the desktop/browser session",
                tool_name="computer_use",
                input_data={"mode": "desktop", "target": "browser"},
                output_data={
                    "summary": "Prepared a replayable desktop session with click and scroll traces.",
                    "session_mode": "desktop-control",
                },
                duration_ms=4100,
            )
        )

    if wants_code or not wants_browser:
        blueprints.append(
            StepBlueprint(
                type="code_patch",
                title="Draft the local code changes",
                tool_name="file.write",
                input_data={"workspace_path": workspace, "goal": task.goal},
                output_data={
                    "summary": "Prepared the local patch set and aligned it to the request scope.",
                    "changed_files": ["apps/api", "apps/web"],
                },
                duration_ms=4500,
            )
        )
        blueprints.append(
            StepBlueprint(
                type="verification",
                title="Run sandbox verification",
                tool_name="shell.exec",
                input_data={"command": "test / lint / smoke"},
                output_data={
                    "summary": "Executed non-destructive validation commands inside the sandbox.",
                    "commands": ["python -m compileall", "npm build (planned)"],
                },
                duration_ms=3200,
            )
        )

    if approval_action is not None:
        blueprints.append(
            StepBlueprint(
                type="approval_gate",
                title="Pause before the guarded action",
                tool_name="approval.request",
                input_data={"action_type": approval_action.value},
                output_data={
                    "summary": "Prepared the final risky step and paused before execution.",
                    "action_type": approval_action.value,
                },
                status=StepStatus.PENDING,
                requires_approval=True,
                duration_ms=0,
            )
        )

    return blueprints


def _build_completion_step(task: Task, position: int, trace_id: str) -> Step:
    append_log_event(
        task.id,
        level="info",
        source="reporter",
        message="Generated final task report",
        trace_id=trace_id,
        metadata={"position": position},
    )
    now = datetime.now(UTC)
    return Step(
        task_id=task.id,
        type="final_report",
        title="Publish the final report",
        position=position,
        tool_name="reporter",
        input_data={"task_id": task.id},
        output_data={"summary": "Compiled the plan, execution log, and next-step recommendation."},
        status=StepStatus.SUCCESS,
        attempt=1,
        duration_ms=1800,
        requires_approval=False,
        started_at=now,
        ended_at=now + timedelta(milliseconds=1800),
    )


def _create_replay_artifacts(
    db: Session,
    task: Task,
    blueprints: list[StepBlueprint],
    trace_id: str,
    approval_action: ApprovalActionType | None,
) -> None:
    timeline_payload = {
        "task_id": task.id,
        "trace_id": trace_id,
        "status": "WAITING_APPROVAL" if approval_action is not None else "COMPLETED",
        "events": [
            {
                "position": index,
                "title": blueprint.title,
                "tool": blueprint.tool_name,
                "status": blueprint.status.value,
            }
            for index, blueprint in enumerate(blueprints, start=1)
        ],
    }
    timeline = _write_json_artifact(task.id, "timeline.json", timeline_payload)
    db.add(
        Artifact(
            task_id=task.id,
            type="timeline",
            path=timeline["public_path"],
            metadata_json={"label": "Execution timeline", "kind": "timeline"},
            sha256=timeline["sha256"],
            size=timeline["size"],
            mime_type="application/json",
        )
    )

    action_index = 1
    for blueprint in blueprints:
        if blueprint.tool_name not in {"computer_use", "web.search", "browser.extract", "shell.exec"}:
            continue
        payload = {
            "trace_id": trace_id,
            "tool": blueprint.tool_name,
            "title": blueprint.title,
            "input": blueprint.input_data,
            "output": blueprint.output_data,
        }
        artifact_file = _write_json_artifact(task.id, f"action-{action_index:02d}.json", payload)
        db.add(
            Artifact(
                task_id=task.id,
                type="action",
                path=artifact_file["public_path"],
                metadata_json={
                    "label": blueprint.title,
                    "tool_name": blueprint.tool_name,
                    "kind": "desktop-action" if blueprint.tool_name == "computer_use" else "tool-action",
                },
                sha256=artifact_file["sha256"],
                size=artifact_file["size"],
                mime_type="application/json",
            )
        )
        action_index += 1

    screenshot = _write_svg_artifact(
        task.id,
        "desktop-01.svg",
        "Desktop control session",
        "Browser opened with replayable click, scroll, and type actions.",
        [
            "Target: local operator workflow",
            f"Risk gate: {approval_action.value if approval_action else 'not required'}",
            f"Workspace: {task.workspace_path or '/workspace'}",
        ],
    )
    db.add(
        Artifact(
            task_id=task.id,
            type="screenshot",
            path=screenshot["public_path"],
            metadata_json={
                "label": "Desktop session snapshot",
                "focus": "browser",
                "viewport": "1440x900",
                "cursor": {"x": 918, "y": 522},
            },
            sha256=screenshot["sha256"],
            size=screenshot["size"],
            mime_type="image/svg+xml",
        )
    )


def _append_post_approval_artifacts(db: Session, task: Task, trace_id: str) -> None:
    payload = {
        "trace_id": trace_id,
        "tool": "computer_use",
        "title": "Approved desktop confirmation",
        "result": "submitted",
    }
    artifact_file = _write_json_artifact(task.id, "action-approved.json", payload)
    db.add(
        Artifact(
            task_id=task.id,
            type="action",
            path=artifact_file["public_path"],
            metadata_json={
                "label": "Approved desktop confirmation",
                "tool_name": "computer_use",
                "kind": "desktop-action",
            },
            sha256=artifact_file["sha256"],
            size=artifact_file["size"],
            mime_type="application/json",
        )
    )

    screenshot = _write_svg_artifact(
        task.id,
        "desktop-approved.svg",
        "Guarded action executed",
        "User approval received. The desktop runner completed the final step.",
        [
            "Action: confirm / submit",
            "Result: completed",
            "Replay: available in timeline",
        ],
    )
    db.add(
        Artifact(
            task_id=task.id,
            type="screenshot",
            path=screenshot["public_path"],
            metadata_json={
                "label": "Post-approval snapshot",
                "focus": "confirmation",
                "viewport": "1440x900",
                "cursor": {"x": 1022, "y": 588},
            },
            sha256=screenshot["sha256"],
            size=screenshot["size"],
            mime_type="image/svg+xml",
        )
    )


def _write_json_artifact(task_id: str, filename: str, payload: dict) -> dict[str, str | int]:
    directory = ARTIFACTS_DIR / task_id
    directory.mkdir(parents=True, exist_ok=True)
    file_path = directory / filename
    content = json.dumps(payload, ensure_ascii=True, indent=2)
    file_path.write_text(content, encoding="utf-8")
    return _artifact_descriptor(task_id, file_path)


def _write_svg_artifact(task_id: str, filename: str, title: str, subtitle: str, lines: list[str]) -> dict[str, str | int]:
    directory = ARTIFACTS_DIR / task_id
    directory.mkdir(parents=True, exist_ok=True)
    file_path = directory / filename
    line_markup = "".join(
        f'<text x="72" y="{280 + (index * 44)}" font-size="20" fill="#d7efe7">{html.escape(line)}</text>'
        for index, line in enumerate(lines)
    )
    svg = f"""
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 900">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#08131b" />
      <stop offset="100%" stop-color="#17303d" />
    </linearGradient>
  </defs>
  <rect width="1440" height="900" fill="url(#bg)" rx="32" />
  <rect x="56" y="56" width="1328" height="788" rx="28" fill="#f6f2e8" opacity="0.09" stroke="#90f0c3" />
  <circle cx="132" cy="112" r="10" fill="#34d399" />
  <circle cx="166" cy="112" r="10" fill="#f59e0b" />
  <circle cx="200" cy="112" r="10" fill="#ef4444" />
  <text x="72" y="180" font-size="52" font-family="monospace" fill="#ffffff">{html.escape(title)}</text>
  <text x="72" y="226" font-size="24" font-family="monospace" fill="#b7d6cc">{html.escape(subtitle)}</text>
  {line_markup}
  <rect x="1044" y="232" width="236" height="432" rx="28" fill="#10212b" stroke="#5ee8aa" />
  <text x="1084" y="300" font-size="20" font-family="monospace" fill="#5ee8aa">desktop replay</text>
  <text x="1084" y="354" font-size="18" font-family="monospace" fill="#c5ded5">click trace</text>
  <text x="1084" y="394" font-size="18" font-family="monospace" fill="#c5ded5">typed input</text>
  <text x="1084" y="434" font-size="18" font-family="monospace" fill="#c5ded5">scroll delta</text>
  <circle cx="1180" cy="566" r="18" fill="#34d399" />
  <circle cx="1218" cy="566" r="10" fill="#ffffff" />
</svg>
""".strip()
    file_path.write_text(svg, encoding="utf-8")
    return _artifact_descriptor(task_id, file_path)


def _artifact_descriptor(task_id: str, file_path: Path) -> dict[str, str | int]:
    raw = file_path.read_bytes()
    sha256 = hashlib.sha256(raw).hexdigest()
    public_path = f"{PUBLIC_ARTIFACT_PREFIX}/{task_id}/{file_path.name}"
    return {
        "public_path": public_path,
        "sha256": sha256,
        "size": file_path.stat().st_size,
    }


def _build_approval_payload(task: Task, action: ApprovalActionType) -> dict:
    preview_map = {
        ApprovalActionType.EMAIL_SEND: "Send the prepared email draft to the selected recipients.",
        ApprovalActionType.FILE_DELETE: "Delete the selected file set after backup verification.",
        ApprovalActionType.GIT_PUSH: "git push origin codex/elemate-mvp",
        ApprovalActionType.DEPLOY: "Deploy the prepared build to the production target.",
        ApprovalActionType.EXTERNAL_SUBMIT: "Submit the prepared browser form after desktop review.",
        ApprovalActionType.PAYMENT: "Confirm checkout with the staged payment details.",
    }
    return {
        "task_title": task.title,
        "action_type": action.value,
        "risk_level": task.risk_level.value,
        "preview": preview_map[action],
        "why_blocked": "This action crosses the approval policy boundary and may affect remote systems.",
    }


def _get_pending_approval(task: Task) -> Approval:
    for approval in sorted(task.approvals, key=lambda item: item.requested_at, reverse=True):
        if approval.status == ApprovalStatus.PENDING:
            return approval
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No pending approval for this task")


def _get_pending_approval_step(task: Task) -> Step | None:
    for step in sorted(task.steps, key=lambda item: item.position):
        if step.requires_approval and step.status == StepStatus.PENDING:
            return step
    return None


def _awaiting_approval_report(task: Task, action: ApprovalActionType) -> str:
    return (
        "Prepared the safe portion of the run, captured desktop replay artifacts, and paused before "
        f"the guarded action `{action.value}`. Approve to let the agent continue."
    )


def _completed_report(task: Task) -> str:
    return (
        "Completed the demo execution path: plan, workspace inspection, research, local edits, "
        "verification, and final reporting. Replay artifacts are available for the desktop session."
    )


def _approved_report(task: Task, action: ApprovalActionType) -> str:
    return (
        "Approval received and the guarded action "
        f"`{action.value}` was executed. Final report, replay artifacts, and audit logs are ready."
    )


def _rejected_report(task: Task, action: ApprovalActionType) -> str:
    return (
        "Execution stopped at the approval gate. The guarded action "
        f"`{action.value}` was not executed and the safe preparation steps remain logged."
    )
