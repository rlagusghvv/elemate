from __future__ import annotations

import json
import os
import shutil
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
    binary = _tailscale_binary()
    if binary is None:
        return TailscaleStatusOut(
            cli_available=False,
            cli_path=None,
            desktop_install_url=TAILSCALE_DESKTOP_INSTALL_URL,
            mobile_install_url=TAILSCALE_MOBILE_INSTALL_URL,
            ios_install_url=TAILSCALE_IOS_INSTALL_URL,
            android_install_url=TAILSCALE_ANDROID_INSTALL_URL,
            logged_in=False,
            service_running=False,
            has_node_key=False,
            backend_state=None,
            auth_url=None,
            self_dns_name=None,
            current_tailnet=None,
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

    status_payload = _run_json_command([binary, "status", "--json"])
    serve_payload = _run_json_command([binary, "serve", "status", "--json"])

    self_payload = status_payload.get("Self") if isinstance(status_payload.get("Self"), dict) else {}
    dns_name = str(self_payload.get("DNSName", "")).rstrip(".") or None
    current_user = self_payload.get("UserProfile") if isinstance(self_payload.get("UserProfile"), dict) else {}
    user_login = _string_or_none(current_user.get("LoginName"))
    user_name = _string_or_none(current_user.get("DisplayName"))
    backend_state = _string_or_none(status_payload.get("BackendState"))
    auth_url = _string_or_none(status_payload.get("AuthURL"))
    has_node_key = bool(status_payload.get("HaveNodeKey"))
    service_running = backend_state == "Running"
    logged_in = bool((has_node_key or user_login or user_name) and not auth_url)
    current_tailnet = dns_name.split(".", 1)[1] if dns_name and "." in dns_name else None
    serve_enabled = bool(serve_payload.get("TCP")) or bool(serve_payload.get("Web"))
    serve_url = f"https://{dns_name}" if dns_name and serve_enabled else None

    return TailscaleStatusOut(
        cli_available=True,
        cli_path=binary,
        desktop_install_url=TAILSCALE_DESKTOP_INSTALL_URL,
        mobile_install_url=TAILSCALE_MOBILE_INSTALL_URL,
        ios_install_url=TAILSCALE_IOS_INSTALL_URL,
        android_install_url=TAILSCALE_ANDROID_INSTALL_URL,
        logged_in=logged_in,
        service_running=service_running,
        has_node_key=has_node_key,
        backend_state=backend_state,
        auth_url=auth_url,
        self_dns_name=dns_name,
        current_tailnet=current_tailnet,
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
    if not status_payload.logged_in:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="먼저 원격 연결 로그인을 완료해야 합니다. Tailscale 앱을 열어 로그인한 뒤 다시 시도하세요.",
        )

    if not status_payload.service_running:
        _run_checked_command(
            [binary, "up", "--timeout", "20s"],
            default_detail="Failed to start the Tailscale connection.",
        )

    command = [binary, "serve", "--bg", str(local_port)]
    completed = _run_checked_command(command, default_detail="Failed to enable Tailscale Serve.")

    status_payload = get_tailscale_status()
    message = completed.stdout.strip() or "Tailscale Serve is enabled."
    return TailscaleServeApplyResultOut(
        success=True,
        message=message,
        command=" ".join(command),
        serve_url=status_payload.serve_url,
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
    candidate = shutil.which("tailscale")
    if candidate:
        return candidate

    known_paths = [
        "/Applications/Tailscale.app/Contents/MacOS/Tailscale",
        os.path.expanduser("~/Applications/Tailscale.app/Contents/MacOS/Tailscale"),
    ]
    for path in known_paths:
        if Path(path).exists():
            return path
    return None


def _run_json_command(command: list[str]) -> dict:
    completed = subprocess.run(command, capture_output=True, text=True, check=False)
    if completed.returncode != 0:
        return {}
    try:
        payload = json.loads(completed.stdout)
    except json.JSONDecodeError:
        return {}
    return payload if isinstance(payload, dict) else {}


def _run_checked_command(command: list[str], *, default_detail: str) -> subprocess.CompletedProcess[str]:
    completed = subprocess.run(command, capture_output=True, text=True, check=False)
    if completed.returncode != 0:
        detail = completed.stderr.strip() or completed.stdout.strip() or default_detail
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)
    return completed


def _string_or_none(value: object) -> str | None:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None
