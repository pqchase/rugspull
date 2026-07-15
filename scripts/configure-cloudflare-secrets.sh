#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$ROOT/workers/api"

cd "$API_DIR"

echo "Checking Cloudflare authentication..."
npx wrangler whoami >/dev/null

put_secret() {
  local name="$1"
  local value="$2"
  if [ -z "$value" ]; then
    echo "Refusing to set empty secret '$name'." >&2
    exit 1
  fi
  printf '%s' "$value" | npx wrangler secret put "$name"
}

if [ -n "${ADMIN_TOKEN:-}" ]; then
  echo "Setting ADMIN_TOKEN from environment..."
  put_secret ADMIN_TOKEN "$ADMIN_TOKEN"
else
  echo "Generating and setting ADMIN_TOKEN..."
  GENERATED_ADMIN_TOKEN="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("base64url"))')"
  put_secret ADMIN_TOKEN "$GENERATED_ADMIN_TOKEN"
  echo "Generated ADMIN_TOKEN was installed but not stored. Re-run with ADMIN_TOKEN=... if you need a known manual indexer token."
fi

if [ -n "${TURNSTILE_SECRET:-}" ]; then
  echo "Setting TURNSTILE_SECRET from environment..."
  put_secret TURNSTILE_SECRET "$TURNSTILE_SECRET"
else
  echo "TURNSTILE_SECRET not provided; metadata/image uploads will remain disabled."
fi

if [ -n "${WORKER_RPC_URL:-}" ]; then
  echo "Setting RPC_URL from environment..."
  put_secret RPC_URL "$WORKER_RPC_URL"
else
  echo "WORKER_RPC_URL not provided; the Worker will use public RPC_URLS fallbacks only."
fi

echo "Cloudflare Worker secrets are configured."
