from __future__ import annotations

import json
import subprocess
import threading
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from time import monotonic

from openai import OpenAI
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
from .browser import BrowserAutomation
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

SYSTEM_PROMPT = """
You are EleMate, a local development and browser automation operator.

Rules:
- Operate only inside the provided workspace unless a browser tool is explicitly used.
- Use tools instead of guessing. Read files before editing them.
- Ask for approval with request_approval before any risky action:
  email send, file delete, git push, deploy, external form submission after login, payment or checkout.
- If a tool reports policy_blocked, call request_approval instead of retrying unsafely.
- Prefer minimal, reversible changes and verify with shell commands when appropriate.
- When the task is complete, provide a concise final report with what changed, what was verified, and any remaining risks.
""".strip()


@dataclass(slots=True)
class SessionState:
    task_id: str
    stop_event: threading.Event = field(default_factory=threading.Event)
    thread: threading.Thread | None = None
    browser: BrowserAutomation | None = None

    def close(self) -> None:
        if self.browser is not None:
            self.browser.close()
            self.browser = None


@dataclass(slots=True)
class ApprovalPause(Exception):
    action_type: ApprovalActionType
    preview: str
    reason: str


_SESSIONS: dict[str, SessionState] = {}
_LOCK = threading.Lock()


def running_task_count() -> int:
    with _LOCK:
        return sum(1 for state in _SESSIONS.values() if state.thread and state.thread.is_alive())


def has_live_session(task_id: str) -> bool:
    with _LOCK:
        return task_id in _SESSIONS


def start_live_task(task_id: str) -> None:
    state = _get_or_create_state(task_id)
    if state.thread and state.thread.is_alive():
        return
    state.stop_event.clear()
    thread = threading.Thread(target=_run_live_task, args=(task_id,), daemon=True, name=f"elemate-live-{task_id}")
    state.thread = thread
    thread.start()


def resume_live_task(task_id: str, *, approval_id: str, approved: bool, reason: str | None, decided_by: str | None) -> None:
    state = _get_or_create_state(task_id)
    if state.thread and state.thread.is_alive():
        return
    state.stop_event.clear()
    thread = threading.Thread(
        target=_run_live_task,
        kwargs={
            "task_id": task_id,
            "approval_id": approval_id,
            "approved": approved,
            "reason": reason,
            "decided_by": decided_by,
        },
        daemon=True,
        name=f"elemate-live-resume-{task_id}",
    )
    state.thread = thread
    thread.start()


def cancel_live_task(task_id: str) -> bool:
    with _LOCK:
        state = _SESSIONS.get(task_id)
    if state is None:
        return False
    state.stop_event.set()
    return True


