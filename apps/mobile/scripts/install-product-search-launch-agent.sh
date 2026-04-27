#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LABEL="com.otnal.product-search-proxy"
PLIST_PATH="$HOME/Library/LaunchAgents/$LABEL.plist"
NODE_PATH="$(command -v node || true)"
LOG_DIR="$HOME/Library/Logs/otnal"
DOMAIN="gui/$(id -u)"

if [[ -z "$NODE_PATH" ]]; then
  echo "Node.js is required. Install it on the Mac mini first:"
  echo "  brew install node"
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents"
mkdir -p "$LOG_DIR"
: > "$LOG_DIR/product-search-proxy.out.log"
: > "$LOG_DIR/product-search-proxy.err.log"

if [[ ! -f "$APP_DIR/.env.local" ]]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env.local"
fi

cat > "$PLIST_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>WorkingDirectory</key>
  <string>$APP_DIR</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_PATH</string>
    <string>$APP_DIR/scripts/product-search-proxy.mjs</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$LOG_DIR/product-search-proxy.out.log</string>
  <key>StandardErrorPath</key>
  <string>$LOG_DIR/product-search-proxy.err.log</string>
</dict>
</plist>
PLIST

launchctl bootout "$DOMAIN/$LABEL" >/dev/null 2>&1 || true
launchctl bootstrap "$DOMAIN" "$PLIST_PATH"
launchctl enable "$DOMAIN/$LABEL"
launchctl kickstart -k "$DOMAIN/$LABEL"

echo "Installed $LABEL"
echo "Plist: $PLIST_PATH"
echo "Logs: $LOG_DIR/product-search-proxy.out.log"
