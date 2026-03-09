#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WEB_DIR="$ROOT_DIR/apps/web"
ENV_FILE="$WEB_DIR/.env.production.local"

open_help_page() {
  local url="$1"
  if command -v open >/dev/null 2>&1; then
    open "$url" >/dev/null 2>&1 || true
  fi
}

stop_with_guide() {
  local title="$1"
  local why="$2"
  local url="$3"

  cat >&2 <<MSG

EleMate 공개 사이트 준비를 계속하려면 먼저 한 가지를 설치해야 합니다.

$title
$why

지금 하면 되는 일
1. 아래 페이지를 열어 설치합니다.
   $url
2. 설치가 끝나면 터미널을 완전히 닫았다가 다시 엽니다.
3. 아래 명령을 다시 실행합니다.
   ./scripts/setup_elemate_public_site.sh

MSG

  open_help_page "$url"
  exit 1
}

if ! command -v npm >/dev/null 2>&1; then
  stop_with_guide \
    "앱 설치 도구가 아직 없습니다." \
    "EleMate 공개 사이트를 빌드하려면 Node.js가 필요합니다." \
    "https://nodejs.org/en/download"
fi

if [[ ! -f "$ENV_FILE" ]]; then
  cat >&2 <<MSG

공개 사이트 환경 파일이 아직 없습니다.

먼저 아래 파일을 복사한 뒤, 다운로드 링크와 도메인에 맞게 값을 채워 주세요.
1. cp apps/web/.env.production.local.example apps/web/.env.production.local
2. apps/web/.env.production.local 수정
3. 다시 ./scripts/setup_elemate_public_site.sh 실행

MSG
  exit 1
fi

cd "$ROOT_DIR"
npm install
npm --workspace apps/web run build

cat <<MSG

EleMate 공개 사이트 빌드가 끝났습니다.

다음 순서
1. 테스트 실행
   ./scripts/run_elemate_public_site.sh
2. 백그라운드 상시 실행
   ./scripts/install_elemate_public_site_launch_agent.sh

MSG
