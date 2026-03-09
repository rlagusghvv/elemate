from __future__ import annotations

from dataclasses import dataclass
from email.header import decode_header

from fastapi import Request


@dataclass(frozen=True, slots=True)
class ActorIdentity:
    actor_key: str
    source: str
    user_login: str | None
    user_name: str | None
    profile_picture_url: str | None


def get_actor_identity(request: Request) -> ActorIdentity:
    user_login = _decode_header_value(request.headers.get("tailscale-user-login"))
    user_name = _decode_header_value(request.headers.get("tailscale-user-name"))
    profile_picture_url = _decode_header_value(request.headers.get("tailscale-user-profile-pic"))

    if user_login:
        normalized_login = user_login.strip().lower()
        return ActorIdentity(
            actor_key=f"ts:{normalized_login}",
            source="tailscale",
            user_login=normalized_login,
            user_name=user_name or normalized_login,
            profile_picture_url=profile_picture_url,
        )

    local_user = (
        _decode_header_value(request.headers.get("x-elemate-user"))
        or _decode_header_value(request.headers.get("x-forge-user"))
        or "local-user"
    )
    return ActorIdentity(
        actor_key=f"local:{local_user}",
        source="local",
        user_login=local_user,
        user_name=local_user,
        profile_picture_url=None,
    )


def _decode_header_value(value: str | None) -> str | None:
    if not value:
        return None
    parts: list[str] = []
    for chunk, encoding in decode_header(value):
        if isinstance(chunk, bytes):
            parts.append(chunk.decode(encoding or "utf-8", errors="replace"))
        elif isinstance(chunk, str):
            parts.append(chunk)
    decoded = "".join(parts).strip()
    return decoded or None
