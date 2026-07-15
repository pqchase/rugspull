#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$ROOT/workers/api"
PORT="${PORT:-8787}"
INSPECTOR_PORT="${INSPECTOR_PORT:-9237}"
BASE="http://127.0.0.1:$PORT"
LOG_FILE="${TMPDIR:-/tmp}/rugspull-wrangler-local.log"
BODY_FILE=""
FACTORY_ADDRESS="$(awk -F= '/^[[:space:]]*FACTORY_ADDRESS[[:space:]]*=/{ gsub(/[ "\r]/, "", $2); print $2; exit }' "$API_DIR/wrangler.toml")"
CURL=(curl -fsS --max-time 15)

cd "$ROOT"
npm run build -w @rugspull/web >/dev/null
npm run build -w @rugspull/api >/dev/null

cd "$API_DIR"
npx wrangler d1 migrations apply rugspull --local --persist-to "$ROOT/.wrangler/state" >/dev/null

npx wrangler dev --local --port "$PORT" --inspector-port "$INSPECTOR_PORT" \
  --var ALLOW_UNPROTECTED_UPLOADS:1 --persist-to "$ROOT/.wrangler/state" >"$LOG_FILE" 2>&1 &
PID=$!
cleanup() {
  kill "$PID" >/dev/null 2>&1 || true
  if [ -n "$BODY_FILE" ]; then
    rm -f "$BODY_FILE"
  fi
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

"${CURL[@]}" "$BASE/api/health" | grep -q '"ok":true'
"${CURL[@]}" "$BASE/api/config" | grep -q '"chainId":56'
"${CURL[@]}" "$BASE/api/config" | grep -q '"uploadsEnabled":true'
"${CURL[@]}" "$BASE/api/rugs" | grep -q '"rugs"'
"${CURL[@]}" "$BASE/api/market/sparklines?chainId=56&rugs=$FACTORY_ADDRESS" | grep -q '"sparklines"'
"${CURL[@]}" "$BASE/" | grep -q '<div id="root">'
"${CURL[@]}" "$BASE/rug/56/$FACTORY_ADDRESS" | grep -q '<div id="root">'
"${CURL[@]}" "$BASE/ops" | grep -q '<div id="root">'
"${CURL[@]}" -X POST "$BASE/api/metadata/init" | grep -q '"immutable":true'

BODY_FILE="$(mktemp)"
for endpoint in buy sell rug claim; do
  STATUS="$(curl -sS -o "$BODY_FILE" -w '%{http_code}' --max-time 15 -X POST "$BASE/api/$endpoint")"
  if [ "$STATUS" != "405" ]; then
    echo "POST /api/$endpoint returned HTTP $STATUS; expected 405 non-custodial rejection." >&2
    cat "$BODY_FILE" >&2 || true
    exit 1
  fi
  grep -q 'Financial transactions must be signed directly' "$BODY_FILE"
done
rm -f "$BODY_FILE"
BODY_FILE=""

ASSET_RESPONSE="$("${CURL[@]}" -X POST "$BASE/api/assets/finalize" \
  -H 'content-type: image/png' \
  --data-binary $'\x89PNG\r\n\x1a\n')"
ASSET_URI="$(printf '%s' "$ASSET_RESPONSE" | node -e 'let data=""; process.stdin.on("data",(x)=>data+=x); process.stdin.on("end",()=>process.stdout.write(JSON.parse(data).uri));')"
ASSET_PATH="${ASSET_URI#r2://}"
ASSET_BYTES="$("${CURL[@]}" "$BASE/api/r2/$ASSET_PATH" | wc -c | tr -d ' ')"
test "$ASSET_BYTES" = "8"

METADATA_RESPONSE="$("${CURL[@]}" -X POST "$BASE/api/metadata/finalize" \
  -H 'content-type: application/json' \
  --data '{"name":"Local Check Rug","symbol":"LCR","description":"Local Cloudflare check","image":"'"$ASSET_URI"'"}')"
METADATA_URI="$(printf '%s' "$METADATA_RESPONSE" | node -e 'let data=""; process.stdin.on("data",(x)=>data+=x); process.stdin.on("end",()=>process.stdout.write(JSON.parse(data).uri));')"
METADATA_PATH="${METADATA_URI#r2://}"
"${CURL[@]}" "$BASE/api/r2/$METADATA_PATH" | grep -q '"symbol":"LCR"'

echo "Cloudflare local check passed at $BASE"
