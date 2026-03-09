#!/bin/zsh
set -euo pipefail

LABEL="com.elemate.agent.daemon"
PLIST_PATH="$HOME/Library/LaunchAgents/$LABEL.plist"
USER_DOMAIN="gui/$(id -u)"

launchctl bootout "$USER_DOMAIN/$LABEL" >/dev/null 2>&1 || true
rm -f "$PLIST_PATH"

echo "백그라운드 실행이 해제되었습니다."
