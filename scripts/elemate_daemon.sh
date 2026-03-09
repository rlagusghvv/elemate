#!/bin/zsh
set -euo pipefail

ROOT_DIR="${ELEMATE_REPO_ROOT:-${FORGE_REPO_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}}"
API_DIR="$ROOT_DIR/apps/api"
WEB_DIR="$ROOT_DIR/apps/web"
LOG_DIR="$ROOT_DIR/logs"
VENV_PYTHON="$API_DIR/.venv/bin/python"

mkdir -p "$LOG_DIR"

if [[ ! -x "$VENV_PYTHON" ]]; then
  echo "API 가상환경이 없습니다. 먼저 ./scripts/setup_elemate_desktop.sh 를 실행하세요." >&2
  exit 1
fi

if [[ ! -f "$WEB_DIR/.next/BUILD_ID" ]]; then
  echo "웹 빌드가 없습니다. 먼저 ./scripts/setup_elemate_desktop.sh 를 실행하세요." >&2
  exit 1
fi

API_PID=""
WEB_PID=""

cleanup() {
  if [[ -n "$API_PID" ]] && kill -0 "$API_PID" >/dev/null 2>&1; then
    kill "$API_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "$WEB_PID" ]] && kill -0 "$WEB_PID" >/dev/null 2>&1; then
    kill "$WEB_PID" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

cd "$API_DIR"
"$VENV_PYTHON" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 >>"$LOG_DIR/api.stdout.log" 2>>"$LOG_DIR/api.stderr.log" &
API_PID=$!

cd "$WEB_DIR"
npm run start -- --hostname 127.0.0.1 --port 3000 >>"$LOG_DIR/web.stdout.log" 2>>"$LOG_DIR/web.stderr.log" &
WEB_PID=$!

while true; do
  if ! kill -0 "$API_PID" >/dev/null 2>&1; then
    wait "$API_PID" || true
    echo "API process stopped unexpectedly." >&2
    exit 1
  fi
  if ! kill -0 "$WEB_PID" >/dev/null 2>&1; then
    wait "$WEB_PID" || true
    echo "Web process stopped unexpectedly." >&2
    exit 1
  fi
  sleep 2
done
