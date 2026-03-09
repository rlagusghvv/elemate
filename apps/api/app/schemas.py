from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from .models import ApprovalActionType, ApprovalStatus, RiskLevel, StepStatus, TaskStatus


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    goal: str = Field(min_length=1)
    risk_level: RiskLevel = RiskLevel.MEDIUM
    workspace_path: str | None = None
    requested_by: str | None = None
    model_profile: str | None = None


class TaskOut(BaseModel):
    id: str
    title: str
    goal: str
    status: TaskStatus
    risk_level: RiskLevel
    workspace_path: str | None
    requested_by: str | None
    model_profile: str | None
    final_report: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TaskListItemOut(TaskOut):
    step_count: int
    approval_count: int
    pending_approval_count: int
    artifact_count: int


class StepOut(BaseModel):
    id: str
    task_id: str
    type: str
    title: str
    position: int
    tool_name: str | None
    input: dict | None = Field(default=None, validation_alias="input_data")
    output: dict | None = Field(default=None, validation_alias="output_data")
    status: StepStatus
    attempt: int
    duration_ms: int | None
    error_code: str | None
    requires_approval: bool
    started_at: datetime | None
    ended_at: datetime | None

    model_config = {"from_attributes": True}


class ApprovalOut(BaseModel):
    id: str
    task_id: str
    action_type: ApprovalActionType
    payload: dict | None
    status: ApprovalStatus
    requested_at: datetime
    approved_at: datetime | None
    rejected_at: datetime | None
    decided_by: str | None
    reason: str | None

    model_config = {"from_attributes": True}


class ArtifactOut(BaseModel):
    id: str
    task_id: str
    type: str
    path: str
    metadata: dict | None = Field(default=None, validation_alias="metadata_json")
    sha256: str | None
    size: int | None
    mime_type: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class TaskDetailOut(TaskOut):
    steps: list[StepOut]
    approvals: list[ApprovalOut]
    artifacts: list[ArtifactOut]


class ApprovalDecision(BaseModel):
    decided_by: str | None = None
    reason: str | None = None


class LogEventOut(BaseModel):
    id: str
    timestamp: datetime
    level: str
    source: str
    message: str
    trace_id: str
    tool_call_id: str | None = None
    metadata: dict | None = None


class TaskLogsOut(BaseModel):
    task_id: str
    status: TaskStatus
    steps: list[StepOut]
    events: list[LogEventOut]


class TaskReplayOut(BaseModel):
    task_id: str
    status: TaskStatus
    artifacts: list[ArtifactOut]


class ToolCapabilityOut(BaseModel):
    name: str
    description: str
    requires_approval: bool
    category: str


class RuntimePreferenceUpdate(BaseModel):
    preferred_mode: Literal["auto", "codex", "live", "demo"]


class CapabilityOut(BaseModel):
    planner_model: str
    coder_model: str
    worker_model: str
    sandbox: str
    desktop_control: bool
    selected_mode: str
    preferred_mode: str
    available_modes: list[str]
    auth_provider: str
    live_mode_available: bool
    codex_mode_available: bool
    demo_mode_available: bool
    codex_cli_available: bool
    codex_login_configured: bool
    openai_api_key_configured: bool
    auth_account_email: str | None
    auth_account_id: str | None
    auth_plan_type: str | None
    auth_last_refresh: str | None
    auth_login_command: str
    auth_logout_command: str
    browser_available: bool
    browser_channel: str | None
    runtime_reason: str
    running_tasks: int
    tools: list[ToolCapabilityOut]
    approval_actions: list[str]


class RuntimeDiagnosticsOut(BaseModel):
    app_version: str
    selected_mode: str
    preferred_mode: str
    auth_provider: str
    runtime_reason: str
    workspace_root: str
    artifacts_dir: str
    logs_dir: str
    database_url: str
    model: str
    codex_model: str | None
    browser_available: bool
    browser_channel: str | None
    browser_executable_path: str | None
    headless_browser: bool
    running_tasks: int
    total_tasks: int
    waiting_approvals: int
    completed_tasks: int
    failed_tasks: int
    login_command: str
    logout_command: str


class OperatorRecoveryOut(BaseModel):
    restarted_task_ids: list[str]
    skipped_task_ids: list[str]
    restarted_count: int


class AgentPresetCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    title: str = Field(min_length=1, max_length=200)
    goal: str = Field(min_length=1)
    workspace_path: str | None = None
    risk_level: RiskLevel = RiskLevel.MEDIUM
    created_by: str | None = None


class AgentPresetOut(BaseModel):
    id: str
    name: str
    title: str
    goal: str
    workspace_path: str | None
    risk_level: RiskLevel
    created_by: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class WorkspaceEntryOut(BaseModel):
    name: str
    path: str
    is_dir: bool
    is_project: bool


class WorkspaceBrowseOut(BaseModel):
    current_path: str
    parent_path: str | None
    roots: list[str]
    entries: list[WorkspaceEntryOut]


class BrowserPreviewRequest(BaseModel):
    url: str = Field(min_length=1, max_length=2000)


class BrowserPreviewOut(BaseModel):
    preview_id: str
    url: str
    title: str
    text_excerpt: str
    interactive_elements: list[dict]
    screenshot_path: str
    screenshot_mime_type: str


class BrowserSessionCreate(BaseModel):
    url: str = Field(min_length=1, max_length=2000)
    headless: bool | None = None


class BrowserSessionAction(BaseModel):
    action: Literal["goto", "click", "type", "press", "scroll", "snapshot", "extract"]
    url: str | None = None
    selector: str | None = None
    text: str | None = None
    key: str | None = None
    delta_x: int = 0
    delta_y: int = 600
    label: str | None = None


class BrowserSessionOut(BaseModel):
    session_id: str
    url: str
    title: str
    text_excerpt: str
    interactive_elements: list[dict]
    screenshot_path: str
    screenshot_mime_type: str
    last_action: str
    last_selector: str | None
    last_extract: dict | None = None
    headless: bool
    started_at: datetime
    updated_at: datetime


class ChatSessionCreate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    workspace_path: str | None = None
    created_by: str | None = None


class ChatMessageCreate(BaseModel):
    content: str = Field(min_length=1)


class ChatMessageOut(BaseModel):
    id: str
    session_id: str
    role: str
    content: str
    metadata: dict | None = Field(default=None, validation_alias="metadata_json")
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatSessionOut(BaseModel):
    id: str
    title: str
    workspace_path: str | None
    created_by: str | None
    created_at: datetime
    updated_at: datetime
    message_count: int = 0

    model_config = {"from_attributes": True}


class ChatSessionDetailOut(BaseModel):
    id: str
    title: str
    workspace_path: str | None
    created_by: str | None
    created_at: datetime
    updated_at: datetime
    messages: list[ChatMessageOut]

    model_config = {"from_attributes": True}


class OnboardingStepOut(BaseModel):
    key: str
    title: str
    description: str
    status: Literal["done", "ready", "blocked", "optional"]
    detail: str | None = None


class OnboardingStatusOut(BaseModel):
    is_complete: bool
    completed_at: datetime | None
    workspace_path: str | None
    codex_login_required: bool
    auth_ready: bool
    workspace_ready: bool
    browser_ready: bool
    launch_ready: bool
    selected_mode: str
    auth_provider: str
    runtime_reason: str
    auth_account_email: str | None
    auth_plan_type: str | None
    login_command: str
    logout_command: str
    workspace_root: str
    browser_channel: str | None
    steps: list[OnboardingStepOut]


class OnboardingUpdate(BaseModel):
    workspace_path: str | None = None
    mark_complete: bool | None = None


class PortalUpdate(BaseModel):
    workspace_path: str | None = None


class PortalOut(BaseModel):
    id: str
    actor_key: str
    slug: str
    source: str
    user_login: str | None
    user_name: str | None
    profile_picture_url: str | None
    workspace_path: str | None
    portal_url: str | None
    session_count: int
    created_at: datetime
    updated_at: datetime
    last_seen_at: datetime | None

    model_config = {"from_attributes": True}


class TailscaleStatusOut(BaseModel):
    cli_available: bool
    cli_path: str | None
    logged_in: bool
    backend_state: str | None
    self_dns_name: str | None
    current_tailnet: str | None
    current_user_login: str | None
    current_user_name: str | None
    serve_enabled: bool
    serve_url: str | None
    serve_config: dict | None
    recommended_command: str | None
    recommended_script_path: str
    portal_auto_provisioning: bool
    identity_headers_expected: list[str]


class TailscaleServeApplyResultOut(BaseModel):
    success: bool
    message: str
    command: str
    serve_url: str | None
