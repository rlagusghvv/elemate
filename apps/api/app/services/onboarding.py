from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

from fastapi import HTTPException, status

from ..execution import get_runtime_status
from ..schemas import OnboardingStatusOut, OnboardingStepOut, OnboardingUpdate
from ..settings import DATA_DIR

ONBOARDING_STATE_PATH = DATA_DIR / "onboarding_state.json"


def get_onboarding_status() -> OnboardingStatusOut:
    runtime = get_runtime_status()
    state = _read_state()
    workspace_path = _load_workspace_path(state, runtime.workspace_root)
    remote_origin = _load_remote_origin(state)
    auth_ready = runtime.codex_login_configured
    workspace_ready = workspace_path is not None
    workspace_access_ready = bool(state.get("workspace_access_ready")) and workspace_ready
    browser_ready = runtime.browser_available
    launch_ready = auth_ready and workspace_ready and workspace_access_ready
    completed_at = _parse_datetime(state.get("completed_at"))
    is_complete = bool(state.get("is_complete")) and launch_ready

    steps = [
        OnboardingStepOut(
            key="auth",
            title="AI 연결",
            description="당신 계정으로 에이전트가 대화하고 작업할 수 있게 연결합니다.",
            status="done" if auth_ready else "blocked",
            detail=(
                f"{runtime.auth_account_email or '계정 정보 확인됨'} · {runtime.auth_plan_type or 'plan 정보 없음'}"
                if auth_ready
                else "데스크탑 앱에서 AI 연결을 시작하거나, 직접 로그인 명령을 실행해 주세요."
            ),
        ),
        OnboardingStepOut(
            key="workspace",
            title="내 폴더 연결",
            description="에이전트가 읽고 수정할 폴더를 지정하고, 실제 접근 허용까지 확인합니다.",
            status="done" if workspace_access_ready else "blocked" if workspace_ready else "ready",
            detail=(
                workspace_path
                if workspace_access_ready
                else f"{workspace_path} · 폴더는 골랐지만 실제 접근 허용 확인이 아직 끝나지 않았습니다."
                if workspace_ready
                else "아직 작업 폴더를 고르지 않았습니다."
            ),
        ),
        OnboardingStepOut(
            key="browser",
            title="사이트 작업 준비",
            description="웹 조사나 자동화가 필요할 때 사이트 세션을 열 수 있는지 확인합니다.",
            status="done" if browser_ready else "optional",
            detail=(
                f"{runtime.browser_channel or '브라우저'} 사용 가능"
                if browser_ready
                else "브라우저가 있으면 사이트 조사나 자동화 품질이 좋아집니다."
            ),
        ),
        OnboardingStepOut(
            key="launch",
            title="채팅 시작",
            description="AI 연결, 폴더 선택, 폴더 접근 확인이 끝나면 바로 채팅으로 일을 맡길 수 있습니다.",
            status="done" if launch_ready else "blocked",
            detail=(
                "기본 연결이 끝나면 채팅창에서 바로 대화를 시작할 수 있습니다."
                if launch_ready
                else "아직 기본 연결이 끝나지 않았습니다."
            ),
        ),
    ]

    return OnboardingStatusOut(
        is_complete=is_complete,
        completed_at=completed_at,
        workspace_path=workspace_path,
        remote_origin=remote_origin,
        codex_login_required=True,
        auth_ready=auth_ready,
        workspace_ready=workspace_ready,
        workspace_access_ready=workspace_access_ready,
        browser_ready=browser_ready,
        launch_ready=launch_ready,
        selected_mode=runtime.selected_mode,
        auth_provider=runtime.auth_provider,
        runtime_reason=runtime.reason,
        auth_account_email=runtime.auth_account_email,
        auth_plan_type=runtime.auth_plan_type,
        login_command=runtime.auth_login_command,
        logout_command=runtime.auth_logout_command,
        workspace_root=runtime.workspace_root,
        browser_channel=runtime.browser_channel,
        steps=steps,
    )


def update_onboarding_status(payload: OnboardingUpdate) -> OnboardingStatusOut:
    runtime = get_runtime_status()
    state = _read_state()

    if payload.workspace_path is not None:
        workspace_path = payload.workspace_path.strip()
        state["workspace_path"] = _validate_workspace_path(workspace_path, runtime.workspace_root) if workspace_path else None
        state["workspace_access_ready"] = False

    if payload.workspace_access_ready is not None:
        state["workspace_access_ready"] = bool(payload.workspace_access_ready) and bool(state.get("workspace_path"))

    if payload.remote_origin is not None:
        remote_origin = payload.remote_origin.strip()
        state["remote_origin"] = _normalize_remote_origin(remote_origin) if remote_origin else None

    status_payload = _build_status_from_state(state, runtime.workspace_root)

    if payload.mark_complete is not None:
        if payload.mark_complete:
            if not status_payload.launch_ready:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="AI 연결, 작업 폴더 선택, 폴더 접근 확인이 끝나야 초기 설정을 완료할 수 있습니다.",
                )
            state["is_complete"] = True
            state["completed_at"] = datetime.now(UTC).isoformat()
        else:
            state["is_complete"] = False
            state["completed_at"] = None

    _write_state(state)
    return get_onboarding_status()


