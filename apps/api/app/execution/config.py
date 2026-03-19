from __future__ import annotations

import base64
import json
import os
import shutil
from dataclasses import dataclass
from pathlib import Path

from ..settings import DATA_DIR


def _env_flag(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.lower() in {"1", "true", "yes", "on"}


def _env_first(*names: str, default: str | None = None) -> str | None:
    for name in names:
        value = os.getenv(name)
        if value is not None:
            return value
    return default


def _env_flag_first(names: tuple[str, ...], default: bool) -> bool:
    for name in names:
        value = os.getenv(name)
        if value is not None:
            return value.lower() in {"1", "true", "yes", "on"}
    return default


def _decode_jwt_payload(token: str | None) -> dict:
    if not token or token.count(".") != 2:
        return {}
    payload = token.split(".")[1]
    payload += "=" * (-len(payload) % 4)
    try:
        raw = base64.urlsafe_b64decode(payload.encode("utf-8"))
        decoded = json.loads(raw.decode("utf-8"))
    except (ValueError, json.JSONDecodeError):
        return {}
    return decoded if isinstance(decoded, dict) else {}


@dataclass(frozen=True, slots=True)
class AuthSessionStatus:
    provider: str
    codex_cli_available: bool
    codex_login_configured: bool
    openai_api_key_configured: bool
    account_email: str | None
    account_id: str | None
    plan_type: str | None
    last_refresh: str | None
    login_command: str
    logout_command: str


@dataclass(frozen=True, slots=True)
class RuntimeStatus:
    selected_mode: str
    preferred_mode: str
    available_modes: list[str]
    auth_provider: str
    live_mode_available: bool
    codex_mode_available: bool
    demo_mode_available: bool
    codex_cli_available: bool
    codex_login_configured: bool
    openai_api_key_configured: bool
    auth_account_email: str | None
    auth_account_id: str | None
    auth_plan_type: str | None
    auth_last_refresh: str | None
    auth_login_command: str
    auth_logout_command: str
    browser_available: bool
    browser_channel: str | None
    browser_executable_path: str | None
    headless_browser: bool
    model: str
    codex_model: str | None
    workspace_root: str
    reason: str


SUPPORTED_RUNTIME_MODES = {"auto", "codex", "live", "demo"}
PREFERENCES_PATH = DATA_DIR / "runtime_preferences.json"
AUTH_SECRETS_PATH = DATA_DIR / "auth_secrets.json"


def _read_auth_secrets() -> dict:
    if not AUTH_SECRETS_PATH.exists():
        return {}
    try:
        payload = json.loads(AUTH_SECRETS_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return payload if isinstance(payload, dict) else {}


def _write_auth_secrets(payload: dict) -> None:
    AUTH_SECRETS_PATH.parent.mkdir(parents=True, exist_ok=True)
    AUTH_SECRETS_PATH.write_text(
        json.dumps(payload, ensure_ascii=True, indent=2),
        encoding="utf-8",
    )


def get_configured_openai_api_key() -> str | None:
    env_value = _env_first("OPENAI_API_KEY", "ELEMATE_OPENAI_API_KEY", "FORGE_OPENAI_API_KEY")
    if env_value:
        return env_value.strip() or None
    secrets = _read_auth_secrets()
    stored = secrets.get("openai_api_key")
    if isinstance(stored, str) and stored.strip():
        return stored.strip()
    return None


def set_openai_api_key(api_key: str) -> None:
    normalized = api_key.strip()
    if not normalized:
        raise ValueError("OpenAI API key must not be empty.")
    secrets = _read_auth_secrets()
    secrets["openai_api_key"] = normalized
    _write_auth_secrets(secrets)


def clear_openai_api_key() -> None:
    secrets = _read_auth_secrets()
    if "openai_api_key" in secrets:
        secrets.pop("openai_api_key", None)
        if secrets:
            _write_auth_secrets(secrets)
        elif AUTH_SECRETS_PATH.exists():
            AUTH_SECRETS_PATH.unlink()


def get_auth_session_status() -> AuthSessionStatus:
    api_key = get_configured_openai_api_key()
    bundled_codex_available = _env_flag_first(("ELEMATE_BUNDLED_CODEX_AVAILABLE", "FORGE_BUNDLED_CODEX_AVAILABLE"), False)
    codex_cli_available = shutil.which("codex") is not None or bundled_codex_available
    auth_path = Path.home() / ".codex" / "auth.json"

    codex_login_configured = False
    account_email: str | None = None
    account_id: str | None = None
    plan_type: str | None = None
    last_refresh: str | None = None

    if auth_path.exists():
        try:
            auth_payload = json.loads(auth_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            auth_payload = {}

        if isinstance(auth_payload, dict):
            tokens = auth_payload.get("tokens") if isinstance(auth_payload.get("tokens"), dict) else {}
            access_token = tokens.get("access_token") if isinstance(tokens, dict) else None
            refresh_token = tokens.get("refresh_token") if isinstance(tokens, dict) else None
            codex_login_configured = bool(access_token and refresh_token)
            last_refresh = str(auth_payload.get("last_refresh")) if auth_payload.get("last_refresh") else None

            jwt_payload = _decode_jwt_payload(access_token if isinstance(access_token, str) else None)
            profile = jwt_payload.get("https://api.openai.com/profile")
            auth_profile = jwt_payload.get("https://api.openai.com/auth")
            if isinstance(profile, dict):
                email = profile.get("email")
                if isinstance(email, str):
                    account_email = email
            if isinstance(auth_profile, dict):
                account_id_value = auth_profile.get("chatgpt_account_id")
                if isinstance(account_id_value, str):
                    account_id = account_id_value
                plan_value = auth_profile.get("chatgpt_plan_type")
                if isinstance(plan_value, str):
                    plan_type = plan_value

    provider = "api_key" if api_key else "chatgpt_login" if codex_login_configured else "none"
    return AuthSessionStatus(
        provider=provider,
        codex_cli_available=codex_cli_available,
        codex_login_configured=codex_login_configured,
        openai_api_key_configured=bool(api_key),
        account_email=account_email,
        account_id=account_id,
        plan_type=plan_type,
        last_refresh=last_refresh,
        login_command="codex login",
        logout_command="codex logout",
    )


def get_runtime_preference() -> str:
    env_value = _env_first("ELEMATE_RUNTIME_MODE", "FORGE_RUNTIME_MODE")
    if env_value in SUPPORTED_RUNTIME_MODES:
        return str(env_value)

    if PREFERENCES_PATH.exists():
        try:
            payload = json.loads(PREFERENCES_PATH.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            payload = {}
        if isinstance(payload, dict):
            preferred_mode = payload.get("preferred_mode")
            if preferred_mode in SUPPORTED_RUNTIME_MODES:
                return str(preferred_mode)
    return "auto"


def set_runtime_preference(preferred_mode: str) -> None:
    if preferred_mode not in SUPPORTED_RUNTIME_MODES:
        raise ValueError(f"Unsupported runtime mode: {preferred_mode}")
    PREFERENCES_PATH.parent.mkdir(parents=True, exist_ok=True)
    PREFERENCES_PATH.write_text(
        json.dumps({"preferred_mode": preferred_mode}, ensure_ascii=True, indent=2),
        encoding="utf-8",
    )


def get_runtime_status() -> RuntimeStatus:
    auth = get_auth_session_status()
    live_available = auth.openai_api_key_configured
    codex_available = auth.codex_cli_available and auth.codex_login_configured
    demo_available = _env_flag_first(("ELEMATE_ALLOW_DEMO_FALLBACK", "FORGE_ALLOW_DEMO_FALLBACK"), True)
    browser_channel = _env_first("ELEMATE_BROWSER_CHANNEL", "FORGE_BROWSER_CHANNEL", default="chrome")
    browser_executable_path = _env_first("ELEMATE_BROWSER_EXECUTABLE_PATH", "FORGE_BROWSER_EXECUTABLE_PATH")
    browser_available = _detect_browser(browser_channel, browser_executable_path)
    preferred_mode = get_runtime_preference()

    available_modes: list[str] = []
    if live_available:
        available_modes.append("live")
    if codex_available:
        available_modes.append("codex")
    if demo_available:
        available_modes.append("demo")

    if preferred_mode == "codex":
        if codex_available:
            selected_mode = "codex"
            reason = "Codex CLI is authenticated with ChatGPT login."
        elif live_available:
            selected_mode = "live"
            reason = "Preferred mode `codex` is unavailable, so the runtime fell back to API key mode."
        elif demo_available:
            selected_mode = "demo"
            reason = "Preferred mode `codex` is unavailable, so the runtime fell back to demo mode."
        else:
            selected_mode = "disabled"
            reason = "Codex login is unavailable and no fallback runtime is configured."
    elif preferred_mode == "live":
        if live_available:
            selected_mode = "live"
            reason = "OpenAI Responses API is configured."
        elif codex_available:
            selected_mode = "codex"
            reason = "Preferred mode `live` is unavailable, so the runtime fell back to ChatGPT login mode."
        elif demo_available:
            selected_mode = "demo"
            reason = "Preferred mode `live` is unavailable, so the runtime fell back to demo mode."
        else:
            selected_mode = "disabled"
            reason = "OPENAI_API_KEY is missing and no fallback runtime is configured."
    elif preferred_mode == "demo":
        if demo_available:
            selected_mode = "demo"
            reason = "Demo runtime was selected explicitly."
        elif codex_available:
            selected_mode = "codex"
            reason = "Preferred mode `demo` is unavailable, so the runtime fell back to ChatGPT login mode."
        elif live_available:
            selected_mode = "live"
            reason = "Preferred mode `demo` is unavailable, so the runtime fell back to API key mode."
        else:
            selected_mode = "disabled"
            reason = "Demo fallback is disabled and no live runtime is configured."
    else:
        if live_available:
            selected_mode = "live"
            reason = "OpenAI API key is configured, so API mode will be used by default."
        elif codex_available:
            selected_mode = "codex"
            reason = "ChatGPT login was detected, so Codex CLI will be used by default."
        elif demo_available:
            selected_mode = "demo"
            reason = "No live runtime is configured, so the dashboard will fall back to demo execution."
        else:
            selected_mode = "disabled"
            reason = "No authenticated runtime is configured and demo fallback is disabled."

    workspace_root = _env_first(
        "ELEMATE_WORKSPACE_ROOT",
        "FORGE_WORKSPACE_ROOT",
        default=str(Path(__file__).resolve().parents[4]),
    )

    return RuntimeStatus(
        selected_mode=selected_mode,
        preferred_mode=preferred_mode,
        available_modes=available_modes,
        auth_provider="chatgpt_login" if selected_mode == "codex" else "api_key" if selected_mode == "live" else auth.provider,
        live_mode_available=live_available,
        codex_mode_available=codex_available,
        demo_mode_available=demo_available,
        codex_cli_available=auth.codex_cli_available,
        codex_login_configured=auth.codex_login_configured,
        openai_api_key_configured=auth.openai_api_key_configured,
        auth_account_email=auth.account_email,
        auth_account_id=auth.account_id,
        auth_plan_type=auth.plan_type,
        auth_last_refresh=auth.last_refresh,
        auth_login_command=auth.login_command,
        auth_logout_command=auth.logout_command,
        browser_available=browser_available,
        browser_channel=browser_channel if browser_available else None,
        browser_executable_path=browser_executable_path,
        headless_browser=_env_flag_first(("ELEMATE_BROWSER_HEADLESS", "FORGE_BROWSER_HEADLESS"), True),
        model=os.getenv("OPENAI_MODEL", "gpt-5"),
        codex_model=_env_first("ELEMATE_CODEX_MODEL", "FORGE_CODEX_MODEL"),
        workspace_root=workspace_root,
        reason=reason,
    )


def _detect_browser(channel: str | None, executable_path: str | None) -> bool:
    if executable_path:
        return Path(executable_path).exists()

    known_apps = {
        "chrome": Path("/Applications/Google Chrome.app"),
        "msedge": Path("/Applications/Microsoft Edge.app"),
        "chromium": Path("/Applications/Chromium.app"),
    }
    if channel in known_apps:
        return known_apps[channel].exists()
    return False
