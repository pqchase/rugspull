#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$ROOT/workers/api"
DB_NAME="${DB_NAME:-rugspull}"
R2_BUCKET="${R2_BUCKET:-rugspull-metadata}"
D1_LOCATION="${D1_LOCATION:-}"
R2_LOCATION="${R2_LOCATION:-}"
WORKER_RPC_URL="${WORKER_RPC_URL:-}"

cd "$API_DIR"

echo "Checking Cloudflare authentication..."
npx wrangler whoami >/dev/null

extract_database_id() {
  node -e 'let data = ""; process.stdin.on("data", (chunk) => data += chunk); process.stdin.on("end", () => { const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.exec(data)?.[0]; if (uuid) process.stdout.write(uuid); });'
}

echo "Ensuring D1 database '$DB_NAME'..."
if DB_INFO="$(npx wrangler d1 info "$DB_NAME" --json 2>/dev/null)"; then
  D1_DATABASE_ID="$(printf '%s' "$DB_INFO" | extract_database_id)"
else
  CREATE_ARGS=(d1 create "$DB_NAME")
  if [ -n "$D1_LOCATION" ]; then CREATE_ARGS+=(--location "$D1_LOCATION"); fi
  CREATE_OUTPUT="$(npx wrangler "${CREATE_ARGS[@]}" 2>&1)"
  printf '%s\n' "$CREATE_OUTPUT"
  D1_DATABASE_ID="$(printf '%s' "$CREATE_OUTPUT" | extract_database_id)"
fi
if [ -z "${D1_DATABASE_ID:-}" ]; then
  echo "Could not determine D1 database id for '$DB_NAME'." >&2
  exit 1
fi
echo "D1 database id: $D1_DATABASE_ID"

echo "Ensuring R2 bucket '$R2_BUCKET'..."
if npx wrangler r2 bucket list | grep -Eq "(\"name\"[[:space:]]*:[[:space:]]*\"$R2_BUCKET\"|name:[[:space:]]+$R2_BUCKET)"; then
  echo "R2 bucket exists."
else
  CREATE_R2_ARGS=(r2 bucket create "$R2_BUCKET")
  if [ -n "$R2_LOCATION" ]; then CREATE_R2_ARGS+=(--location "$R2_LOCATION"); fi
  npx wrangler "${CREATE_R2_ARGS[@]}"
fi

cd "$ROOT"
D1_DATABASE_ID="$D1_DATABASE_ID" DB_NAME="$DB_NAME" R2_BUCKET="$R2_BUCKET" \
  ./scripts/configure-cloudflare-bindings.sh

echo "Cloudflare remote resources are prepared. Run ./scripts/check-cloudflare-remote.sh next."