def _run_live_task(
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
        if not runtime.live_mode_available:
            _fail_task(
                db,
                task,
                trace_id=trace_id,
                message="OPENAI_API_KEY is not configured, so live execution is unavailable.",
            )
            return

        if state.stop_event.is_set():
            _cancel_task(db, task, trace_id)
            return

        if state.browser is None:
            state.browser = BrowserAutomation(
                task_id=task.id,
                channel=runtime.browser_channel,
                executable_path=runtime.browser_executable_path,
                headless=runtime.headless_browser,
            )

        client = OpenAI()
        if approval_id is None:
            _transition(task, TaskStatus.PLANNING)
            append_log_event(
                task.id,
                level="info",
                source="agent",
                message="Starting live agent execution",
                trace_id=trace_id,
                metadata={"model": runtime.model},
            )
            db.commit()
            response = client.responses.create(
                model=runtime.model,
                instructions=_instructions_for_task(task, runtime),
                input=task.goal,
                tools=_tool_definitions(),
                parallel_tool_calls=False,
                max_tool_calls=40,
            )
        else:
            approval = db.scalar(select(Approval).where(Approval.id == approval_id, Approval.task_id == task.id))
            if approval is None:
                _fail_task(db, task, trace_id=trace_id, message="Approval context was missing for resume.")
                return
            if not approved:
                approval.status = ApprovalStatus.REJECTED
                approval.rejected_at = datetime.now(UTC)
                approval.decided_by = decided_by or "user"
                approval.reason = reason
                pending_step = _pending_approval_step(task)
                if pending_step is not None:
                    pending_step.status = StepStatus.SKIPPED
                    pending_step.output_data = {
                        **(pending_step.output_data or {}),
                        "summary": "User rejected the guarded action.",
                        "approval_result": "rejected",
                    }
                    pending_step.ended_at = datetime.now(UTC)
                _transition(task, TaskStatus.REJECTED)
                task.final_report = "Execution stopped because the user rejected the guarded action."
                append_log_event(
                    task.id,
                    level="warning",
                    source="approval",
                    message="User rejected the approval request",
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
            pending_step = _pending_approval_step(task)
            if pending_step is not None:
                pending_step.status = StepStatus.SUCCESS
                pending_step.ended_at = datetime.now(UTC)
                pending_step.duration_ms = _step_duration_ms(pending_step)
                pending_step.output_data = {
                    **(pending_step.output_data or {}),
                    "summary": "User approved the guarded action. Agent execution resumed.",
                    "approval_result": "approved",
                }
            _transition(task, TaskStatus.RUNNING)
            db.commit()
            response = client.responses.create(
                model=runtime.model,
                previous_response_id=str(approval.payload.get("response_id")),
                input=[
                    {
                        "type": "function_call_output",
                        "call_id": str(approval.payload.get("call_id")),
                        "output": json.dumps({"approved": True, "reason": reason, "decided_by": decided_by or "user"}),
                    }
                ],
                tools=_tool_definitions(),
                parallel_tool_calls=False,
                max_tool_calls=40,
            )

        _transition(task, TaskStatus.RUNNING)
        db.commit()
        executor = LiveToolExecutor(db=db, task=task, state=state, runtime=runtime, trace_id=trace_id)
        _process_responses_loop(db=db, task=task, executor=executor, client=client, response=response, runtime=runtime, trace_id=trace_id)
    except Exception as exc:  # noqa: BLE001
        task = _load_task(db, task_id)
        if task.status not in {TaskStatus.REJECTED, TaskStatus.CANCELED, TaskStatus.COMPLETED}:
            _fail_task(db, task, trace_id=trace_id, message=str(exc))
    finally:
        db.close()
        with _LOCK:
            state = _SESSIONS.get(task_id)
            if state is not None and (state.thread is None or not state.thread.is_alive()):
                pass


def _process_responses_loop(
    *,
    db: Session,
    task: Task,
    executor: "LiveToolExecutor",
    client: OpenAI,
    response,
    runtime: RuntimeStatus,
    trace_id: str,
) -> None:
    iteration = 0
    while iteration < 24:
        if executor.state.stop_event.is_set():
            _cancel_task(db, task, trace_id)
            return

        function_calls = [item for item in getattr(response, "output", []) if getattr(item, "type", None) == "function_call"]
        if not function_calls:
            task = _load_task(db, task.id)
            _transition(task, TaskStatus.COMPLETED)
            task.final_report = (getattr(response, "output_text", None) or "Task completed without a final summary.").strip()
            _create_timeline_artifact(db, task, label="live-timeline")
            append_log_event(
                task.id,
                level="info",
                source="agent",
                message="Live agent execution completed",
                trace_id=trace_id,
                metadata={"iterations": iteration + 1},
            )
            db.commit()
            _cleanup_session(task.id)
            return

        tool_outputs: list[dict] = []
        for function_call in function_calls:
            try:
                result = executor.execute(
                    call_id=function_call.call_id,
                    tool_name=function_call.name,
                    arguments=json.loads(function_call.arguments or "{}"),
                )
                tool_outputs.append(
                    {
                        "type": "function_call_output",
                        "call_id": function_call.call_id,
                        "output": json.dumps(result, ensure_ascii=True),
                    }
                )
            except ApprovalPause as pause:
                task = _load_task(db, task.id)
                approval = Approval(
                    task_id=task.id,
                    action_type=pause.action_type,
                    payload={
                        "provider": "live",
                        "action_type": pause.action_type.value,
                        "preview": pause.preview,
                        "why_blocked": pause.reason,
                        "response_id": response.id,
                        "call_id": function_call.call_id,
                    },
                    status=ApprovalStatus.PENDING,
                )
                db.add(approval)
                _transition(task, TaskStatus.WAITING_APPROVAL)
                task.final_report = f"Paused for approval before `{pause.action_type.value}`."
                append_log_event(
                    task.id,
                    level="warning",
                    source="approval",
                    message="Live execution paused for user approval",
                    trace_id=trace_id,
                    metadata={"action_type": pause.action_type.value, "preview": pause.preview},
                )
                _create_timeline_artifact(db, task, label="live-timeline")
                db.commit()
                return

        response = client.responses.create(
            model=runtime.model,
            previous_response_id=response.id,
            input=tool_outputs,
            tools=_tool_definitions(),
            parallel_tool_calls=False,
            max_tool_calls=40,
        )
        iteration += 1

    _fail_task(db, task, trace_id=trace_id, message="Agent loop exceeded the maximum number of iterations.")


class LiveToolExecutor:
    def __init__(self, *, db: Session, task: Task, state: SessionState, runtime: RuntimeStatus, trace_id: str) -> None:
        self.db = db
        self.task = task
        self.state = state
        self.runtime = runtime
        self.trace_id = trace_id

    def execute(self, *, call_id: str, tool_name: str, arguments: dict) -> dict:
        self.task = _load_task(self.db, self.task.id)
        start = monotonic()
        step = Step(
            task_id=self.task.id,
            type=tool_name,
            title=_tool_title(tool_name, arguments),
            position=_next_step_position(self.db, self.task.id),
            tool_name=tool_name,
            input_data=arguments,
            output_data=None,
            status=StepStatus.RUNNING,
            attempt=1,
            duration_ms=None,
            requires_approval=False,
            started_at=datetime.now(UTC),
            ended_at=None,
        )
        self.db.add(step)
        self.db.commit()

        append_log_event(
            self.task.id,
            level="info",
            source="tool",
            message=f"{tool_name} called",
            trace_id=self.trace_id,
            tool_call_id=call_id,
            metadata={"arguments": arguments},
        )

        try:
            result = self._dispatch(tool_name, arguments)
            step.status = StepStatus.SUCCESS
            step.output_data = result
            step.ended_at = datetime.now(UTC)
            step.duration_ms = int((monotonic() - start) * 1000)
            self._record_action_artifact(tool_name, arguments, result, step.position)
            self.db.commit()
            return result
        except ApprovalPause as pause:
            step.status = StepStatus.PENDING
            step.requires_approval = True
            step.output_data = {"preview": pause.preview, "reason": pause.reason, "action_type": pause.action_type.value}
            self.db.commit()
            raise
        except Exception as exc:  # noqa: BLE001
            step.status = StepStatus.FAILED
            step.error_code = exc.__class__.__name__
            step.output_data = {"error": str(exc)}
            step.ended_at = datetime.now(UTC)
            step.duration_ms = int((monotonic() - start) * 1000)
            self._record_action_artifact(tool_name, arguments, {"error": str(exc)}, step.position)
            self.db.commit()
            return {"ok": False, "error": str(exc)}

    def _dispatch(self, tool_name: str, arguments: dict) -> dict:
        if self.state.stop_event.is_set():
            raise RuntimeError("Task was canceled.")

        handlers = {
            "workspace_list_files": self._workspace_list_files,
            "workspace_search": self._workspace_search,
            "workspace_read_file": self._workspace_read_file,
            "workspace_write_file": self._workspace_write_file,
            "workspace_replace_text": self._workspace_replace_text,
            "shell_run": self._shell_run,
            "browser_goto": self._browser_goto,
            "browser_snapshot": self._browser_snapshot,
            "browser_click": self._browser_click,
            "browser_type": self._browser_type,
            "browser_press": self._browser_press,
            "browser_scroll": self._browser_scroll,
            "browser_extract": self._browser_extract,
            "request_approval": self._request_approval,
        }
        if tool_name not in handlers:
            raise RuntimeError(f"Unsupported tool: {tool_name}")
        return handlers[tool_name](arguments)

    def _workspace_root(self) -> Path:
        return Path(self.task.workspace_path or self.runtime.workspace_root).resolve()

    def _resolve_path(self, raw_path: str) -> Path:
        candidate = (self._workspace_root() / raw_path).resolve() if not Path(raw_path).is_absolute() else Path(raw_path).resolve()
        root = self._workspace_root()
        if candidate != root and root not in candidate.parents:
            raise RuntimeError(f"Path is outside the workspace: {candidate}")
        return candidate

    def _workspace_list_files(self, arguments: dict) -> dict:
        relative_path = str(arguments.get("path", "."))
        target = self._resolve_path(relative_path)
        max_results = min(int(arguments.get("max_results", 200)), 500)
        if target.is_file():
            return {"root": str(target), "files": [str(target.relative_to(self._workspace_root()))]}

        files = [str(path.relative_to(self._workspace_root())) for path in target.rglob("*") if path.is_file()]
        return {"root": str(target), "files": files[:max_results]}

    def _workspace_search(self, arguments: dict) -> dict:
        pattern = str(arguments["pattern"])
        relative_path = str(arguments.get("path", "."))
        max_results = min(int(arguments.get("max_results", 50)), 200)
        target = self._resolve_path(relative_path)
        completed = subprocess.run(
            ["rg", "-n", "--max-count", str(max_results), pattern, str(target)],
            cwd=self._workspace_root(),
            capture_output=True,
            text=True,
            timeout=20,
            check=False,
        )
        return {
            "pattern": pattern,
            "matches": completed.stdout.splitlines(),
            "stderr": completed.stderr.strip(),
            "returncode": completed.returncode,
        }

    def _workspace_read_file(self, arguments: dict) -> dict:
        path = self._resolve_path(str(arguments["path"]))
        start_line = max(int(arguments.get("start_line", 1)), 1)
        end_line = int(arguments.get("end_line", start_line + 200))
        contents = path.read_text(encoding="utf-8")
        lines = contents.splitlines()
        chunk = lines[start_line - 1 : end_line]
        return {
            "path": str(path.relative_to(self._workspace_root())),
            "start_line": start_line,
            "end_line": min(end_line, len(lines)),
            "content": "\n".join(chunk),
        }

    def _workspace_write_file(self, arguments: dict) -> dict:
        path = self._resolve_path(str(arguments["path"]))
        if not arguments.get("create_dirs", False) and not path.parent.exists():
            raise RuntimeError(f"Parent directory does not exist: {path.parent}")
        path.parent.mkdir(parents=True, exist_ok=True)
        content = str(arguments["content"])
        path.write_text(content, encoding="utf-8")
        return {
            "path": str(path.relative_to(self._workspace_root())),
            "size": path.stat().st_size,
        }

    def _workspace_replace_text(self, arguments: dict) -> dict:
        path = self._resolve_path(str(arguments["path"]))
        original = path.read_text(encoding="utf-8")
        find = str(arguments["find"])
        replace = str(arguments["replace"])
        occurrences = original.count(find)
        expected = arguments.get("expected_count")
        if expected is not None and occurrences != int(expected):
            raise RuntimeError(f"Expected {expected} occurrences but found {occurrences}")
        if occurrences == 0:
            raise RuntimeError("Search text was not found in file.")
        updated = original.replace(find, replace)
        path.write_text(updated, encoding="utf-8")
        return {
            "path": str(path.relative_to(self._workspace_root())),
            "occurrences": occurrences,
        }

    def _shell_run(self, arguments: dict) -> dict:
        command = str(arguments["command"])
        action = _approval_action_for_preview(command)
        if action is not None:
            return {
                "ok": False,
                "policy_blocked": True,
                "message": "This command requires approval first. Call request_approval with the same preview.",
                "required_action_type": action.value,
            }
        cwd = self._resolve_path(str(arguments.get("cwd", ".")))
        timeout_ms = min(int(arguments.get("timeout_ms", 20_000)), 120_000)
        completed = subprocess.run(
            command,
            cwd=cwd,
            shell=True,
            capture_output=True,
            text=True,
            timeout=timeout_ms / 1000,
            check=False,
        )
        return {
            "command": command,
            "cwd": str(cwd.relative_to(self._workspace_root())),
            "stdout": completed.stdout[-6000:],
            "stderr": completed.stderr[-6000:],
            "returncode": completed.returncode,
        }

    def _browser_goto(self, arguments: dict) -> dict:
        browser = self._require_browser()
        return browser.goto(str(arguments["url"]))

    def _browser_snapshot(self, arguments: dict) -> dict:
        browser = self._require_browser()
        label = str(arguments.get("label", "browser-snapshot"))
        return browser.snapshot(label=label)

    def _browser_click(self, arguments: dict) -> dict:
        selector = str(arguments["selector"])
        if _looks_like_submit(selector):
            return {
                "ok": False,
                "policy_blocked": True,
                "message": "This click looks like a submit/confirm action. Request approval first if it changes remote state.",
                "required_action_type": ApprovalActionType.EXTERNAL_SUBMIT.value,
            }
        browser = self._require_browser()
        return browser.click(selector)

    def _browser_type(self, arguments: dict) -> dict:
        browser = self._require_browser()
        return browser.type(str(arguments["selector"]), str(arguments["text"]))

    def _browser_press(self, arguments: dict) -> dict:
        browser = self._require_browser()
        return browser.press(str(arguments["key"]))

    def _browser_scroll(self, arguments: dict) -> dict:
        browser = self._require_browser()
        return browser.scroll(int(arguments.get("delta_x", 0)), int(arguments.get("delta_y", 600)))

    def _browser_extract(self, arguments: dict) -> dict:
        browser = self._require_browser()
        return browser.extract(str(arguments.get("selector", "body")))

    def _request_approval(self, arguments: dict) -> dict:
        action_type = ApprovalActionType[str(arguments["action_type"])]
        raise ApprovalPause(
            action_type=action_type,
            preview=str(arguments["preview"]),
            reason=str(arguments["reason"]),
        )

    def _require_browser(self) -> BrowserAutomation:
        if not self.runtime.browser_available:
            raise RuntimeError("No compatible browser was detected on this machine.")
        if self.state.browser is None:
            raise RuntimeError("Browser session was not initialized.")
        return self.state.browser

    def _record_action_artifact(self, tool_name: str, arguments: dict, result: dict, position: int) -> None:
        directory = ARTIFACTS_DIR / self.task.id
        directory.mkdir(parents=True, exist_ok=True)
        file_path = directory / f"action-{position:03d}.json"
        payload = {
            "task_id": self.task.id,
            "tool_name": tool_name,
            "arguments": arguments,
            "result": result,
            "position": position,
        }
        file_path.write_text(json.dumps(payload, ensure_ascii=True, indent=2), encoding="utf-8")
        descriptor = _descriptor(self.task.id, file_path)
        self.db.add(
            Artifact(
                task_id=self.task.id,
                type="action",
                path=descriptor["public_path"],
                metadata_json={"label": _tool_title(tool_name, arguments), "tool_name": tool_name},
                sha256=descriptor["sha256"],
                size=descriptor["size"],
                mime_type="application/json",
            )
        )

        if tool_name.startswith("browser_") and isinstance(result, dict):
            screenshot = result.get("screenshot")
            if isinstance(screenshot, dict) and "public_path" in screenshot:
                self.db.add(
                    Artifact(
                        task_id=self.task.id,
                        type="screenshot",
                        path=str(screenshot["public_path"]),
                        metadata_json={
                            "label": _tool_title(tool_name, arguments),
                            "viewport": "1440x900",
                        },
                        sha256=str(screenshot["sha256"]),
                        size=int(screenshot["size"]),
                        mime_type="image/png",
                    )
                )


def _tool_definitions() -> list[dict]:
    return [
        {
            "type": "function",
            "name": "workspace_list_files",
            "description": "List files under the workspace. Use this before editing or searching large trees.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "max_results": {"type": "integer"},
                },
            },
        },
        {
            "type": "function",
            "name": "workspace_search",
            "description": "Search for a regex pattern in the workspace using ripgrep.",
            "parameters": {
                "type": "object",
                "required": ["pattern"],
                "properties": {
                    "pattern": {"type": "string"},
                    "path": {"type": "string"},
                    "max_results": {"type": "integer"},
                },
            },
        },
        {
            "type": "function",
            "name": "workspace_read_file",
            "description": "Read a portion of a file from the workspace.",
            "parameters": {
                "type": "object",
                "required": ["path"],
                "properties": {
                    "path": {"type": "string"},
                    "start_line": {"type": "integer"},
                    "end_line": {"type": "integer"},
                },
            },
        },
        {
            "type": "function",
            "name": "workspace_write_file",
            "description": "Overwrite or create a workspace file with exact content.",
            "parameters": {
                "type": "object",
                "required": ["path", "content"],
                "properties": {
                    "path": {"type": "string"},
                    "content": {"type": "string"},
                    "create_dirs": {"type": "boolean"},
                },
            },
        },
        {
            "type": "function",
            "name": "workspace_replace_text",
            "description": "Replace exact text in a file. Use after reading the file to avoid corrupting content.",
            "parameters": {
                "type": "object",
                "required": ["path", "find", "replace"],
                "properties": {
                    "path": {"type": "string"},
                    "find": {"type": "string"},
                    "replace": {"type": "string"},
                    "expected_count": {"type": "integer"},
                },
            },
        },
        {
            "type": "function",
            "name": "shell_run",
            "description": "Run a shell command inside the workspace. Dangerous commands must be approved first.",
            "parameters": {
                "type": "object",
                "required": ["command"],
                "properties": {
                    "command": {"type": "string"},
                    "cwd": {"type": "string"},
                    "timeout_ms": {"type": "integer"},
                },
            },
        },
        {
            "type": "function",
            "name": "browser_goto",
            "description": "Open a URL in the browser automation session and capture a fresh snapshot.",
            "parameters": {
                "type": "object",
                "required": ["url"],
                "properties": {"url": {"type": "string"}},
            },
        },
        {
            "type": "function",
            "name": "browser_snapshot",
            "description": "Capture the current browser page, including text excerpt and interactive selectors.",
            "parameters": {
                "type": "object",
                "properties": {"label": {"type": "string"}},
            },
        },
        {
            "type": "function",
            "name": "browser_click",
            "description": "Click the first element matching a Playwright selector. Do not submit remote forms without approval.",
            "parameters": {
                "type": "object",
                "required": ["selector"],
                "properties": {"selector": {"type": "string"}},
            },
        },
        {
            "type": "function",
            "name": "browser_type",
            "description": "Fill a text input or textarea.",
            "parameters": {
                "type": "object",
                "required": ["selector", "text"],
                "properties": {
                    "selector": {"type": "string"},
                    "text": {"type": "string"},
                },
            },
        },
        {
            "type": "function",
            "name": "browser_press",
            "description": "Send a keyboard shortcut or key press to the active browser page.",
            "parameters": {
                "type": "object",
                "required": ["key"],
                "properties": {"key": {"type": "string"}},
            },
        },
        {
            "type": "function",
            "name": "browser_scroll",
            "description": "Scroll the current browser page.",
            "parameters": {
                "type": "object",
                "properties": {
                    "delta_x": {"type": "integer"},
                    "delta_y": {"type": "integer"},
                },
            },
        },
        {
            "type": "function",
            "name": "browser_extract",
            "description": "Extract text and HTML from a selector on the current page.",
            "parameters": {
                "type": "object",
                "properties": {"selector": {"type": "string"}},
            },
        },
        {
            "type": "function",
            "name": "request_approval",
            "description": "Pause and ask the user for approval before a risky action.",
            "parameters": {
                "type": "object",
                "required": ["action_type", "preview", "reason"],
                "properties": {
                    "action_type": {
                        "type": "string",
                        "enum": [item.name for item in ApprovalActionType],
                    },
                    "preview": {"type": "string"},
                    "reason": {"type": "string"},
                },
            },
        },
    ]


