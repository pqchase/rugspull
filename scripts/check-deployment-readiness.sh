#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$ROOT/workers/api"
WRANGLER_TOML="$API_DIR/wrangler.toml"
DB_NAME="${DB_NAME:-rugspull}"
R2_BUCKET="${R2_BUCKET:-rugspull-metadata}"
CHECK_NETWORK="${CHECK_NETWORK:-1}"
REQUIRE_RPC_LOGS="${REQUIRE_RPC_LOGS:-1}"
ALLOW_UNPROTECTED_UPLOADS="${ALLOW_UNPROTECTED_UPLOADS:-0}"
FAILURES=0

cd "$ROOT"

toml_var() {
  local key="$1"
  awk -F= -v key="$key" '$1 ~ "^[[:space:]]*" key "[[:space:]]*$" { gsub(/^[[:space:]"]+|[[:space:]"]+$/, "", $2); print $2; exit }' "$WRANGLER_TOML"
}

pass() {
  printf 'PASS %s\n' "$1"
}

warn() {
  printf 'WARN %s\n' "$1"
}

fail() {
  printf 'FAIL %s\n' "$1"
  FAILURES=$((FAILURES + 1))
}

check_command() {
  if command -v "$1" >/dev/null 2>&1; then
    pass "$1 is installed"
  else
    fail "$1 is not installed"
  fi
}

echo "Checking local deployment prerequisites..."
for command in node npm npx forge cast rg curl sqlite3; do
  check_command "$command"
done

echo
echo "Checking Wrangler configuration..."
TOML_DB_NAME="$(toml_var database_name)"
TOML_DB_ID="$(toml_var database_id)"
TOML_R2_BUCKET="$(toml_var bucket_name)"
RPC_URL_CONFIGURED="$(toml_var RPC_URL)"
RPC_URLS_CONFIGURED="$(toml_var RPC_URLS)"
FACTORY_ADDRESS_CONFIGURED="$(toml_var FACTORY_ADDRESS)"
FACTORY_SOURCES_CONFIGURED="$(toml_var FACTORY_SOURCES)"

if [ "$TOML_DB_NAME" = "$DB_NAME" ]; then
  pass "D1 database_name matches DB_NAME ($DB_NAME)"
else
  fail "D1 database_name '$TOML_DB_NAME' does not match DB_NAME '$DB_NAME'"
fi
if [ -n "$TOML_DB_ID" ] && [ "$TOML_DB_ID" != "local-dev" ]; then
  pass "D1 database_id is configured"
else
  fail "D1 database_id is '$TOML_DB_ID'; run ./scripts/prepare-cloudflare-remote.sh or D1_DATABASE_ID=... ./scripts/configure-cloudflare-bindings.sh"
fi
if [ "$TOML_R2_BUCKET" = "$R2_BUCKET" ]; then
  pass "R2 bucket_name matches R2_BUCKET ($R2_BUCKET)"
else
  fail "R2 bucket_name '$TOML_R2_BUCKET' does not match R2_BUCKET '$R2_BUCKET'"
fi
if [ -n "$RPC_URL_CONFIGURED" ] || [ -n "$RPC_URLS_CONFIGURED" ]; then
  pass "Worker RPC_URL/RPC_URLS is configured"
else
  fail "Worker RPC_URL/RPC_URLS is missing"
fi
if [ -n "$FACTORY_ADDRESS_CONFIGURED" ]; then
  pass "Worker FACTORY_ADDRESS is configured"
else
  fail "Worker FACTORY_ADDRESS is missing"
fi
if [ -n "$FACTORY_SOURCES_CONFIGURED" ]; then
  pass "Worker FACTORY_SOURCES is configured"
else
  warn "Worker FACTORY_SOURCES is missing; indexer will fall back to FACTORY_ADDRESS@FACTORY_DEPLOY_BLOCK"
fi

echo
echo "Checking optional API keys and secrets in the local shell..."
if [ -n "${BSCSCAN_API_KEY:-}" ]; then
  pass "BSCSCAN_API_KEY is present for real BscScan verification"
