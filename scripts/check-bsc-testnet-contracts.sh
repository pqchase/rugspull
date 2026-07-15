#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOYMENT_RECORD="${DEPLOYMENT_RECORD:-$ROOT/deployments/bsc-testnet.json}"
RECORDED_FACTORY="$(node -e 'const fs = require("fs"); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1], "utf8")).factory)' "$DEPLOYMENT_RECORD")"
RPC_URL="${RPC_URL:-https://data-seed-prebsc-1-s1.bnbchain.org:8545}"
FACTORY_ADDRESS="${FACTORY_ADDRESS:-$RECORDED_FACTORY}"
RUG_ADDRESS="${RUG_ADDRESS:-}"
TOKEN_ADDRESS="${TOKEN_ADDRESS:-}"
POOL_ADDRESS="${POOL_ADDRESS:-}"
VERIFY_FACTORY_PROFILE="${VERIFY_FACTORY_PROFILE:-1}"

call() {
  cast call --rpc-url "$RPC_URL" "$@"
}

lower() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}

echo "Checking BSC Testnet RPC..."
CHAIN_ID="$(cast chain-id --rpc-url "$RPC_URL")"
test "$CHAIN_ID" = "97"
echo "Chain id: $CHAIN_ID"

echo "Checking RugFactory $FACTORY_ADDRESS..."
FACTORY_VERSION="$(call "$FACTORY_ADDRESS" 'VERSION()(string)')"
FACTORY_WBNB="$(call "$FACTORY_ADDRESS" 'WBNB()(address)')"
FACTORY_OWNER="$(call "$FACTORY_ADDRESS" 'owner()(address)')"
FACTORY_TREASURY="$(call "$FACTORY_ADDRESS" 'protocolTreasury()(address)')"
FACTORY_PAUSED="$(call "$FACTORY_ADDRESS" 'createPaused()(bool)')"
FACTORY_FEE="$(call "$FACTORY_ADDRESS" 'creationFee()(uint256)')"
FACTORY_MIN_STAKE="$(call "$FACTORY_ADDRESS" 'minCreatorStake()(uint256)')"
FACTORY_FOUNDER_BPS="$(call "$FACTORY_ADDRESS" 'founderBps()(uint16)')"
FACTORY_SWAP_FEE_BPS="$(call "$FACTORY_ADDRESS" 'swapFeeBps()(uint16)')"
FACTORY_PROTOCOL_FEE_BPS="$(call "$FACTORY_ADDRESS" 'protocolFeeBps()(uint16)')"
FACTORY_MIN_LAUNCH_BPS="$(call "$FACTORY_ADDRESS" 'minLaunchBps()(uint16)')"
FACTORY_OPENING_CAP_BPS="$(call "$FACTORY_ADDRESS" 'openingCapBps()(uint16)')"
FACTORY_OPENING_DURATION="$(call "$FACTORY_ADDRESS" 'openingDuration()(uint40)')"
FACTORY_UNLOCK_DELAY="$(call "$FACTORY_ADDRESS" 'founderUnlockDelay()(uint40)')"
FACTORY_RUGS="$(call "$FACTORY_ADDRESS" 'allRugsLength()(uint256)')"
test "$FACTORY_VERSION" = '"0.4.0-bsc-mvp"'
if [ "$VERIFY_FACTORY_PROFILE" = "1" ]; then
  test "$(printf '%s' "$FACTORY_FEE" | awk '{print $1}')" = "3000000000000000"
  test "$(printf '%s' "$FACTORY_MIN_STAKE" | awk '{print $1}')" = "100000000000000000"
  test "$(printf '%s' "$FACTORY_FOUNDER_BPS" | awk '{print $1}')" = "4500"
  test "$(printf '%s' "$FACTORY_SWAP_FEE_BPS" | awk '{print $1}')" = "25"
  test "$(printf '%s' "$FACTORY_PROTOCOL_FEE_BPS" | awk '{print $1}')" = "5"
  test "$(printf '%s' "$FACTORY_MIN_LAUNCH_BPS" | awk '{print $1}')" = "3000"
  test "$(printf '%s' "$FACTORY_OPENING_CAP_BPS" | awk '{print $1}')" = "5000"
  test "$(printf '%s' "$FACTORY_OPENING_DURATION" | awk '{print $1}')" = "86400"
  test "$(printf '%s' "$FACTORY_UNLOCK_DELAY" | awk '{print $1}')" = "172800"
fi
echo "Factory version: $FACTORY_VERSION"
echo "Factory WBNB:    $FACTORY_WBNB"
echo "Factory owner:   $FACTORY_OWNER"
echo "Treasury:        $FACTORY_TREASURY"
echo "Create paused:   $FACTORY_PAUSED"
echo "Creation fee:    $FACTORY_FEE"
echo "Minimum stake:   $FACTORY_MIN_STAKE"
echo "Fees LP/protocol: $FACTORY_SWAP_FEE_BPS / $FACTORY_PROTOCOL_FEE_BPS bps"
echo "Indexed rugs:    $FACTORY_RUGS"

