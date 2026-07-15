#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WRANGLER_TOML="${WRANGLER_TOML:-$ROOT/workers/api/wrangler.toml}"

toml_var() {
  local key="$1"
  awk -F= -v key="$key" '$1 ~ "^[[:space:]]*" key "[[:space:]]*$" { gsub(/^[[:space:]"]+|[[:space:]"]+$/, "", $2); print $2; exit }' "$WRANGLER_TOML"
}

RPC_URL="${RPC_URL:-$(toml_var RPC_URL)}"
RPC_URLS="${RPC_URLS:-$(toml_var RPC_URLS)}"
FACTORY_SOURCES="${FACTORY_SOURCES:-$(toml_var FACTORY_SOURCES)}"
FACTORY_ADDRESS="${FACTORY_ADDRESS:-$(toml_var FACTORY_ADDRESS)}"
FACTORY_DEPLOY_BLOCK="${FACTORY_DEPLOY_BLOCK:-$(toml_var FACTORY_DEPLOY_BLOCK)}"
INDEXER_BLOCK_RANGE="${INDEXER_BLOCK_RANGE:-$(toml_var INDEXER_BLOCK_RANGE)}"
INDEXER_BLOCK_RANGE="${INDEXER_BLOCK_RANGE:-50000}"
RUG_CREATED_TOPIC="0x40f71ec9a6e3ecda59b1a42d5ee6b4214a14d762bf10b3c363c8ddb487298870"

ENDPOINTS=()
if [ -n "$RPC_URL" ]; then ENDPOINTS+=("$RPC_URL"); fi
if [ -n "$RPC_URLS" ]; then
  IFS=',' read -r -a EXTRA_ENDPOINTS <<< "$RPC_URLS"
  for endpoint in "${EXTRA_ENDPOINTS[@]}"; do
    endpoint="$(printf '%s' "$endpoint" | xargs)"
    if [ -n "$endpoint" ]; then ENDPOINTS+=("$endpoint"); fi
  done
fi

if [ "${#ENDPOINTS[@]}" -eq 0 ]; then
  echo "RPC_URL or RPC_URLS is required." >&2
  exit 1
fi
if [ -z "$FACTORY_SOURCES" ]; then
  FACTORY_SOURCES="$FACTORY_ADDRESS@$FACTORY_DEPLOY_BLOCK"
fi
if [ -z "$FACTORY_SOURCES" ] || [ "$FACTORY_SOURCES" = "@" ]; then
  echo "FACTORY_SOURCES or FACTORY_ADDRESS/FACTORY_DEPLOY_BLOCK is required." >&2
  exit 1
fi

check_endpoint() {
  local rpc_url="$1"
  local latest_block
  latest_block="$(cast block-number --rpc-url "$rpc_url")" || return 1
  IFS=',' read -r -a SOURCES <<< "$FACTORY_SOURCES"
  for source in "${SOURCES[@]}"; do
    address="${source%@*}"
    from_block="${source#*@}"
    if [ "$address" = "$from_block" ]; then from_block="$FACTORY_DEPLOY_BLOCK"; fi
    if [ -z "$address" ] || [ -z "$from_block" ]; then
      echo "Invalid factory source '$source'." >&2
      return 1
    fi
    to_block=$((from_block + INDEXER_BLOCK_RANGE - 1))
    if [ "$to_block" -gt "$latest_block" ]; then to_block="$latest_block"; fi
    echo "Checking eth_getLogs on $rpc_url for $address RugCreated blocks $from_block-$to_block..."
    node --input-type=module - "$rpc_url" "$address" "$from_block" "$to_block" "$RUG_CREATED_TOPIC" <<'NODE' || return 1
const [rpcUrl, address, fromBlockRaw, toBlockRaw, topic] = process.argv.slice(2);
const toHex = (value) => `0x${BigInt(value).toString(16)}`;
const body = {
  jsonrpc: "2.0",
  id: 1,
  method: "eth_getLogs",
  params: [{
    address,
    fromBlock: toHex(fromBlockRaw),
    toBlock: toHex(toBlockRaw),
    topics: [topic],
  }],
};

try {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.message ?? "eth_getLogs error");
  if (!Array.isArray(payload.result)) throw new Error("eth_getLogs did not return a result array");
  console.log(`eth_getLogs OK, returned ${payload.result.length} logs.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
NODE
  done
}

for endpoint in "${ENDPOINTS[@]}"; do
  if check_endpoint "$endpoint"; then
    echo "BSC RPC historical log check passed with $endpoint."
    exit 0
  fi
done

echo "No configured RPC endpoint passed historical log checks." >&2
exit 1
