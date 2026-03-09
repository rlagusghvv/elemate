from __future__ import annotations

import subprocess

from fastapi import APIRouter, HTTPException, status

from ..execution import set_runtime_preference
from ..schemas import CapabilityOut, RuntimePreferenceUpdate
from ..services import build_capabilities

router = APIRouter(tags=["meta"])


@router.get("/capabilities", response_model=CapabilityOut)
def get_capabilities() -> CapabilityOut:
    return build_capabilities()


@router.post("/runtime/preferences", response_model=CapabilityOut)
def update_runtime_preferences(payload: RuntimePreferenceUpdate) -> CapabilityOut:
    set_runtime_preference(payload.preferred_mode)
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
