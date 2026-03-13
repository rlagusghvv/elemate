from __future__ import annotations

import json
import os
import re
import shlex
import shutil
import socket
import subprocess
from pathlib import Path

from fastapi import HTTPException, status

from ..schemas import TailscaleServeApplyResultOut, TailscaleStatusOut
from ..settings import SCRIPTS_DIR

TAILSCALE_HEADERS = [
    "Tailscale-User-Login",
    "Tailscale-User-Name",
    "Tailscale-User-Profile-Pic",
]
TAILSCALE_SCRIPT_PATH = SCRIPTS_DIR / "setup_tailscale_serve.sh"
TAILSCALE_DESKTOP_INSTALL_URL = "https://tailscale.com/download"
TAILSCALE_MOBILE_INSTALL_URL = "https://tailscale.com/download"
TAILSCALE_IOS_INSTALL_URL = "https://tailscale.com/download/ios"
TAILSCALE_ANDROID_INSTALL_URL = "https://tailscale.com/download/android"


def get_tailscale_status() -> TailscaleStatusOut:
    binary, status_payload, status_readable, status_message = _resolved_tailscale_status_payload()
    suggested_device_name = None
    suggested_device_name_source = None
    if binary is None:
        hostname_hint = _local_hostname_hint()
        return TailscaleStatusOut(
            cli_available=False,
            cli_path=None,
            desktop_install_url=TAILSCALE_DESKTOP_INSTALL_URL,
            mobile_install_url=TAILSCALE_MOBILE_INSTALL_URL,
            ios_install_url=TAILSCALE_IOS_INSTALL_URL,
            android_install_url=TAILSCALE_ANDROID_INSTALL_URL,
            status_readable=False,
            status_message="이 장비에 Tailscale 앱을 찾지 못했습니다.",
            logged_in=False,
            service_running=False,
            has_node_key=False,
            backend_state=None,
            auth_url=None,
            self_id=None,
            self_dns_name=None,
            current_tailnet=None,
            suggested_device_name=hostname_hint,
            suggested_device_name_source="hostname" if hostname_hint else None,
            current_user_login=None,
            current_user_name=None,
            serve_enabled=False,
            serve_url=None,
            serve_config=None,
            recommended_command="tailscale serve --bg 3000",
            recommended_script_path=str(TAILSCALE_SCRIPT_PATH),
            portal_auto_provisioning=True,
            identity_headers_expected=TAILSCALE_HEADERS,
        )

    serve_completed = _run_command([binary, "serve", "status", "--json"])
    serve_payload, _, _ = _parse_json_result(serve_completed, fallback_message="Tailscale Serve 상태를 읽지 못했습니다.")

    self_payload = status_payload.get("Self") if isinstance(status_payload.get("Self"), dict) else {}
    dns_name = str(self_payload.get("DNSName", "")).rstrip(".") or None
    self_id = _string_or_none(self_payload.get("ID"))
    current_user = self_payload.get("UserProfile") if isinstance(status_payload.get("Self"), dict) and isinstance(self_payload.get("UserProfile"), dict) else {}
    user_login = _string_or_none(current_user.get("LoginName"))
    user_name = _string_or_none(current_user.get("DisplayName"))
    backend_state = _string_or_none(status_payload.get("BackendState"))
    auth_url = _string_or_none(status_payload.get("AuthURL"))
    has_node_key = bool(status_payload.get("HaveNodeKey"))
    service_running = backend_state == "Running"
    logged_in = bool((has_node_key or user_login or user_name) and not auth_url)
    current_tailnet = dns_name.split(".", 1)[1] if dns_name and "." in dns_name else None
    if dns_name and "." in dns_name:
        suggested_device_name = dns_name.split(".", 1)[0]
        suggested_device_name_source = "tailscale"
    else:
        suggested_device_name = _local_hostname_hint()
        suggested_device_name_source = "hostname" if suggested_device_name else None
    serve_enabled = bool(serve_payload.get("TCP")) or bool(serve_payload.get("Web"))
    serve_url = f"https://{dns_name}" if dns_name and serve_enabled else None

    return TailscaleStatusOut(
        cli_available=True,
        cli_path=binary,
        desktop_install_url=TAILSCALE_DESKTOP_INSTALL_URL,
        mobile_install_url=TAILSCALE_MOBILE_INSTALL_URL,
        ios_install_url=TAILSCALE_IOS_INSTALL_URL,
        android_install_url=TAILSCALE_ANDROID_INSTALL_URL,
        status_readable=status_readable,
        status_message=status_message,
        logged_in=logged_in,
        service_running=service_running,
        has_node_key=has_node_key,
        backend_state=backend_state,
        auth_url=auth_url,
        self_id=self_id,
        self_dns_name=dns_name,
        current_tailnet=current_tailnet,
        suggested_device_name=suggested_device_name,
        suggested_device_name_source=suggested_device_name_source,
        current_user_login=user_login,
        current_user_name=user_name,
        serve_enabled=serve_enabled,
        serve_url=serve_url,
        serve_config=serve_payload if serve_enabled else None,
        recommended_command=f"{binary} serve --bg 3000",
        recommended_script_path=str(TAILSCALE_SCRIPT_PATH),
        portal_auto_provisioning=True,
        identity_headers_expected=TAILSCALE_HEADERS,
    )


