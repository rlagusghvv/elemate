#!/bin/zsh
set -euo pipefail

LABEL="com.otnal.product-search-proxy"
PLIST_PATH="$HOME/Library/LaunchAgents/$LABEL.plist"
DOMAIN="gui/$(id -u)"

launchctl bootout "$DOMAIN/$LABEL" >/dev/null 2>&1 || true
rm -f "$PLIST_PATH"

echo "Uninstalled $LABEL"
