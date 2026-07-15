#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOYMENT_FILE="${E2E_DEPLOYMENT_FILE:-$ROOT/deployments/bsc-testnet-e2e.json}"

deployment_value() {
  node -e 'const d=require(process.argv[1]); const v=process.argv[2].split(".").reduce((x,k)=>x[k],d); process.stdout.write(String(v));' "$DEPLOYMENT_FILE" "$1"
}

RPC_URL="${RPC_URL:-https://data-seed-prebsc-1-s1.bnbchain.org:8545}"
WBNB="${WBNB:-0xae13d989dac2f0debff460ac112a837c89baa7cd}"
E2E_FACTORY="${E2E_FACTORY:-$(deployment_value shortDurationFactory)}"
FAILED_RUG="${FAILED_RUG:-$(deployment_value failedPathRug)}"
RUGGED_RUG="${RUGGED_RUG:-$(deployment_value successfulPathRug)}"
TOKEN_ADDRESS="${TOKEN_ADDRESS:-$(deployment_value successfulPathToken)}"
POOL_ADDRESS="${POOL_ADDRESS:-$(deployment_value successfulPathPool)}"
PROTOCOL_TREASURY="${PROTOCOL_TREASURY:-$(deployment_value protocolTreasury)}"
TEST_CONTRIBUTOR="${TEST_CONTRIBUTOR:-$(deployment_value testContributor)}"
ZERO="0x0000000000000000000000000000000000000000"

call() {
  cast call --rpc-url "$RPC_URL" "$@"
}

value() {
  awk 'NR == 1 { print $1 }'
}

lower() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}

require_eq() {
  local actual="$1"
  local expected="$2"
  local label="$3"
  if [ "$(lower "$actual")" != "$(lower "$expected")" ]; then
    echo "$label mismatch: got '$actual', expected '$expected'." >&2
    exit 1
  fi
}

require_gt_zero() {
  local actual="$1"
  local label="$2"
  if [ "${actual:-0}" = "0" ]; then
    echo "$label should be greater than zero." >&2
    exit 1
  fi
}

echo "Checking BSC Testnet E2E deployment via read-only RPC..."
CHAIN_ID="$(cast chain-id --rpc-url "$RPC_URL")"
require_eq "$CHAIN_ID" "97" "Chain id"
echo "Chain id: $CHAIN_ID"

FACTORY_WBNB="$(call "$E2E_FACTORY" 'WBNB()(address)' | value)"
FACTORY_RUGS="$(call "$E2E_FACTORY" 'allRugsLength()(uint256)' | value)"
FACTORY_FOUNDER_BPS="$(call "$E2E_FACTORY" 'founderBps()(uint16)' | value)"
FACTORY_SWAP_FEE_BPS="$(call "$E2E_FACTORY" 'swapFeeBps()(uint16)' | value)"
FACTORY_PROTOCOL_FEE_BPS="$(call "$E2E_FACTORY" 'protocolFeeBps()(uint16)' | value)"
FACTORY_MIN_LAUNCH_BPS="$(call "$E2E_FACTORY" 'minLaunchBps()(uint16)' | value)"
FACTORY_OPENING_CAP_BPS="$(call "$E2E_FACTORY" 'openingCapBps()(uint16)' | value)"
require_eq "$FACTORY_WBNB" "$WBNB" "E2E factory WBNB"
require_gt_zero "$FACTORY_RUGS" "E2E factory rug count"
require_eq "$FACTORY_FOUNDER_BPS" "4500" "E2E founder bps"
require_eq "$FACTORY_SWAP_FEE_BPS" "25" "E2E pool fee bps"
require_eq "$FACTORY_PROTOCOL_FEE_BPS" "5" "E2E protocol fee bps"
require_eq "$FACTORY_MIN_LAUNCH_BPS" "3000" "E2E minimum launch bps"
require_eq "$FACTORY_OPENING_CAP_BPS" "5000" "E2E opening cap bps"
echo "E2E factory: $E2E_FACTORY"
echo "Factory rugs: $FACTORY_RUGS"

