from __future__ import annotations

import subprocess

from fastapi import APIRouter, HTTPException, status

from ..execution import clear_openai_api_key, set_openai_api_key, set_runtime_preference
from ..schemas import ApiKeyUpdate, CapabilityOut, RuntimePreferenceUpdate
from ..services import build_capabilities

router = APIRouter(tags=["meta"])


@router.get("/capabilities", response_model=CapabilityOut)
def get_capabilities() -> CapabilityOut:
    return build_capabilities()


@router.post("/runtime/preferences", response_model=CapabilityOut)
def update_runtime_preferences(payload: RuntimePreferenceUpdate) -> CapabilityOut:
    set_runtime_preference(payload.preferred_mode)
    return build_capabilities()


@router.post("/auth/api-key", response_model=CapabilityOut)
def update_api_key(payload: ApiKeyUpdate) -> CapabilityOut:
    api_key = (payload.api_key or "").strip()
    if not api_key:
        clear_openai_api_key()
        return build_capabilities()
    try:
        set_openai_api_key(api_key)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    return build_capabilities()


@router.delete("/auth/api-key", response_model=CapabilityOut)
def delete_api_key() -> CapabilityOut:
    clear_openai_api_key()
    return build_capabilities()


@router.post("/auth/logout", response_model=CapabilityOut)
def logout_codex_auth() -> CapabilityOut:
    try:
        completed = subprocess.run(
            ["codex", "logout"],
            capture_output=True,
            text=True,
            check=False,
        )
    except OSError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    if completed.returncode != 0:
        detail = completed.stderr.strip() or completed.stdout.strip() or "Failed to logout from Codex auth."
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)
    return build_capabilities()
