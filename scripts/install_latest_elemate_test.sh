#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DIST_DIR="$ROOT_DIR/apps/desktop/dist"
DMG_PATH="${1:-$DIST_DIR/EleMate-arm64.dmg}"
APP_NAME="EleMate.app"
MOUNT_POINT="/Volumes/EleMateTest"
TARGET_APP="/Applications/$APP_NAME"

if [[ ! -f "$DMG_PATH" ]]; then
  echo "DMG not found: $DMG_PATH" >&2
  exit 1
fi

if mount | grep -q "on $MOUNT_POINT "; then
  diskutil unmount force "$MOUNT_POINT" >/dev/null 2>&1 || true
fi

hdiutil attach "$DMG_PATH" -mountpoint "$MOUNT_POINT" -nobrowse -quiet
trap 'hdiutil detach "$MOUNT_POINT" -quiet >/dev/null 2>&1 || true' EXIT

if [[ ! -d "$MOUNT_POINT/$APP_NAME" ]]; then
  echo "Mounted DMG does not contain $APP_NAME" >&2
  exit 1
fi

mkdir -p /Applications
rsync -a --delete "$MOUNT_POINT/$APP_NAME/" "$TARGET_APP/"

echo "Installed to $TARGET_APP"
