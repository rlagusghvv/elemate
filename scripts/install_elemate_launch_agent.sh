#!/bin/zsh
set -euo pipefail

ROOT_DIR="${ELEMATE_REPO_ROOT:-${FORGE_REPO_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}}"
LABEL="com.elemate.agent.daemon"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
PLIST_PATH="$LAUNCH_AGENTS_DIR/$LABEL.plist"
LOG_DIR="$ROOT_DIR/logs"
USER_DOMAIN="gui/$(id -u)"

mkdir -p "$LAUNCH_AGENTS_DIR" "$LOG_DIR"

cat >"$PLIST_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>$ROOT_DIR/scripts/elemate_daemon.sh</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$ROOT_DIR</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>EnvironmentVariables</key>
  <dict>
    <key>ELEMATE_REPO_ROOT</key>
    <string>$ROOT_DIR</string>
    <key>PATH</key>
    <string>$PATH</string>
  </dict>
  <key>StandardOutPath</key>
  <string>$LOG_DIR/launchd.stdout.log</string>
  <key>StandardErrorPath</key>
  <string>$LOG_DIR/launchd.stderr.log</string>
</dict>
</plist>
PLIST

launchctl bootout "$USER_DOMAIN/$LABEL" >/dev/null 2>&1 || true
launchctl bootstrap "$USER_DOMAIN" "$PLIST_PATH"
launchctl enable "$USER_DOMAIN/$LABEL" >/dev/null 2>&1 || true
launchctl kickstart -k "$USER_DOMAIN/$LABEL"

echo "백그라운드 실행이 켜졌습니다."
echo "plist: $PLIST_PATH"
