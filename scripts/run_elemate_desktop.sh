#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -d "$ROOT_DIR/apps/api/.venv" || ! -d "$ROOT_DIR/node_modules" || ! -f "$ROOT_DIR/apps/web/.next/BUILD_ID" ]]; then
  echo "처음 실행이라 EleMate 준비를 먼저 진행합니다."
  "$ROOT_DIR/scripts/setup_elemate_desktop.sh"
fi

npm --workspace apps/desktop run start
