#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

missing=0

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    missing=1
  fi
}

need node
need npm
need npx
need forge
need cast
need rg

if [ "$missing" -ne 0 ]; then
  echo "Install Node.js, Foundry, and ripgrep before running local checks." >&2
  exit 1
fi

node --version
npm --version
forge --version | head -n 1
cast --version | head -n 1
rg --version | head -n 1
(cd "$ROOT/workers/api" && npx --no-install wrangler --version)
