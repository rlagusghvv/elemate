from __future__ import annotations

import hashlib
import re
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..identity import ActorIdentity
from ..models import AgentPortal, ChatSession
from ..schemas import PortalOut, PortalUpdate

_SLUG_SANITIZER = re.compile(r"[^a-z0-9]+")


def get_or_create_portal(db: Session, actor: ActorIdentity, *, base_url: str | None = None) -> PortalOut:
    portal = db.scalar(select(AgentPortal).where(AgentPortal.actor_key == actor.actor_key))
    now = datetime.now(UTC)
    if portal is None:
        portal = AgentPortal(
            actor_key=actor.actor_key,
            slug=_unique_slug(db, actor.user_login or actor.user_name or actor.actor_key),
            source=actor.source,
            user_login=actor.user_login,
            user_name=actor.user_name,
            profile_picture_url=actor.profile_picture_url,
            last_seen_at=now,
        )
        db.add(portal)
        db.commit()
        db.refresh(portal)
    else:
        portal.source = actor.source
        portal.user_login = actor.user_login
        portal.user_name = actor.user_name
        portal.profile_picture_url = actor.profile_picture_url
        portal.last_seen_at = now
        db.commit()
        db.refresh(portal)

    return _portal_payload(db, portal, base_url=base_url)


def update_portal(db: Session, actor: ActorIdentity, payload: PortalUpdate, *, base_url: str | None = None) -> PortalOut:
    portal = db.scalar(select(AgentPortal).where(AgentPortal.actor_key == actor.actor_key))
    if portal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Portal not found.")

    if payload.workspace_path is not None:
        workspace_path = payload.workspace_path.strip()
        portal.workspace_path = workspace_path or None

    portal.last_seen_at = datetime.now(UTC)
    db.commit()
    db.refresh(portal)
    return _portal_payload(db, portal, base_url=base_url)


def _portal_payload(db: Session, portal: AgentPortal, *, base_url: str | None) -> PortalOut:
    session_count = db.scalar(select(func.count()).select_from(ChatSession).where(ChatSession.created_by == portal.actor_key)) or 0
    return PortalOut(
        id=portal.id,
        actor_key=portal.actor_key,
        slug=portal.slug,
        source=portal.source,
        user_login=portal.user_login,
        user_name=portal.user_name,
        profile_picture_url=portal.profile_picture_url,
        workspace_path=portal.workspace_path,
        portal_url=_portal_url(base_url, portal.slug),
        session_count=int(session_count),
        created_at=portal.created_at,
        updated_at=portal.updated_at,
        last_seen_at=portal.last_seen_at,
    )


def _portal_url(base_url: str | None, slug: str) -> str | None:
    if not base_url:
        return None
    normalized = base_url.rstrip("/")
    return f"{normalized}/portal/{slug}"


def _unique_slug(db: Session, seed: str) -> str:
    base = _slugify(seed)
    candidate = base
    index = 1
    while db.scalar(select(AgentPortal).where(AgentPortal.slug == candidate)) is not None:
        suffix = hashlib.sha1(f"{seed}:{index}".encode("utf-8")).hexdigest()[:6]
        candidate = f"{base}-{suffix}"
        index += 1
    return candidate


def _slugify(value: str) -> str:
    lowered = value.lower()
    local_part = lowered.split("@", 1)[0]
    slug = _SLUG_SANITIZER.sub("-", local_part).strip("-")
    return slug[:48] or "agent-user"
