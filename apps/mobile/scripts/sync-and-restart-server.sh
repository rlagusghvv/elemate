#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_DIR="$(git -C "$APP_DIR" rev-parse --show-toplevel)"
BRANCH="${1:-main}"

if ! git -C "$REPO_DIR" diff --quiet || ! git -C "$REPO_DIR" diff --cached --quiet; then
  echo "Repository has local changes. Commit/stash them before syncing."
  git -C "$REPO_DIR" status --short
  exit 1
fi

echo "Fetching origin/$BRANCH..."
git -C "$REPO_DIR" fetch origin "$BRANCH"
git -C "$REPO_DIR" checkout "$BRANCH"
git -C "$REPO_DIR" pull --ff-only origin "$BRANCH"

cd "$APP_DIR"
npm ci
npm run server:install
npm run server:status

echo "Server synced and restarted from origin/$BRANCH."
