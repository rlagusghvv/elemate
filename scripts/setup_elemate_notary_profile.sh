#!/bin/zsh
set -euo pipefail

PROFILE="${ELEMATE_NOTARY_PROFILE:-elemate-notary}"
KEYCHAIN_PATH="${ELEMATE_NOTARY_KEYCHAIN:-$HOME/Library/Keychains/login.keychain-db}"
DEFAULT_TEAM_ID="${ELEMATE_NOTARY_TEAM_ID:-}"
DEFAULT_APPLE_ID="${APPLE_ID:-}"

require_command() {
  local command_name="$1"
  local title="$2"
  local why="$3"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    cat >&2 <<MSG

$title
$why

필요한 것
- $command_name

MSG
    exit 1
  fi
}

detect_team_id() {
  security find-identity -v -p codesigning "$KEYCHAIN_PATH" 2>/dev/null | sed -n 's/.*Developer ID Application: .* (\([A-Z0-9]\{10\}\)).*/\1/p' | head -n 1
}

prompt_value() {
  local label="$1"
  local default_value="$2"
  local value=""
  if [[ -n "$default_value" ]]; then
    printf "%s [%s]: " "$label" "$default_value" >&2
  else
    printf "%s: " "$label" >&2
  fi
  read value
  if [[ -z "$value" ]]; then
    value="$default_value"
  fi
  printf "%s" "$value"
}

require_command "xcrun" "Xcode Command Line Tools가 없습니다." "notarytool을 쓰려면 Xcode Command Line Tools가 필요합니다."
require_command "security" "macOS 보안 도구가 없습니다." "키체인에 notary profile을 저장하려면 security 명령이 필요합니다."

if [[ -z "$DEFAULT_TEAM_ID" ]]; then
  DEFAULT_TEAM_ID="$(detect_team_id || true)"
fi

APPLE_ID_INPUT="$(prompt_value 'Apple ID 이메일' "$DEFAULT_APPLE_ID")"
TEAM_ID_INPUT="$(prompt_value 'Team ID' "$DEFAULT_TEAM_ID")"

if [[ -z "$APPLE_ID_INPUT" || -z "$TEAM_ID_INPUT" ]]; then
  cat >&2 <<MSG

Apple ID와 Team ID가 모두 필요합니다.

MSG
  exit 1
fi

printf "App 전용 암호: " >&2
read -s APP_SPECIFIC_PASSWORD
printf "\n" >&2

if [[ -z "$APP_SPECIFIC_PASSWORD" ]]; then
  cat >&2 <<MSG

App 전용 암호가 비어 있습니다.

MSG
  exit 1
fi

xcrun notarytool store-credentials "$PROFILE" \
  --apple-id "$APPLE_ID_INPUT" \
  --team-id "$TEAM_ID_INPUT" \
  --password "$APP_SPECIFIC_PASSWORD" \
  --keychain "$KEYCHAIN_PATH"

cat <<MSG

EleMate notary profile 저장 완료
- profile: $PROFILE
- keychain: $KEYCHAIN_PATH

다음 실행:
./scripts/run_elemate_notary_probe.sh

MSG
