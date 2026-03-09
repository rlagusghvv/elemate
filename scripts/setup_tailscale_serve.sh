#!/bin/zsh
set -euo pipefail

if ! command -v tailscale >/dev/null 2>&1; then
  echo "원격 연결 도구가 아직 설치되지 않았습니다. 먼저 Tailscale 앱을 설치하세요."
  exit 1
fi

if ! tailscale status --json >/tmp/elemate-tailscale-status.json 2>/dev/null; then
  echo "원격 연결 로그인이 필요합니다. 먼저 Tailscale 앱에서 로그인을 완료하세요."
  exit 1
fi

tailscale serve --bg 3000

echo
echo "휴대폰 접속이 설정되었습니다."
echo "접속 주소는 아래 명령으로 확인할 수 있습니다:"
echo "tailscale status --json"
echo "현재 공개 상태 확인: tailscale serve status --json"
