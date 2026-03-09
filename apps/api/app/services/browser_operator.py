from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from threading import Lock

from fastapi import HTTPException, status

from ..execution import get_runtime_status
from ..execution.browser import BrowserAutomation
from ..schemas import BrowserSessionAction, BrowserSessionCreate, BrowserSessionOut


@dataclass
class BrowserOperatorSession:
    session_id: str
    automation: BrowserAutomation
    headless: bool
    started_at: datetime
    updated_at: datetime
    last_action: str
    last_selector: str | None = None
    last_extract: dict | None = None
    snapshot: dict = field(default_factory=dict)


_SESSIONS: dict[str, BrowserOperatorSession] = {}
_LOCK = Lock()


def list_browser_sessions() -> list[BrowserSessionOut]:
    with _LOCK:
        sessions = sorted(_SESSIONS.values(), key=lambda item: item.updated_at, reverse=True)
        return [_to_payload(session) for session in sessions]


def create_browser_session(payload: BrowserSessionCreate) -> BrowserSessionOut:
    runtime = get_runtime_status()
    if not runtime.browser_available:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="No local browser automation runtime is available.")

    session_id = f"browser-session-{uuid.uuid4()}"
    url = _normalize_url(payload.url)
    headless = runtime.headless_browser if payload.headless is None else payload.headless
    automation = BrowserAutomation(
        task_id=session_id,
        channel=runtime.browser_channel,
        executable_path=runtime.browser_executable_path,
        headless=headless,
    )
    try:
        snapshot = automation.goto(url)
    except Exception as exc:  # noqa: BLE001
        automation.close()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    now = datetime.now(UTC)
    session = BrowserOperatorSession(
        session_id=session_id,
        automation=automation,
        headless=headless,
        started_at=now,
        updated_at=now,
        last_action="goto",
        snapshot=snapshot,
    )
    with _LOCK:
        _SESSIONS[session_id] = session
    return _to_payload(session)


def get_browser_session(session_id: str) -> BrowserSessionOut:
    with _LOCK:
        session = _SESSIONS.get(session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Browser session not found.")
    return _to_payload(session)


def act_browser_session(session_id: str, payload: BrowserSessionAction) -> BrowserSessionOut:
    with _LOCK:
        session = _SESSIONS.get(session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Browser session not found.")

    try:
        if payload.action == "goto":
            session.snapshot = session.automation.goto(_normalize_url(payload.url))
            session.last_action = "goto"
            session.last_selector = None
            session.last_extract = None
        elif payload.action == "click":
            selector = _require_value(payload.selector, "selector")
            session.snapshot = session.automation.click(selector)
            session.last_action = "click"
            session.last_selector = selector
            session.last_extract = None
        elif payload.action == "type":
            selector = _require_value(payload.selector, "selector")
            text = _require_value(payload.text, "text")
            session.snapshot = session.automation.type(selector, text)
            session.last_action = "type"
            session.last_selector = selector
            session.last_extract = None
        elif payload.action == "press":
            key = _require_value(payload.key, "key")
            session.snapshot = session.automation.press(key)
            session.last_action = "press"
            session.last_selector = None
            session.last_extract = None
        elif payload.action == "scroll":
            session.snapshot = session.automation.scroll(payload.delta_x, payload.delta_y)
            session.last_action = "scroll"
            session.last_selector = None
            session.last_extract = None
        elif payload.action == "snapshot":
            label = payload.label.strip() if isinstance(payload.label, str) and payload.label.strip() else "browser-snapshot"
            session.snapshot = session.automation.snapshot(label=label)
            session.last_action = "snapshot"
            session.last_selector = None
            session.last_extract = None
        elif payload.action == "extract":
            selector = _require_value(payload.selector, "selector")
            extract = session.automation.extract(selector)
            session.snapshot = session.automation.snapshot(label="browser-extract")
            session.last_action = "extract"
            session.last_selector = selector
            session.last_extract = extract
        else:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unsupported browser action.")
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    session.updated_at = datetime.now(UTC)
    with _LOCK:
        _SESSIONS[session_id] = session
    return _to_payload(session)


def delete_browser_session(session_id: str) -> None:
    with _LOCK:
        session = _SESSIONS.pop(session_id, None)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Browser session not found.")
    session.automation.close()


def _to_payload(session: BrowserOperatorSession) -> BrowserSessionOut:
    screenshot = session.snapshot.get("screenshot") if isinstance(session.snapshot, dict) else None
    public_path = screenshot.get("public_path") if isinstance(screenshot, dict) else None
    if not isinstance(public_path, str):
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Browser session is missing screenshot data.")

    return BrowserSessionOut(
        session_id=session.session_id,
        url=str(session.snapshot.get("url", "")),
        title=str(session.snapshot.get("title", "")),
        text_excerpt=str(session.snapshot.get("text_excerpt", "")),
        interactive_elements=list(session.snapshot.get("interactive_elements", [])),
        screenshot_path=public_path,
        screenshot_mime_type="image/png",
        last_action=session.last_action,
        last_selector=session.last_selector,
        last_extract=session.last_extract,
        headless=session.headless,
        started_at=session.started_at,
        updated_at=session.updated_at,
    )


def _normalize_url(url: str | None) -> str:
    normalized = (url or "").strip()
    if not normalized:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="A URL is required.")
    if not normalized.startswith(("http://", "https://")):
        normalized = f"https://{normalized}"
    return normalized


def _require_value(value: str | None, field_name: str) -> str:
    normalized = (value or "").strip()
    if not normalized:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"`{field_name}` is required for this action.")
    return normalized