echo "Checking failed launch RugInstance..."
FAILED_FACTORY="$(call "$FAILED_RUG" 'factory()(address)' | value)"
FAILED_STATUS="$(call "$FAILED_RUG" 'status()(uint8)' | value)"
FAILED_TOKEN="$(call "$FAILED_RUG" 'token()(address)' | value)"
FAILED_POOL="$(call "$FAILED_RUG" 'pool()(address)' | value)"
FAILED_TOTAL="$(call "$FAILED_RUG" 'totalContributed()(uint256)' | value)"
FAILED_MIN="$(call "$FAILED_RUG" 'minLaunchAmount()(uint256)' | value)"
require_eq "$FAILED_FACTORY" "$E2E_FACTORY" "Failed rug factory"
require_eq "$FAILED_STATUS" "1" "Failed rug status"
require_eq "$FAILED_TOKEN" "$ZERO" "Failed rug token"
require_eq "$FAILED_POOL" "$ZERO" "Failed rug pool"
if [ "$FAILED_TOTAL" -ge "$FAILED_MIN" ]; then
  echo "Failed rug totalContributed should be below minLaunchAmount." >&2
  exit 1
fi
echo "Failed rug: $FAILED_RUG"
echo "Failed total/min: $FAILED_TOTAL / $FAILED_MIN"

echo "Checking rugged launch RugInstance..."
RUGGED_FACTORY="$(call "$RUGGED_RUG" 'factory()(address)' | value)"
RUGGED_STATUS="$(call "$RUGGED_RUG" 'status()(uint8)' | value)"
RUGGED_TOKEN="$(call "$RUGGED_RUG" 'token()(address)' | value)"
RUGGED_POOL="$(call "$RUGGED_RUG" 'pool()(address)' | value)"
RUGGED_FOUNDER_REMAINING="$(call "$RUGGED_RUG" 'founderRemaining()(uint256)' | value)"
RUGGED_ACCEPTED="$(call "$RUGGED_RUG" 'acceptedContribution()(uint256)' | value)"
RUGGED_POOL_TOKEN_RESERVE="$(call "$RUGGED_RUG" 'poolTokenReserve()(uint256)' | value)"
RUGGED_POOL_QUOTE_RESERVE="$(call "$RUGGED_RUG" 'poolQuoteReserve()(uint256)' | value)"
RUGGED_TREASURY="$(call "$RUGGED_RUG" 'protocolTreasury()(address)' | value)"
CONTRIBUTOR_CLAIMED="$(call "$RUGGED_RUG" 'claimed(address)(bool)' "$TEST_CONTRIBUTOR" | value)"
require_eq "$RUGGED_FACTORY" "$E2E_FACTORY" "Rugged rug factory"
require_eq "$RUGGED_STATUS" "3" "Rugged rug status"
require_eq "$RUGGED_TOKEN" "$TOKEN_ADDRESS" "Rugged rug token"
require_eq "$RUGGED_POOL" "$POOL_ADDRESS" "Rugged rug pool"
require_eq "$RUGGED_FOUNDER_REMAINING" "0" "Rugged founder remaining"
require_gt_zero "$RUGGED_ACCEPTED" "Rugged accepted contribution"
require_gt_zero "$RUGGED_POOL_TOKEN_RESERVE" "Rugged initial pool token reserve"
require_gt_zero "$RUGGED_POOL_QUOTE_RESERVE" "Rugged initial pool quote reserve"
require_eq "$RUGGED_TREASURY" "$PROTOCOL_TREASURY" "Rugged protocol treasury"
require_eq "$CONTRIBUTOR_CLAIMED" "true" "Successful contributor claim state"
echo "Rugged rug: $RUGGED_RUG"
echo "Accepted contribution: $RUGGED_ACCEPTED"

