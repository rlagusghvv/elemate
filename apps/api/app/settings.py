from __future__ import annotations

import os
from pathlib import Path


def _path_from_env(name: str, default: Path) -> Path:
    value = os.getenv(name)
    if not value:
        return default
    return Path(value).expanduser().resolve()


BASE_DIR = _path_from_env("ELEMATE_BASE_DIR", Path(__file__).resolve().parents[3])
DATA_DIR = _path_from_env("ELEMATE_DATA_DIR", BASE_DIR / "apps" / "api" / "data")
ARTIFACTS_DIR = _path_from_env("ELEMATE_ARTIFACTS_DIR", BASE_DIR / "artifacts")
LOGS_DIR = _path_from_env("ELEMATE_LOGS_DIR", BASE_DIR / "logs")
SCRIPTS_DIR = _path_from_env("ELEMATE_SCRIPTS_DIR", BASE_DIR / "scripts")
PUBLIC_ARTIFACT_PREFIX = "/artifacts"

DATA_DIR.mkdir(parents=True, exist_ok=True)
ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
LOGS_DIR.mkdir(parents=True, exist_ok=True)
