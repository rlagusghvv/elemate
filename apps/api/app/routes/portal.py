from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from ..database import get_db
from ..identity import get_actor_identity
from ..schemas import PortalOut, PortalUpdate
from ..services.portals import get_or_create_portal, update_portal

router = APIRouter(prefix="/portal", tags=["portal"])


@router.get("/me", response_model=PortalOut)
def read_my_portal(request: Request, db: Session = Depends(get_db)) -> PortalOut:
    actor = get_actor_identity(request)
    return get_or_create_portal(db, actor, base_url=_external_base_url(request))


@router.post("/me", response_model=PortalOut)
def write_my_portal(payload: PortalUpdate, request: Request, db: Session = Depends(get_db)) -> PortalOut:
    actor = get_actor_identity(request)
    base_url = _external_base_url(request)
    get_or_create_portal(db, actor, base_url=base_url)
    return update_portal(db, actor, payload, base_url=base_url)


def _external_base_url(request: Request) -> str:
    public_origin = request.headers.get("x-elemate-public-origin") or request.headers.get("x-forge-public-origin")
    if public_origin:
        return public_origin.rstrip("/")
    forwarded_proto = request.headers.get("x-forwarded-proto")
    forwarded_host = request.headers.get("x-forwarded-host")
    if forwarded_proto and forwarded_host:
        return f"{forwarded_proto}://{forwarded_host}"
    return str(request.base_url).rstrip("/")
