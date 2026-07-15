#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$ROOT/workers/api"
WRANGLER_TOML="$API_DIR/wrangler.toml"
DB_NAME="${DB_NAME:-rugspull}"
R2_BUCKET="${R2_BUCKET:-rugspull-metadata}"
REQUIRE_RPC_LOGS="${REQUIRE_RPC_LOGS:-1}"

cd "$ROOT"

configured_database_name() {
  awk -F= '/^[[:space:]]*database_name[[:space:]]*=/{ gsub(/[ "]/, "", $2); print $2; exit }' "$WRANGLER_TOML"
}

configured_database_id() {
  awk -F= '/^[[:space:]]*database_id[[:space:]]*=/{ gsub(/[ "]/, "", $2); print $2; exit }' "$WRANGLER_TOML"
}

configured_bucket_name() {
  awk -F= '/^[[:space:]]*bucket_name[[:space:]]*=/{ gsub(/[ "]/, "", $2); print $2; exit }' "$WRANGLER_TOML"
}

echo "Checking Wrangler remote bindings..."
TOML_DB_NAME="$(configured_database_name)"
TOML_DB_ID="$(configured_database_id)"
TOML_R2_BUCKET="$(configured_bucket_name)"
if [ "$TOML_DB_NAME" != "$DB_NAME" ]; then
  echo "wrangler.toml database_name '$TOML_DB_NAME' does not match DB_NAME '$DB_NAME'." >&2
  exit 1
fi
if [ -z "$TOML_DB_ID" ] || [ "$TOML_DB_ID" = "local-dev" ]; then
  echo "wrangler.toml database_id is still '$TOML_DB_ID'. Create a remote D1 database and replace this with its real id before deploy." >&2
  exit 1
fi
if [ "$TOML_R2_BUCKET" != "$R2_BUCKET" ]; then
  echo "wrangler.toml bucket_name '$TOML_R2_BUCKET' does not match R2_BUCKET '$R2_BUCKET'." >&2
  exit 1
fi

echo "Checking configured BSC RPC historical logs..."
if [ "$REQUIRE_RPC_LOGS" = "1" ]; then
  ./scripts/check-bsc-rpc-logs.sh
else
  if ./scripts/check-bsc-rpc-logs.sh; then
    echo "Configured RPC supports historical logs."
  else
    echo "Configured RPC does not support historical logs; continuing because REQUIRE_RPC_LOGS=0."
    echo "New rugs must be cached through /api/indexer/register-rug after create transactions."
  fi
fi

npm run build >/dev/null

cd "$API_DIR"

echo "Checking Cloudflare authentication..."
npx wrangler whoami >/dev/null

echo "Checking D1 database '$DB_NAME'..."
npx wrangler d1 info "$DB_NAME" >/dev/null

echo "Checking R2 bucket '$R2_BUCKET'..."
npx wrangler r2 bucket list | grep -Eq "(\"name\"[[:space:]]*:[[:space:]]*\"$R2_BUCKET\"|name:[[:space:]]+$R2_BUCKET)"

echo "Applying remote D1 migrations..."
npx wrangler d1 migrations apply "$DB_NAME" --remote

echo "Checking Worker secrets..."
SECRET_LIST="$(npx wrangler secret list)"
if printf '%s' "$SECRET_LIST" | grep -q '"name"[[:space:]]*:[[:space:]]*"TURNSTILE_SECRET"'; then
  echo "TURNSTILE_SECRET is configured."
else
  echo "TURNSTILE_SECRET is not configured; metadata/image uploads will remain disabled." >&2
fi
if printf '%s' "$SECRET_LIST" | grep -q '"name"[[:space:]]*:[[:space:]]*"ADMIN_TOKEN"'; then
  echo "ADMIN_TOKEN is configured."
else
  echo "ADMIN_TOKEN is not configured; manual indexer runs must be protected before deploy." >&2
  exit 1
fi

echo "Running Worker deploy dry-run..."
npx wrangler deploy --dry-run >/dev/null

echo "Cloudflare remote preflight passed."
