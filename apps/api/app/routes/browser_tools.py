from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, status

from ..execution import get_runtime_status
from ..execution.browser import BrowserAutomation
from ..schemas import BrowserPreviewOut, BrowserPreviewRequest, BrowserSessionAction, BrowserSessionCreate, BrowserSessionOut
from ..services.browser_operator import (
    act_browser_session,
    create_browser_session,
    delete_browser_session,
    get_browser_session,
    list_browser_sessions,
)

router = APIRouter(prefix="/browser", tags=["browser"])


@router.post("/preview", response_model=BrowserPreviewOut)
def preview_browser_page(payload: BrowserPreviewRequest) -> BrowserPreviewOut:
    runtime = get_runtime_status()
    if not runtime.browser_available:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="No local browser automation runtime is available.")

    url = payload.url.strip()
    if not url.startswith(("http://", "https://")):
        url = f"https://{url}"

    preview_id = f"browser-preview-{uuid.uuid4()}"
    automation = BrowserAutomation(
        task_id=preview_id,
        channel=runtime.browser_channel,
        executable_path=runtime.browser_executable_path,
        headless=runtime.headless_browser,
    )

    try:
        snapshot = automation.goto(url)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    finally:
        automation.close()

    screenshot = snapshot.get("screenshot")
    if not isinstance(screenshot, dict) or not isinstance(screenshot.get("public_path"), str):
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Browser preview did not produce a screenshot.")

    return BrowserPreviewOut(
        preview_id=preview_id,
        url=str(snapshot.get("url", url)),
        title=str(snapshot.get("title", "")),
        text_excerpt=str(snapshot.get("text_excerpt", "")),
        interactive_elements=list(snapshot.get("interactive_elements", [])),
        screenshot_path=str(screenshot["public_path"]),
        screenshot_mime_type="image/png",
    )


@router.get("/sessions", response_model=list[BrowserSessionOut])
def read_browser_sessions() -> list[BrowserSessionOut]:
    return list_browser_sessions()


@router.post("/sessions", response_model=BrowserSessionOut, status_code=status.HTTP_201_CREATED)
def open_browser_session(payload: BrowserSessionCreate) -> BrowserSessionOut:
    return create_browser_session(payload)


@router.get("/sessions/{session_id}", response_model=BrowserSessionOut)
def read_browser_session(session_id: str) -> BrowserSessionOut:
    return get_browser_session(session_id)


@router.post("/sessions/{session_id}/actions", response_model=BrowserSessionOut)
def execute_browser_action(session_id: str, payload: BrowserSessionAction) -> BrowserSessionOut:
    return act_browser_session(session_id, payload)


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def close_browser_session(session_id: str) -> None:
    delete_browser_session(session_id)
