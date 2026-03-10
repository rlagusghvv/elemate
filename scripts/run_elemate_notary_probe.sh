#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROFILE="${ELEMATE_NOTARY_PROFILE:-elemate-notary}"
KEYCHAIN_PATH="${ELEMATE_NOTARY_KEYCHAIN:-$HOME/Library/Keychains/login.keychain-db}"
POLL_INTERVAL_SECONDS="${ELEMATE_NOTARY_POLL_INTERVAL_SECONDS:-30}"
TIMEOUT_SECONDS="${ELEMATE_NOTARY_TIMEOUT_SECONDS:-1200}"
STAMP="$(date +%Y%m%d-%H%M%S)"
WORK_DIR="$ROOT_DIR/artifacts/notary-probe/$STAMP"
APP_DIR="$WORK_DIR/Probe.app"
ZIP_PATH="$WORK_DIR/Probe.zip"
SUBMISSION_JSON="$WORK_DIR/submission.json"
STATUS_JSON="$WORK_DIR/status.json"
LOG_JSON="$WORK_DIR/log.json"

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

stop_with_guide() {
  local title="$1"
  local body="$2"
  cat >&2 <<MSG

$title
$body

기본값
- notary profile: $PROFILE
- keychain: $KEYCHAIN_PATH

예시
1. 인증서가 없다면, Keychain Access에 Developer ID Application 인증서를 먼저 설치합니다.
2. notary profile이 없다면 아래 명령으로 저장합니다.
   xcrun notarytool store-credentials "$PROFILE" --apple-id "YOUR_APPLE_ID" --team-id "YOUR_TEAM_ID" --password "YOUR_APP_SPECIFIC_PASSWORD" --keychain "$KEYCHAIN_PATH"

MSG
  exit 1
}

find_identity() {
  security find-identity -v -p codesigning "$KEYCHAIN_PATH" 2>/dev/null | awk -F'"' '/Developer ID Application:/ {print $2; exit}'
}

require_command "xcrun" "Xcode Command Line Tools가 없습니다." "notarytool과 codesign을 사용하려면 Xcode Command Line Tools가 필요합니다."
require_command "clang" "컴파일 도구가 없습니다." "작은 probe 앱을 만들려면 clang이 필요합니다."
require_command "security" "macOS 보안 도구가 없습니다." "Developer ID 인증서를 찾기 위해 security 명령이 필요합니다."
require_command "codesign" "코드 서명 도구가 없습니다." "probe 앱을 서명하려면 codesign이 필요합니다."

IDENTITY="$(find_identity || true)"
if [[ -z "$IDENTITY" ]]; then
  stop_with_guide \
    "Developer ID Application 인증서를 찾지 못했습니다." \
    "이 Mac의 키체인에 공개 배포용 Developer ID Application 인증서와 개인 키가 설치되어 있어야 합니다."
fi

mkdir -p "$APP_DIR/Contents/MacOS"

cat > "$WORK_DIR/probe.c" <<'C'
#include <stdio.h>
int main(void) {
  puts("EleMate notarization probe");
  return 0;
}
C

cat > "$APP_DIR/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>CFBundleExecutable</key>
    <string>Probe</string>
    <key>CFBundleIdentifier</key>
    <string>ai.elemate.notaryprobe.$STAMP</string>
    <key>CFBundleName</key>
    <string>Probe</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>1.$STAMP</string>
    <key>CFBundleVersion</key>
    <string>$STAMP</string>
    <key>LSMinimumSystemVersion</key>
    <string>13.0</string>
  </dict>
</plist>
PLIST

clang "$WORK_DIR/probe.c" -o "$APP_DIR/Contents/MacOS/Probe"
codesign --force --sign "$IDENTITY" --options runtime --timestamp --deep --verbose "$APP_DIR"
codesign --verify --deep --strict --verbose=2 "$APP_DIR"
/usr/bin/ditto -c -k --keepParent --sequesterRsrc "$APP_DIR" "$ZIP_PATH"

cat <<MSG

EleMate local notary probe
- work dir: $WORK_DIR
- notary profile: $PROFILE
- keychain: $KEYCHAIN_PATH
- signing identity: $IDENTITY

지금 probe 앱을 제출합니다.

MSG

if ! xcrun notarytool submit "$ZIP_PATH" \
  --keychain-profile "$PROFILE" \
  --keychain "$KEYCHAIN_PATH" \
  --output-format json \
  --no-wait > "$SUBMISSION_JSON"; then
  stop_with_guide \
    "notarytool submit이 실패했습니다." \
    "notary profile이 없거나, Apple ID / 앱 전용 암호 / Team ID 조합이 이 Mac에서 유효하지 않을 수 있습니다."
fi

SUBMISSION_ID="$(python3 - <<PY
import json
with open("$SUBMISSION_JSON", "r", encoding="utf-8") as fh:
    print(json.load(fh)["id"])
PY
)"

echo "submission id: $SUBMISSION_ID"
echo "$SUBMISSION_ID" > "$WORK_DIR/submission-id.txt"

DEADLINE=$(( $(date +%s) + TIMEOUT_SECONDS ))
while [[ "$(date +%s)" -lt "$DEADLINE" ]]; do
  xcrun notarytool info "$SUBMISSION_ID" \
    --keychain-profile "$PROFILE" \
    --keychain "$KEYCHAIN_PATH" \
    --output-format json > "$STATUS_JSON"

  STATUS="$(python3 - <<PY
import json
with open("$STATUS_JSON", "r", encoding="utf-8") as fh:
    print(str(json.load(fh).get("status", "")).strip())
PY
)"

  echo "Probe notarization status ($SUBMISSION_ID): $STATUS"

  if [[ "$STATUS" == "Accepted" ]]; then
    echo
    echo "Accepted"
    echo "status json: $STATUS_JSON"
    exit 0
  fi

  if [[ "$STATUS" == "Invalid" || "$STATUS" == "Rejected" ]]; then
    xcrun notarytool log "$SUBMISSION_ID" "$LOG_JSON" \
      --keychain-profile "$PROFILE" \
      --keychain "$KEYCHAIN_PATH"
    echo
    echo "Rejected"
    echo "status json: $STATUS_JSON"
    echo "log json: $LOG_JSON"
    exit 1
  fi

  sleep "$POLL_INTERVAL_SECONDS"
done

cat <<MSG

Timed out after $(( TIMEOUT_SECONDS / 60 )) minutes.

- submission id: $SUBMISSION_ID
- submission json: $SUBMISSION_JSON
- latest status json: $STATUS_JSON

나중에 다시 보려면:
./scripts/check_elemate_notary_status.sh $SUBMISSION_ID

MSG
exit 2
