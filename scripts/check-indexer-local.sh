#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$ROOT/workers/api"
PORT="${PORT:-8788}"
INSPECTOR_PORT="${INSPECTOR_PORT:-9238}"
BASE="http://127.0.0.1:$PORT"
LOG_FILE="${TMPDIR:-/tmp}/rugspull-indexer-local.log"
STATE_DIR="$ROOT/.wrangler/indexer-state"
E2E_DEPLOYMENT_FILE="${E2E_DEPLOYMENT_FILE:-$ROOT/deployments/bsc-testnet-e2e.json}"
deployment_value() {
  node -e 'const d=require(process.argv[1]); process.stdout.write(String(d[process.argv[2]]));' "$E2E_DEPLOYMENT_FILE" "$1"
}
E2E_FACTORY="${E2E_FACTORY:-$(deployment_value shortDurationFactory)}"
E2E_DEPLOY_BLOCK="${E2E_DEPLOY_BLOCK:-$(deployment_value factoryDeployBlock)}"
KNOWN_RUG="${KNOWN_RUG:-$(deployment_value successfulPathRug)}"
KNOWN_RUG_LOWER="$(printf '%s' "$KNOWN_RUG" | tr '[:upper:]' '[:lower:]')"
REQUIRE_INDEXED_RUG="${REQUIRE_INDEXED_RUG:-0}"
CURL=(curl -fsS --max-time 30)

cd "$ROOT"
npm run build -w @rugspull/web >/dev/null
npm run build -w @rugspull/api >/dev/null
rm -rf "$STATE_DIR"

cd "$API_DIR"
npx wrangler d1 migrations apply rugspull --local --persist-to "$STATE_DIR" >/dev/null

npx wrangler dev --local --port "$PORT" --inspector-port "$INSPECTOR_PORT" \
  --var ADMIN_TOKEN:local-indexer-admin \
  --var CHAIN_ID:97 \
  --var RPC_URLS:https://bsc-testnet-rpc.publicnode.com \
  --var FACTORY_ADDRESS:"$E2E_FACTORY" \
  --var FACTORY_DEPLOY_BLOCK:"$E2E_DEPLOY_BLOCK" \
  --var FACTORY_SOURCES:"$E2E_FACTORY@$E2E_DEPLOY_BLOCK" \
  --persist-to "$STATE_DIR" >"$LOG_FILE" 2>&1 &
PID=$!
cleanup() {
  kill "$PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

READY=0
for _ in $(seq 1 120); do
  if "${CURL[@]}" "$BASE/api/health" >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 0.5
done
if [ "$READY" -ne 1 ]; then
  echo "Wrangler dev server did not become ready at $BASE" >&2
  tail -n 80 "$LOG_FILE" >&2 || true
  exit 1
fi

RUN_RESPONSE="$("${CURL[@]}" -X POST -H 'authorization: Bearer local-indexer-admin' "$BASE/api/indexer/run")"
printf '%s' "$RUN_RESPONSE" | grep -q '"ok":true'
"${CURL[@]}" "$BASE/api/indexer/status" | grep -q '"chainId":97'
if "${CURL[@]}" "$BASE/api/rugs?limit=20" | grep -q "$KNOWN_RUG_LOWER"; then
  "${CURL[@]}" "$BASE/api/rugs/97/$KNOWN_RUG" | grep -q '"status":"Rugged"'
  "${CURL[@]}" "$BASE/api/rugs/97/$KNOWN_RUG/events" | grep -q 'RugPulled'
  echo "Indexer local check passed at $BASE"
else
  echo "Indexer endpoint is reachable, but the configured public RPC did not return the known historical Rug."
  printf 'Indexer response: %s\n' "$RUN_RESPONSE"
  echo "Set RPC_URL to a BSC Testnet RPC with eth_getLogs/archive support to verify historical event indexing."
  if [ "$REQUIRE_INDEXED_RUG" = "1" ]; then
    exit 1
  fi
fi
