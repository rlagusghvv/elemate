#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
API_DIR="$ROOT_DIR/apps/api"
WEB_DIR="$ROOT_DIR/apps/web"
VENV_DIR="$API_DIR/.venv"

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

EleMate 준비를 계속하려면 먼저 한 가지를 설치해야 합니다.

$title
$why

지금 하면 되는 일
1. 아래 페이지를 열어 설치합니다.
   $url
2. 설치가 끝나면 터미널을 완전히 닫았다가 다시 엽니다.
3. 아래 명령을 다시 실행합니다.
   ./scripts/setup_elemate_desktop.sh

MSG

  open_help_page "$url"
  exit 1
}

if ! command -v python3 >/dev/null 2>&1; then
  stop_with_guide \
    "기본 실행 도구가 아직 없습니다." \
    "EleMate가 로컬 에이전트를 준비하려면 Python 3가 필요합니다." \
    "https://www.python.org/downloads/macos/"
fi

if ! command -v npm >/dev/null 2>&1; then
  stop_with_guide \
    "앱 설치 도구가 아직 없습니다." \
    "EleMate 화면과 데스크탑 앱을 준비하려면 Node.js가 필요합니다." \
    "https://nodejs.org/en/download"
fi

if [[ ! -d "$VENV_DIR" ]]; then
  python3 -m venv "$VENV_DIR"
fi

source "$VENV_DIR/bin/activate"
pip install -e "$API_DIR"

cd "$ROOT_DIR"
npm install
npm --workspace apps/web run build

cat <<MSG

EleMate 준비가 끝났습니다.

다음 순서
1. 아래 명령으로 EleMate를 엽니다.
   ./scripts/run_elemate_desktop.sh
2. 앱 안에서 `AI 연결 시작`을 누릅니다.
3. 필요하면 `항상 켜짐`도 앱 안에서 켭니다.

MSG
