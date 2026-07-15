#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

step() {
  printf '\n==> %s\n' "$1"
}

cd "$ROOT"

step "Dependency audit"
npm run check:audit

step "Local release gate"
RUN_RENDER_CHECK=1 SKIP_NETWORK_CHECKS=1 npm run check:local

echo
echo "Local release gate passed."
