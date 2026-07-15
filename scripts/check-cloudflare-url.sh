#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WRANGLER_TOML="$ROOT/workers/api/wrangler.toml"
WORKER_URL="${WORKER_URL:-${1:-}}"
BODY_FILE=""
CURL=(curl -fsS --max-time 20)

cleanup() {
  if [ -n "$BODY_FILE" ]; then
    rm -f "$BODY_FILE"
  fi
}
trap cleanup EXIT

toml_var() {
  local key="$1"
  awk -F= -v key="$key" '$1 ~ "^[[:space:]]*" key "[[:space:]]*$" { gsub(/^[[:space:]]+|[[:space:]]+$/, "", $2); gsub(/^"|"$/, "", $2); print $2; exit }' "$WRANGLER_TOML"
}

json_field() {
  local field="$1"
  node -e '
const field = process.argv[1];
let data = "";
process.stdin.on("data", (chunk) => data += chunk);
process.stdin.on("end", () => {
  const value = JSON.parse(data)[field];
  if (value === undefined || value === null) process.exit(2);
  process.stdout.write(String(value));
});
' "$field"
}

require_contains() {
  local url="$1"
  local expected="$2"
  "${CURL[@]}" "$url" | grep -q "$expected"
}

if [ -z "$WORKER_URL" ]; then
  echo "WORKER_URL is required. Example: WORKER_URL=https://rugspull-api.example.workers.dev $0" >&2
  exit 1
fi

BASE="${WORKER_URL%/}"
EXPECTED_CHAIN_ID="${CHAIN_ID:-$(toml_var CHAIN_ID)}"
EXPECTED_FACTORY="${FACTORY_ADDRESS:-$(toml_var FACTORY_ADDRESS)}"
RUG_ROUTE_ADDRESS="${RUG_ROUTE_ADDRESS:-}"
if [ -z "$RUG_ROUTE_ADDRESS" ] && [ "$EXPECTED_CHAIN_ID" = "97" ]; then
  RUG_ROUTE_ADDRESS="$(node -e 'const d=require(process.argv[1]); process.stdout.write(d.successfulPathRug);' "$ROOT/deployments/bsc-testnet-e2e.json")"
fi
SPARKLINE_ADDRESS="${RUG_ROUTE_ADDRESS:-$EXPECTED_FACTORY}"

echo "Checking deployed Cloudflare Worker at $BASE..."

HEALTH="$("${CURL[@]}" "$BASE/api/health")"
printf '%s' "$HEALTH" | grep -q '"ok":true'
printf '%s' "$HEALTH" | grep -q '"service":"rugspull-api"'

CONFIG="$("${CURL[@]}" "$BASE/api/config")"
CONFIG_CHAIN_ID="$(printf '%s' "$CONFIG" | json_field chainId)"
CONFIG_FACTORY="$(printf '%s' "$CONFIG" | json_field factory)"
if [ "$CONFIG_CHAIN_ID" != "$EXPECTED_CHAIN_ID" ]; then
  echo "Deployed chainId '$CONFIG_CHAIN_ID' does not match expected '$EXPECTED_CHAIN_ID'." >&2
  exit 1
fi
CONFIG_FACTORY_LOWER="$(printf '%s' "$CONFIG_FACTORY" | tr '[:upper:]' '[:lower:]')"
EXPECTED_FACTORY_LOWER="$(printf '%s' "$EXPECTED_FACTORY" | tr '[:upper:]' '[:lower:]')"
if [ "$CONFIG_FACTORY_LOWER" != "$EXPECTED_FACTORY_LOWER" ]; then
  echo "Deployed factory '$CONFIG_FACTORY' does not match expected '$EXPECTED_FACTORY'." >&2
  exit 1
fi
printf '%s' "$CONFIG" | grep -q '"financialTruth":"BSC contracts"'
UPLOADS_PROTECTED="$(printf '%s' "$CONFIG" | json_field uploadsProtected)"

INDEXER_STATUS="$("${CURL[@]}" "$BASE/api/indexer/status")"
printf '%s' "$INDEXER_STATUS" | grep -q '"chainId":'"$EXPECTED_CHAIN_ID"
INDEXER_WARNINGS="$(printf '%s' "$INDEXER_STATUS" | node -e '
let data="";
process.stdin.on("data", (chunk) => data += chunk);
process.stdin.on("end", () => process.stdout.write(String(JSON.parse(data).warnings?.length ?? 0)));
')"
if [ "$INDEXER_WARNINGS" != "0" ]; then
  echo "Deployed indexer reports $INDEXER_WARNINGS warning(s)." >&2
  printf '%s\n' "$INDEXER_STATUS" >&2
  exit 1
fi
"${CURL[@]}" "$BASE/api/rugs?limit=1" | grep -q '"rugs"'
"${CURL[@]}" "$BASE/api/market/sparklines?chainId=$EXPECTED_CHAIN_ID&rugs=$SPARKLINE_ADDRESS" | grep -q '"sparklines"'
if [ -n "$RUG_ROUTE_ADDRESS" ]; then
  "${CURL[@]}" "$BASE/api/rugs/$EXPECTED_CHAIN_ID/$RUG_ROUTE_ADDRESS/market?limit=20" | grep -q '"points"'
fi
"${CURL[@]}" -X POST "$BASE/api/metadata/init" | grep -q '"immutable":true'

UPLOAD_STATUS="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 -X POST \
  -H 'content-type: application/json' --data '{"name":"Smoke","symbol":"SMOKE","description":"Smoke","image":""}' \
  "$BASE/api/metadata/finalize")"
if [ "$UPLOADS_PROTECTED" = "true" ] && [ "$UPLOAD_STATUS" != "403" ]; then
  echo "Protected metadata upload returned HTTP $UPLOAD_STATUS without a Turnstile token; expected 403." >&2
  exit 1
fi
if [ "$UPLOADS_PROTECTED" = "false" ] && [ "$UPLOAD_STATUS" != "503" ]; then
  echo "Unconfigured metadata upload returned HTTP $UPLOAD_STATUS; expected fail-closed 503." >&2
  exit 1
fi

RUN_STATUS="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 -X POST "$BASE/api/indexer/run")"
if [ "$RUN_STATUS" != "401" ] && [ "$RUN_STATUS" != "403" ]; then
  echo "Unauthenticated indexer run returned HTTP $RUN_STATUS; expected 401/403 with ADMIN_TOKEN configured." >&2
  exit 1
fi

BODY_FILE="$(mktemp)"
for endpoint in buy sell rug claim; do
  STATUS="$(curl -sS -o "$BODY_FILE" -w '%{http_code}' --max-time 20 -X POST "$BASE/api/$endpoint")"
  if [ "$STATUS" != "405" ]; then
    echo "POST /api/$endpoint returned HTTP $STATUS; expected 405 non-custodial rejection." >&2
    cat "$BODY_FILE" >&2 || true
    exit 1
  fi
  grep -q 'Financial transactions must be signed directly' "$BODY_FILE"
done
rm -f "$BODY_FILE"
BODY_FILE=""

require_contains "$BASE/" '<div id="root">'
require_contains "$BASE/create" '<div id="root">'
require_contains "$BASE/docs/risk" '<div id="root">'
require_contains "$BASE/ops" '<div id="root">'
require_contains "$BASE/rug/$EXPECTED_CHAIN_ID/$SPARKLINE_ADDRESS" '<div id="root">'

echo "Cloudflare deployed URL check passed."
