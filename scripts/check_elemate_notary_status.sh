#!/bin/zsh
set -euo pipefail

if [[ $# -lt 1 ]]; then
  cat >&2 <<'MSG'
usage:
  ./scripts/check_elemate_notary_status.sh <submission-id>
MSG
  exit 1
fi

SUBMISSION_ID="$1"
PROFILE="${ELEMATE_NOTARY_PROFILE:-elemate-notary}"
KEYCHAIN_PATH="${ELEMATE_NOTARY_KEYCHAIN:-$HOME/Library/Keychains/login.keychain-db}"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
WORK_DIR="$ROOT_DIR/artifacts/notary-probe/check-$STAMP"
STATUS_JSON="$WORK_DIR/status.json"
LOG_JSON="$WORK_DIR/log.json"

mkdir -p "$WORK_DIR"

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

echo "submission id: $SUBMISSION_ID"
echo "status: $STATUS"
echo "status json: $STATUS_JSON"

if [[ "$STATUS" == "Invalid" || "$STATUS" == "Rejected" ]]; then
  xcrun notarytool log "$SUBMISSION_ID" "$LOG_JSON" \
    --keychain-profile "$PROFILE" \
    --keychain "$KEYCHAIN_PATH"
  echo "log json: $LOG_JSON"
fi
