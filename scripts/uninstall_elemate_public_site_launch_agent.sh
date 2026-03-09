#!/bin/zsh
set -euo pipefail

LABEL="com.elemate.public-site"
PLIST_PATH="$HOME/Library/LaunchAgents/$LABEL.plist"
USER_DOMAIN="gui/$(id -u)"

launchctl bootout "$USER_DOMAIN/$LABEL" >/dev/null 2>&1 || true
rm -f "$PLIST_PATH"

echo "공개 사이트 상시 실행이 해제되었습니다."
