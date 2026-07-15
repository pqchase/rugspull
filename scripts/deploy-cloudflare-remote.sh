#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_LOG="$(mktemp)"

cd "$ROOT"

cleanup() {
  rm -f "$DEPLOY_LOG"
}
trap cleanup EXIT

discover_worker_url() {
  grep -Eo 'https://[^[:space:]]+\.workers\.dev' "$1" | head -n 1 || true
}

if [ -n "${DISCOVER_WORKER_URL_FROM_LOG:-}" ]; then
  discover_worker_url "$DISCOVER_WORKER_URL_FROM_LOG"
  exit 0
fi

echo "Running local deployment gate..."
npm run check:release:local

echo "Preparing Cloudflare remote resources..."
./scripts/prepare-cloudflare-remote.sh

echo "Configuring Cloudflare Worker secrets..."
./scripts/configure-cloudflare-secrets.sh

echo "Running Cloudflare remote preflight..."
./scripts/check-cloudflare-remote.sh

echo "Deploying Cloudflare Worker and static assets..."
npm run deploy:cloudflare 2>&1 | tee "$DEPLOY_LOG"

DEPLOYED_WORKER_URL="${WORKER_URL:-}"
if [ -z "$DEPLOYED_WORKER_URL" ]; then
  DEPLOYED_WORKER_URL="$(discover_worker_url "$DEPLOY_LOG")"
fi

if [ -n "$DEPLOYED_WORKER_URL" ]; then
  echo "Checking deployed Worker URL $DEPLOYED_WORKER_URL..."
  ./scripts/check-cloudflare-url.sh "$DEPLOYED_WORKER_URL"
else
  echo "Could not discover a workers.dev URL from deploy output."
  echo "Run WORKER_URL=https://your-worker.example npm run check:cloudflare:url after deploy."
fi

echo "Cloudflare remote deployment completed."