def enable_tailscale_serve(*, local_port: int = 3000) -> TailscaleServeApplyResultOut:
    binary = _tailscale_binary()
    if binary is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Tailscale CLI is not installed on this machine.")

    status_payload = get_tailscale_status()
    approval_url_from_status = _build_serve_approval_url(status_payload.self_id)

    if status_payload.status_readable and not status_payload.logged_in:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="먼저 원격 연결 로그인을 완료해야 합니다. Tailscale 앱을 열어 로그인한 뒤 다시 시도하세요.",
        )

    if status_payload.status_readable and not status_payload.service_running:
        _run_checked_command(
            [binary, "up", "--timeout", "20s"],
            default_detail="Failed to start the Tailscale connection.",
        )

    command = [binary, "serve", "--bg", str(local_port)]
    completed = _run_command(command)
    output = "\n".join(part for part in [completed.stdout.strip(), completed.stderr.strip()] if part).strip()
    approval_url = _extract_first_url(output)

    status_payload = get_tailscale_status()
    if status_payload.serve_enabled and status_payload.serve_url:
        return TailscaleServeApplyResultOut(
            success=True,
            message=completed.stdout.strip() or "Tailscale Serve is enabled.",
            command=" ".join(command),
            serve_url=status_payload.serve_url,
            approval_url=None,
        )

    if approval_url:
        return TailscaleServeApplyResultOut(
            success=False,
            message="Tailscale tailnet에서 Serve 사용을 한 번 승인해야 합니다. 승인 페이지를 열어 허용한 뒤 다시 확인하세요.",
            command=" ".join(command),
            serve_url=None,
            approval_url=approval_url,
        )

    if approval_url_from_status:
        return TailscaleServeApplyResultOut(
            success=False,
            message="Tailscale tailnet에서 Serve 사용을 한 번 승인해야 할 수 있습니다. 승인 페이지를 열어 허용한 뒤 다시 확인하세요.",
            command=" ".join(command),
            serve_url=None,
            approval_url=approval_url_from_status,
        )

    if "Failed to load preferences" in output or "Tailscale CLI failed to start" in output:
        return TailscaleServeApplyResultOut(
            success=False,
            message="Tailscale 앱이 현재 이 Mac에서 정상 상태를 반환하지 않았습니다. Tailscale 앱을 다시 열거나 다시 시작한 뒤 다시 시도하세요.",
            command=" ".join(command),
            serve_url=None,
            approval_url=None,
        )

    detail = output or "Tailscale Serve를 켜지 못했습니다."
    return TailscaleServeApplyResultOut(
        success=False,
        message=detail,
        command=" ".join(command),
        serve_url=None,
        approval_url=None,
    )