else
  warn "BSCSCAN_API_KEY is not set; BscScan scripts can only run VERIFY_DRY_RUN=1"
fi
if [ -n "${ADMIN_TOKEN:-}" ]; then
  pass "ADMIN_TOKEN is present in shell for configure-cloudflare-secrets.sh"
else
  warn "ADMIN_TOKEN is not set; configure-cloudflare-secrets.sh will generate one and not store it locally"
fi
if [ -n "${TURNSTILE_SECRET:-}" ]; then
  pass "TURNSTILE_SECRET is present in shell"
else
  warn "TURNSTILE_SECRET is not present in shell; checking the deployed Worker secret next"
fi
if [ -n "${VITE_TURNSTILE_SITE_KEY:-}" ]; then
  pass "VITE_TURNSTILE_SITE_KEY is present for the frontend build"
elif [ "$ALLOW_UNPROTECTED_UPLOADS" = "1" ]; then
  warn "VITE_TURNSTILE_SITE_KEY is missing; accepting a test-only readiness exception while production uploads remain disabled"
else
  fail "VITE_TURNSTILE_SITE_KEY is missing; set it or use ALLOW_UNPROTECTED_UPLOADS=1 for an explicit test-only exception"
fi

echo
echo "Checking Cloudflare authentication..."
if (cd "$API_DIR" && npx wrangler whoami >/dev/null 2>&1); then
  pass "Wrangler is authenticated"
  if (cd "$API_DIR" && npx wrangler d1 info "$DB_NAME" >/dev/null 2>&1); then
    pass "Remote D1 database '$DB_NAME' is accessible"
  else
    fail "Remote D1 database '$DB_NAME' is not accessible"
  fi
  if (cd "$API_DIR" && npx wrangler r2 bucket list 2>/dev/null | grep -Eq "(\"name\"[[:space:]]*:[[:space:]]*\"$R2_BUCKET\"|name:[[:space:]]+$R2_BUCKET)"); then
    pass "Remote R2 bucket '$R2_BUCKET' is accessible"
  else
    fail "Remote R2 bucket '$R2_BUCKET' is not accessible"
  fi
  SECRET_LIST="$(cd "$API_DIR" && npx wrangler secret list 2>/dev/null || true)"
  if printf '%s' "$SECRET_LIST" | grep -q '"name"[[:space:]]*:[[:space:]]*"ADMIN_TOKEN"'; then
    pass "Worker ADMIN_TOKEN secret is configured"
  else
    fail "Worker ADMIN_TOKEN secret is missing"
  fi
  if printf '%s' "$SECRET_LIST" | grep -q '"name"[[:space:]]*:[[:space:]]*"TURNSTILE_SECRET"'; then
    pass "Worker TURNSTILE_SECRET secret is configured"
  elif [ "$ALLOW_UNPROTECTED_UPLOADS" = "1" ]; then
    warn "Worker TURNSTILE_SECRET is missing; accepting a test-only readiness exception while production uploads remain disabled"
  else
    fail "Worker TURNSTILE_SECRET secret is missing; configure it or use ALLOW_UNPROTECTED_UPLOADS=1 for an explicit test-only exception"
  fi
else
  fail "Wrangler is not authenticated; run npx wrangler login or set CLOUDFLARE_API_TOKEN"
fi

echo
if [ "$CHECK_NETWORK" = "1" ]; then
  echo "Checking configured BSC RPC historical logs..."
  if ./scripts/check-bsc-rpc-logs.sh; then
    pass "Configured RPC supports required historical eth_getLogs ranges"
  elif [ "$REQUIRE_RPC_LOGS" = "0" ]; then
    warn "Configured RPC does not support historical eth_getLogs; relying on register-rug fallback for new Rug cache rows"
  else
    fail "Configured RPC did not pass historical eth_getLogs check"
  fi
else
  warn "Skipping RPC historical log check because CHECK_NETWORK=0"
fi

echo
if [ "$FAILURES" -eq 0 ]; then
  echo "Deployment readiness check passed."
else
  echo "Deployment readiness check found $FAILURES blocking issue(s)." >&2
  exit 1
fi
