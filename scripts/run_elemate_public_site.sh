#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WEB_DIR="$ROOT_DIR/apps/web"
PORT="${ELEMATE_PUBLIC_PORT:-4010}"

if [[ ! -f "$WEB_DIR/.env.production.local" ]]; then
  echo "공개 사이트 환경 파일이 없습니다. 먼저 apps/web/.env.production.local 을 준비하세요." >&2
  exit 1
fi

if [[ ! -f "$WEB_DIR/.next/BUILD_ID" ]]; then
  echo "공개 사이트 빌드가 없습니다. 먼저 ./scripts/setup_elemate_public_site.sh 를 실행하세요." >&2
  exit 1
fi

cd "$WEB_DIR"
NODE_ENV=production npm run start -- --hostname 0.0.0.0 --port "$PORT"
