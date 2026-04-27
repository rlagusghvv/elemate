#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

function require_command() {
  local command_name="$1"
  local hint="$2"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "$command_name is required."
    echo "$hint"
    exit 1
  fi
}

require_command git "Install Xcode Command Line Tools or Git first: xcode-select --install"
require_command node "Install Node.js first: brew install node"
require_command npm "Install Node.js first: brew install node"

cd "$APP_DIR"

echo "Installing Node dependencies..."
npm ci

if [[ ! -f "$APP_DIR/.env.local" ]]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env.local"
  echo "Created $APP_DIR/.env.local"
  echo "Fill NAVER_CLIENT_ID and NAVER_CLIENT_SECRET, then rerun:"
  echo "  cd $APP_DIR"
  echo "  npm run server:bootstrap"
  exit 1
fi

ensure_env_value NAVER_CLIENT_ID
ensure_env_value NAVER_CLIENT_SECRET

echo "Installing LaunchAgent..."
npm run server:install
npm run server:status

echo "Mac mini server is ready."

function ensure_env_value() {
  local key="$1"
  local value

  value="$(grep -E "^$key=" "$APP_DIR/.env.local" | tail -n 1 | cut -d '=' -f 2- || true)"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"

  if [[ -z "$value" || "$value" == your_* ]]; then
    echo "$key is missing in $APP_DIR/.env.local"
    echo "Fill it, then rerun:"
    echo "  cd $APP_DIR"
    echo "  npm run server:bootstrap"
    exit 1
  fi
}
