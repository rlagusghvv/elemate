from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, status

from ..identity import get_actor_identity
from ..schemas import TailscaleServeApplyResultOut, TailscaleStatusOut
from ..services.tailscale import enable_tailscale_serve, get_tailscale_status, reset_tailscale_serve

router = APIRouter(prefix="/tailscale", tags=["tailscale"])


@router.get("/status", response_model=TailscaleStatusOut)
def read_tailscale_status() -> TailscaleStatusOut:
    return get_tailscale_status()


@router.post("/serve/enable", response_model=TailscaleServeApplyResultOut)
def enable_serve(request: Request) -> TailscaleServeApplyResultOut:
    _require_local_admin(request)
    return enable_tailscale_serve()


@router.post("/serve/reset", response_model=TailscaleServeApplyResultOut)
def reset_serve(request: Request) -> TailscaleServeApplyResultOut:
    _require_local_admin(request)
    return reset_tailscale_serve()


def _require_local_admin(request: Request) -> None:
    actor = get_actor_identity(request)
    if actor.source == "tailscale":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Remote Tailscale users cannot change device-level Serve settings.")