if [ -n "$RUG_ADDRESS" ]; then
  echo "Checking RugInstance $RUG_ADDRESS..."
  RUG_FACTORY="$(call "$RUG_ADDRESS" 'factory()(address)')"
  RUG_CREATOR="$(call "$RUG_ADDRESS" 'creator()(address)')"
  RUG_STATUS="$(call "$RUG_ADDRESS" 'status()(uint8)')"
  RUG_METADATA_URI="$(call "$RUG_ADDRESS" 'metadataURI()(string)')"
  RUG_METADATA_HASH="$(call "$RUG_ADDRESS" 'metadataHash()(bytes32)')"
  RUG_OPENING_END="$(call "$RUG_ADDRESS" 'openingEnd()(uint40)')"
  RUG_TOTAL_CONTRIBUTED="$(call "$RUG_ADDRESS" 'totalContributed()(uint256)')"
  RUG_TOKEN="$(call "$RUG_ADDRESS" 'token()(address)')"
  RUG_POOL="$(call "$RUG_ADDRESS" 'pool()(address)')"
  test "$(lower "$RUG_FACTORY")" = "$(lower "$FACTORY_ADDRESS")"
  echo "Rug creator:       $RUG_CREATOR"
  echo "Rug status:        $RUG_STATUS"
  echo "Rug metadata URI:  $RUG_METADATA_URI"
  echo "Rug metadata hash: $RUG_METADATA_HASH"
  echo "Opening end:       $RUG_OPENING_END"
  echo "Total contributed: $RUG_TOTAL_CONTRIBUTED"
  echo "Token:             $RUG_TOKEN"
  echo "Pool:              $RUG_POOL"
  if [ -z "$TOKEN_ADDRESS" ] && [ "$RUG_TOKEN" != "0x0000000000000000000000000000000000000000" ]; then
    TOKEN_ADDRESS="$RUG_TOKEN"
  fi
  if [ -z "$POOL_ADDRESS" ] && [ "$RUG_POOL" != "0x0000000000000000000000000000000000000000" ]; then
    POOL_ADDRESS="$RUG_POOL"
  fi
fi

if [ -n "$TOKEN_ADDRESS" ]; then
  echo "Checking RugToken $TOKEN_ADDRESS..."
  echo "Token name:        $(call "$TOKEN_ADDRESS" 'name()(string)')"
  echo "Token symbol:      $(call "$TOKEN_ADDRESS" 'symbol()(string)')"
  echo "Token decimals:    $(call "$TOKEN_ADDRESS" 'decimals()(uint8)')"
  echo "Token totalSupply: $(call "$TOKEN_ADDRESS" 'totalSupply()(uint256)')"
fi

if [ -n "$POOL_ADDRESS" ]; then
  echo "Checking RugPool $POOL_ADDRESS..."
  POOL_TOKEN="$(call "$POOL_ADDRESS" 'token()(address)')"
  POOL_WBNB="$(call "$POOL_ADDRESS" 'WBNB()(address)')"
  POOL_RUG="$(call "$POOL_ADDRESS" 'rugInstance()(address)')"
  POOL_TREASURY="$(call "$POOL_ADDRESS" 'protocolTreasury()(address)')"
  POOL_SWAP_FEE="$(call "$POOL_ADDRESS" 'swapFeeBps()(uint16)')"
  POOL_PROTOCOL_FEE="$(call "$POOL_ADDRESS" 'protocolFeeBps()(uint16)')"
  POOL_INITIALIZED="$(call "$POOL_ADDRESS" 'initialized()(bool)')"
  POOL_RESERVES="$(call "$POOL_ADDRESS" 'getReserves()(uint112,uint112)')"
  if [ -n "$TOKEN_ADDRESS" ]; then test "$(lower "$POOL_TOKEN")" = "$(lower "$TOKEN_ADDRESS")"; fi
  if [ -n "$RUG_ADDRESS" ]; then test "$(lower "$POOL_RUG")" = "$(lower "$RUG_ADDRESS")"; fi
  echo "Pool token:       $POOL_TOKEN"
  echo "Pool WBNB:        $POOL_WBNB"
  echo "Pool RugInstance: $POOL_RUG"
  echo "Pool treasury:    $POOL_TREASURY"
  echo "Pool fees:        $POOL_SWAP_FEE / $POOL_PROTOCOL_FEE bps"
  echo "Pool initialized: $POOL_INITIALIZED"
  echo "Pool reserves:    $POOL_RESERVES"
fi

echo "BSC Testnet contract read check passed."
