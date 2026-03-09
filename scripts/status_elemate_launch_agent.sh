#!/bin/zsh
set -euo pipefail

LABEL="com.elemate.agent.daemon"
PLIST_PATH="$HOME/Library/LaunchAgents/$LABEL.plist"
USER_DOMAIN="gui/$(id -u)"

if [[ ! -f "$PLIST_PATH" ]]; then
  echo "not-installed"
  exit 0
fi

if launchctl print "$USER_DOMAIN/$LABEL" >/dev/null 2>&1; then
  echo "running"
  exit 0
fi

echo "installed"
