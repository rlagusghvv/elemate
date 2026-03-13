from __future__ import annotations

import json
import subprocess
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..execution import get_runtime_status
from ..identity import ActorIdentity
from ..models import ChatMessage, ChatSession
from ..schemas import ChatMessageCreate, ChatSessionCreate, ChatSessionOut

CHAT_LOAD_OPTIONS = (selectinload(ChatSession.messages),)


def list_chat_sessions(db: Session, actor: ActorIdentity, limit: int = 30) -> list[ChatSessionOut]:
    sessions = db.scalars(
        select(ChatSession)
        .where(ChatSession.created_by == actor.actor_key)
        .order_by(ChatSession.updated_at.desc(), ChatSession.created_at.desc())
        .limit(limit)
    ).all()
    return [
        ChatSessionOut.model_validate(
            {
                **_session_payload(session),
                "message_count": _message_count(db, session.id),
            }
        )
        for session in sessions
    ]


def create_chat_session(db: Session, payload: ChatSessionCreate, actor: ActorIdentity) -> ChatSession:
    session = ChatSession(
        title=(payload.title or "새 대화").strip() or "새 대화",
        workspace_path=payload.workspace_path,
        created_by=actor.actor_key,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def get_chat_session(db: Session, session_id: str, actor: ActorIdentity) -> ChatSession:
    session = db.scalar(
        select(ChatSession).where(ChatSession.id == session_id, ChatSession.created_by == actor.actor_key).options(*CHAT_LOAD_OPTIONS)
    )
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat session not found")
    session.messages.sort(key=lambda item: item.created_at)
    return session


def delete_chat_session(db: Session, session_id: str, actor: ActorIdentity) -> None:
    session = db.scalar(select(ChatSession).where(ChatSession.id == session_id, ChatSession.created_by == actor.actor_key))
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat session not found")
    db.delete(session)
    db.commit()


def send_chat_message(db: Session, session_id: str, payload: ChatMessageCreate, actor: ActorIdentity) -> ChatSession:
    session = get_chat_session(db, session_id, actor)
    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Message content is empty")

    user_message = ChatMessage(session_id=session.id, role="user", content=content, metadata_json=None)
    db.add(user_message)
    db.flush()
    session.updated_at = datetime.utcnow()

    session_title = session.title.strip()
    if session_title == "새 대화" and len(session.messages) <= 1:
        session.title = _derive_title(content)

    transcript = [
        {"role": message.role, "content": message.content}
        for message in sorted([*session.messages, user_message], key=lambda item: item.created_at or item.id)
    ]
    assistant_content, metadata = _generate_chat_reply(
        transcript=transcript[-12:],
        workspace_path=session.workspace_path,
    )

    assistant_message = ChatMessage(
        session_id=session.id,
        role="assistant",
        content=assistant_content,
        metadata_json=metadata,
    )
    db.add(assistant_message)
    db.commit()
    return get_chat_session(db, session.id, actor)


def _generate_chat_reply(*, transcript: list[dict[str, str]], workspace_path: str | None) -> tuple[str, dict]:
    runtime = get_runtime_status()
    if runtime.codex_mode_available:
        reply = _codex_chat_reply(transcript=transcript, workspace_path=workspace_path or runtime.workspace_root, runtime=runtime)
        return reply, {"mode": "codex-chat", "provider": "chatgpt_login"}
    return _demo_chat_reply(transcript[-1]["content"]), {"mode": "demo-chat", "provider": "local"}


def _codex_chat_reply(*, transcript: list[dict[str, str]], workspace_path: str, runtime) -> str:
    prompt = _build_chat_prompt(transcript=transcript, workspace_path=workspace_path)
    command = [
        "codex",
        "exec",
        "--json",
        "--color",
        "never",
        "--sandbox",
        "read-only",
        "--skip-git-repo-check",
        "-c",
        'approval_policy="never"',
    ]
    if runtime.codex_model:
        command.extend(["--model", runtime.codex_model])
    command.extend(["-C", workspace_path, prompt])

    completed = subprocess.run(
        command,
        capture_output=True,
        text=True,
        check=False,
    )
    if completed.returncode != 0:
        detail = completed.stderr.strip() or completed.stdout.strip() or "Codex chat execution failed"
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)

    final_message = None
    for raw_line in completed.stdout.splitlines():
        event = _parse_event_line(raw_line)
        if event is None:
            continue
        item = event.get("item") if isinstance(event.get("item"), dict) else None
        if not item:
            continue
        if item.get("type") == "agent_message":
            text = item.get("text")
            if isinstance(text, str) and text.strip():
                final_message = text.strip()

    if not final_message:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="No assistant reply was produced.")
    return final_message


def _demo_chat_reply(latest_user_message: str) -> str:
    return (
        "지금은 자유 채팅 데모 모드입니다. "
        f"방금 요청은 `{latest_user_message}`로 이해했습니다. "
        "실행이 필요한 작업이면 바로 작업으로 전환해 달라고 말해 주세요."
    )


def _build_chat_prompt(*, transcript: list[dict[str, str]], workspace_path: str) -> str:
    conversation = "\n".join(f"{item['role'].upper()}: {item['content']}" for item in transcript)
    return (
        "You are EleMate in free-chat mode inside a local agent dashboard.\n\n"
        "Rules:\n"
        "- Reply in Korean unless the user clearly uses another language.\n"
        "- Be concise, practical, and easy for non-technical users to follow.\n"
        "- Do not modify files, do not run shell commands, and do not take actions in chat mode.\n"
        "- If the user asks for execution, explain briefly what would happen and tell them to use the execution button in the same screen to actually start it.\n"
        "- You may reference the current workspace context if relevant, but keep the reply conversational.\n"
        "- If the user asks what this device can do, answer in plain Korean with 3-6 short bullets focused on outcomes such as file cleanup, code fixes, document research, browser setup, or draft preparation.\n"
        "- For capability questions, call the workspace simply '연결된 폴더' instead of showing the raw path.\n"
        "- Do not list runtime versions, package managers, IDE names, SDK names, exact filesystem paths, or project folder names unless the user explicitly asks for technical details.\n"
        "- Do not dump an inventory of the computer. Summarize what the user can ask EleMate to do next.\n"
        "- If there are limits, explain them in simple Korean such as '휴대폰 연결은 되었지만 아직 화면 제어 권한이 필요합니다.'\n\n"
        f"Workspace root: {workspace_path}\n\n"
        "Conversation so far:\n"
        f"{conversation}\n\n"
        "Write the next assistant message only."
    )


def _parse_event_line(line: str) -> dict | None:
    stripped = line.strip()
    if not stripped.startswith("{"):
        return None
    try:
        payload = json.loads(stripped)
    except json.JSONDecodeError:
        return None
    return payload if isinstance(payload, dict) else None


def _derive_title(content: str) -> str:
    normalized = " ".join(content.split())
    if len(normalized) <= 36:
        return normalized or "새 대화"
    return f"{normalized[:36]}..."


def _message_count(db: Session, session_id: str) -> int:
    session = db.scalar(select(ChatSession).where(ChatSession.id == session_id).options(*CHAT_LOAD_OPTIONS))
    return len(session.messages) if session is not None else 0


def _session_payload(session: ChatSession) -> dict:
    return {
        "id": session.id,
        "title": session.title,
        "workspace_path": session.workspace_path,
        "created_by": session.created_by,
        "created_at": session.created_at,
        "updated_at": session.updated_at,
    }