echo "Checking RugToken..."
TOKEN_NAME="$(call "$TOKEN_ADDRESS" 'name()(string)')"
TOKEN_SYMBOL="$(call "$TOKEN_ADDRESS" 'symbol()(string)')"
TOKEN_TOTAL_SUPPLY="$(call "$TOKEN_ADDRESS" 'totalSupply()(uint256)' | value)"
TOKEN_DECIMALS="$(call "$TOKEN_ADDRESS" 'decimals()(uint8)' | value)"
TOKEN_POOL_BALANCE="$(call "$TOKEN_ADDRESS" 'balanceOf(address)(uint256)' "$POOL_ADDRESS" | value)"
RUG_TOKEN_TOTAL_SUPPLY="$(call "$RUGGED_RUG" 'tokenTotalSupply()(uint256)' | value)"
require_eq "$TOKEN_DECIMALS" "18" "Token decimals"
require_eq "$TOKEN_TOTAL_SUPPLY" "$RUG_TOKEN_TOTAL_SUPPLY" "Token totalSupply"
require_gt_zero "$TOKEN_TOTAL_SUPPLY" "Token totalSupply"
require_gt_zero "$TOKEN_POOL_BALANCE" "Token pool balance"
echo "Token name/symbol: $TOKEN_NAME / $TOKEN_SYMBOL"
echo "Token totalSupply: $TOKEN_TOTAL_SUPPLY"

echo "Checking RugPool..."
POOL_TOKEN="$(call "$POOL_ADDRESS" 'token()(address)' | value)"
POOL_WBNB="$(call "$POOL_ADDRESS" 'WBNB()(address)' | value)"
POOL_RUG="$(call "$POOL_ADDRESS" 'rugInstance()(address)' | value)"
POOL_INITIALIZED="$(call "$POOL_ADDRESS" 'initialized()(bool)' | value)"
POOL_RESERVES="$(call "$POOL_ADDRESS" 'getReserves()(uint112,uint112)')"
POOL_RESERVE_TOKEN="$(printf '%s\n' "$POOL_RESERVES" | awk 'NR == 1 { print $1 }')"
POOL_RESERVE_QUOTE="$(printf '%s\n' "$POOL_RESERVES" | awk 'NR == 2 { print $1 }')"
POOL_TOKEN_BALANCE="$(call "$TOKEN_ADDRESS" 'balanceOf(address)(uint256)' "$POOL_ADDRESS" | value)"
POOL_WBNB_BALANCE="$(call "$WBNB" 'balanceOf(address)(uint256)' "$POOL_ADDRESS" | value)"
TREASURY_WBNB="$(call "$WBNB" 'balanceOf(address)(uint256)' "$PROTOCOL_TREASURY" | value)"
FEE_AFTER_CREATION="$(deployment_value protocolTreasuryWbnb.afterCreation)"
FEE_AFTER_USER_TRADES="$(deployment_value protocolTreasuryWbnb.afterUserTrades)"
FEE_FINAL="$(deployment_value protocolTreasuryWbnb.afterFounderRugAndPostRugTrade)"
require_eq "$POOL_TOKEN" "$TOKEN_ADDRESS" "Pool token"
require_eq "$POOL_WBNB" "$WBNB" "Pool WBNB"
require_eq "$POOL_RUG" "$RUGGED_RUG" "Pool RugInstance"
require_eq "$POOL_INITIALIZED" "true" "Pool initialized"
require_gt_zero "$POOL_RESERVE_TOKEN" "Pool token reserve"
require_gt_zero "$POOL_RESERVE_QUOTE" "Pool quote reserve"
require_eq "$POOL_TOKEN_BALANCE" "$POOL_RESERVE_TOKEN" "Pool token balance/reserve"
require_eq "$POOL_WBNB_BALANCE" "$POOL_RESERVE_QUOTE" "Pool WBNB balance/reserve"
require_eq "$TREASURY_WBNB" "$FEE_FINAL" "Protocol treasury final WBNB"
if [ "$FEE_AFTER_USER_TRADES" -le "$FEE_AFTER_CREATION" ] || [ "$FEE_FINAL" -le "$FEE_AFTER_USER_TRADES" ]; then
  echo "Protocol treasury did not increase across user trades and founder rug." >&2
  exit 1
fi
echo "Pool reserves: token=$POOL_RESERVE_TOKEN quote=$POOL_RESERVE_QUOTE"
echo "Treasury WBNB: $TREASURY_WBNB"

echo "BSC Testnet E2E read-only check passed."