def reset_tailscale_serve() -> TailscaleServeApplyResultOut:
    binary = _tailscale_binary()
    if binary is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Tailscale CLI is not installed on this machine.")

    command = [binary, "serve", "reset"]
    completed = _run_checked_command(command, default_detail="Failed to reset Tailscale Serve.")

    return TailscaleServeApplyResultOut(
        success=True,
        message=completed.stdout.strip() or "Tailscale Serve has been reset.",
        command=" ".join(command),
        serve_url=None,
    )


def _tailscale_binary() -> str | None:
    candidates = _tailscale_binary_candidates()
    return candidates[0] if candidates else None


def _tailscale_binary_candidates() -> list[str]:
    known_paths = [
        "/Applications/Tailscale.app/Contents/MacOS/Tailscale",
        os.path.expanduser("~/Applications/Tailscale.app/Contents/MacOS/Tailscale"),
    ]
    external = shutil.which("tailscale")
    ordered = known_paths + ([external] if external else [])
    seen: set[str] = set()
    candidates: list[str] = []
    for candidate in ordered:
        if not candidate or candidate in seen:
            continue
        seen.add(candidate)
        if Path(candidate).exists():
            candidates.append(candidate)
    return candidates


def _resolved_tailscale_status_payload() -> tuple[str | None, dict, bool, str | None]:
    candidates = _tailscale_binary_candidates()
    if not candidates:
        return None, {}, False, None

    fallback_message = "Tailscale 상태를 자동으로 읽지 못했습니다. Tailscale 앱에서 직접 로그인/연결 상태를 확인해 주세요."
    first_candidate = candidates[0]
    first_message = None
    for candidate in candidates:
        completed = _run_command([candidate, "status", "--json"])
        payload, readable, message = _parse_json_result(completed, fallback_message=fallback_message)
        if readable:
            return candidate, payload, True, None
        if first_message is None:
            first_message = message
    return first_candidate, {}, False, first_message or fallback_message


def _run_command(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(_shell_wrapped_command(command), capture_output=True, text=True, check=False)


def _parse_json_result(completed: subprocess.CompletedProcess[str], *, fallback_message: str) -> tuple[dict, bool, str | None]:
    if completed.returncode != 0:
        detail = completed.stderr.strip() or completed.stdout.strip() or fallback_message
        return {}, False, detail

    try:
        payload = json.loads(completed.stdout)
    except json.JSONDecodeError:
        detail = completed.stdout.strip() or completed.stderr.strip() or fallback_message
        return {}, False, detail

    if not isinstance(payload, dict):
        return {}, False, fallback_message

    return payload, True, None


def _run_checked_command(command: list[str], *, default_detail: str) -> subprocess.CompletedProcess[str]:
    completed = _run_command(command)
    if completed.returncode != 0:
        detail = completed.stderr.strip() or completed.stdout.strip() or default_detail
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)
    return completed


def _shell_wrapped_command(command: list[str]) -> list[str]:
    shell_command = shlex.join(command)
    return ["/bin/zsh", "-lc", shell_command]


def _string_or_none(value: object) -> str | None:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _local_hostname_hint() -> str | None:
    raw = socket.gethostname().strip().lower()
    if not raw:
        return None
    sanitized = "".join(char if char.isalnum() or char == "-" else "-" for char in raw).strip("-")
    return sanitized or None


def _build_serve_approval_url(node_id: str | None) -> str | None:
    if not node_id:
        return None
    return f"https://login.tailscale.com/f/serve?node={node_id}"


def _extract_first_url(text: str) -> str | None:
    match = re.search(r"https://\S+", text)
    if not match:
        return None
    return match.group(0).rstrip(").,")