def _build_status_from_state(state: dict, workspace_root: str) -> OnboardingStatusOut:
    runtime = get_runtime_status()
    workspace_path = _load_workspace_path(state, workspace_root)
    remote_origin = _load_remote_origin(state)
    auth_ready = runtime.codex_login_configured
    workspace_ready = workspace_path is not None
    workspace_access_ready = bool(state.get("workspace_access_ready")) and workspace_ready
    browser_ready = runtime.browser_available
    launch_ready = auth_ready and workspace_ready and workspace_access_ready
    completed_at = _parse_datetime(state.get("completed_at"))
    return OnboardingStatusOut(
        is_complete=bool(state.get("is_complete")) and launch_ready,
        completed_at=completed_at,
        workspace_path=workspace_path,
        remote_origin=remote_origin,
        codex_login_required=True,
        auth_ready=auth_ready,
        workspace_ready=workspace_ready,
        workspace_access_ready=workspace_access_ready,
        browser_ready=browser_ready,
        launch_ready=launch_ready,
        selected_mode=runtime.selected_mode,
        auth_provider=runtime.auth_provider,
        runtime_reason=runtime.reason,
        auth_account_email=runtime.auth_account_email,
        auth_plan_type=runtime.auth_plan_type,
        login_command=runtime.auth_login_command,
        logout_command=runtime.auth_logout_command,
        workspace_root=runtime.workspace_root,
        browser_channel=runtime.browser_channel,
        steps=[],
    )


def _read_state() -> dict:
    if not ONBOARDING_STATE_PATH.exists():
        return {}
    try:
        payload = json.loads(ONBOARDING_STATE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return payload if isinstance(payload, dict) else {}


def _write_state(payload: dict) -> None:
    ONBOARDING_STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    ONBOARDING_STATE_PATH.write_text(
        json.dumps(payload, ensure_ascii=True, indent=2),
        encoding="utf-8",
    )


def _load_workspace_path(state: dict, workspace_root: str) -> str | None:
    raw = state.get("workspace_path")
    if not isinstance(raw, str) or not raw.strip():
        return None
    try:
        return _validate_workspace_path(raw, workspace_root)
    except HTTPException:
        return None


def get_manual_remote_origin() -> str | None:
    return _load_remote_origin(_read_state())


def _load_remote_origin(state: dict) -> str | None:
    raw = state.get("remote_origin")
    if not isinstance(raw, str) or not raw.strip():
        return None
    try:
        return _normalize_remote_origin(raw)
    except HTTPException:
        return None


def _validate_workspace_path(raw_path: str, workspace_root: str) -> str:
    candidate = Path(raw_path).expanduser().resolve()
    allowed_roots = [Path.home().resolve(), Path(workspace_root).expanduser().resolve()]
    allowed = False
    for root in allowed_roots:
        if candidate == root or root in candidate.parents:
            allowed = True
            break
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="작업 폴더는 홈 디렉터리 또는 앱 워크스페이스 루트 안에서만 선택할 수 있습니다.",
        )
    if not candidate.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="선택한 작업 폴더가 존재하지 않습니다.")
    if not candidate.is_dir():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="작업 폴더는 디렉터리여야 합니다.")
    return str(candidate)


def _normalize_remote_origin(raw_value: str) -> str:
    candidate = raw_value.strip()
    if not candidate:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="원격 접속 주소가 비어 있습니다.")
    if "://" not in candidate:
        candidate = f"https://{candidate}"

    import ipaddress
    from urllib.parse import urlparse

    parsed = urlparse(candidate)
    if parsed.scheme not in {"https", "http"} or not parsed.netloc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="원격 접속 주소 형식이 올바르지 않습니다. 예: https://my-mac.example.ts.net",
        )
    if parsed.hostname in {"127.0.0.1", "localhost", "0.0.0.0", "::1"}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="휴대폰 접속 주소에는 localhost나 127.0.0.1을 사용할 수 없습니다. 예: https://my-mac.example.ts.net",
        )
    try:
        ipaddress.ip_address(parsed.hostname or "")
    except ValueError:
        pass
    else:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="휴대폰 접속 주소에는 Tailscale IP가 아니라 기기 전체 주소를 사용해야 합니다. 예: https://macmini.tail4fbf54.ts.net",
        )
    return f"{parsed.scheme}://{parsed.netloc}".rstrip("/")


def _parse_datetime(value: object) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed
