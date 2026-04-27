#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LABEL="com.otnal.product-search-proxy"
PLIST_PATH="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$HOME/Library/Logs/otnal"
DOMAIN="gui/$(id -u)"
PORT="8787"

if [[ -f "$APP_DIR/.env.local" ]]; then
  ENV_PORT="$(grep -E '^PORT=' "$APP_DIR/.env.local" | tail -n 1 | cut -d '=' -f 2- || true)"
  ENV_PORT="${ENV_PORT%\"}"
  ENV_PORT="${ENV_PORT#\"}"
  ENV_PORT="${ENV_PORT%\'}"
  ENV_PORT="${ENV_PORT#\'}"

  if [[ -n "$ENV_PORT" ]]; then
    PORT="$ENV_PORT"
  fi
fi

if [[ ! -f "$PLIST_PATH" ]]; then
  echo "$LABEL is not installed"
  exit 0
fi

launchctl print "$DOMAIN/$LABEL" || true
echo "Health:"
curl -sS "http://127.0.0.1:$PORT/health" || true
echo
echo "Recent logs:"
tail -n 20 "$LOG_DIR/product-search-proxy.out.log" 2>/dev/null || true
tail -n 20 "$LOG_DIR/product-search-proxy.err.log" 2>/dev/null || true