def _instructions_for_task(task: Task, runtime: RuntimeStatus) -> str:
    workspace = task.workspace_path or runtime.workspace_root
    return (
        f"{SYSTEM_PROMPT}\n\n"
        f"Workspace root: {workspace}\n"
        f"Current task title: {task.title}\n"
        f"Current task goal: {task.goal}\n"
        f"Browser available: {runtime.browser_available}\n"
        f"Use concise tool arguments and verify changes with shell commands when possible."
    )


def _tool_title(tool_name: str, arguments: dict) -> str:
    title_map = {
        "workspace_list_files": "List workspace files",
        "workspace_search": f"Search `{arguments.get('pattern', '')}`",
        "workspace_read_file": f"Read `{arguments.get('path', '')}`",
        "workspace_write_file": f"Write `{arguments.get('path', '')}`",
        "workspace_replace_text": f"Patch `{arguments.get('path', '')}`",
        "shell_run": f"Run `{arguments.get('command', '')}`",
        "browser_goto": f"Open `{arguments.get('url', '')}`",
        "browser_snapshot": "Capture browser snapshot",
        "browser_click": f"Click `{arguments.get('selector', '')}`",
        "browser_type": f"Type into `{arguments.get('selector', '')}`",
        "browser_press": f"Press `{arguments.get('key', '')}`",
        "browser_scroll": "Scroll browser page",
        "browser_extract": f"Extract `{arguments.get('selector', 'body')}`",
        "request_approval": f"Request approval for `{arguments.get('action_type', '')}`",
    }
    return title_map.get(tool_name, tool_name)


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
    if task.status == TaskStatus.PLANNING:
        _transition(task, TaskStatus.FAILED)
    elif task.status == TaskStatus.RUNNING:
        _transition(task, TaskStatus.FAILED)
    elif task.status == TaskStatus.PENDING:
        _transition(task, TaskStatus.FAILED)
    _finalize_open_steps(task, failed=True)
    task.final_report = message
    append_log_event(
        task.id,
        level="error",
        source="agent",
        message="Live execution failed",
        trace_id=trace_id,
        metadata={"error": message},
    )
    db.commit()
    _cleanup_session(task.id)


def _cancel_task(db: Session, task: Task, trace_id: str) -> None:
    if task.status in {TaskStatus.COMPLETED, TaskStatus.REJECTED, TaskStatus.FAILED}:
        return
    if task.status == TaskStatus.PENDING:
        _transition(task, TaskStatus.CANCELED)
    elif task.status == TaskStatus.PLANNING:
        _transition(task, TaskStatus.CANCELED)
    elif task.status == TaskStatus.RUNNING:
        _transition(task, TaskStatus.CANCELED)
    elif task.status == TaskStatus.WAITING_APPROVAL:
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


def _looks_like_submit(selector: str) -> bool:
    lowered = selector.lower()
    return any(token in lowered for token in ("submit", "confirm", "checkout", "buy", "order", "delete"))


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


def _get_or_create_state(task_id: str) -> SessionState:
    with _LOCK:
        state = _SESSIONS.get(task_id)
        if state is None:
            state = SessionState(task_id=task_id)
            _SESSIONS[task_id] = state
        return state


def _cleanup_session(task_id: str) -> None:
    with _LOCK:
        state = _SESSIONS.pop(task_id, None)
    if state is not None:
        state.close()
