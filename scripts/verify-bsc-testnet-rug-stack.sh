#!/usr/bin/env bash
set -euo pipefail

: "${RUG_ADDRESS:?RUG_ADDRESS is required}"

RPC_URL="${RPC_URL:-https://data-seed-prebsc-1-s1.bnbchain.org:8545}"
VERIFY_DRY_RUN="${VERIFY_DRY_RUN:-0}"
TOKEN_ADDRESS="${TOKEN_ADDRESS:-}"
POOL_ADDRESS="${POOL_ADDRESS:-}"

if [ "$VERIFY_DRY_RUN" != "1" ]; then
  : "${BSCSCAN_API_KEY:?BSCSCAN_API_KEY is required unless VERIFY_DRY_RUN=1}"
fi

call() {
  cast call --rpc-url "$RPC_URL" "$@"
}

strip_quotes() {
  sed 's/^"//; s/"$//'
}

verify_contract() {
  local address="$1"
  local contract="$2"
  local constructor_args="$3"
  if [ "$VERIFY_DRY_RUN" = "1" ]; then
    echo "Would verify $address as $contract"
    echo "Constructor args: $constructor_args"
    return
  fi
  forge verify-contract "$address" "$contract" \
    --chain-id 97 \
    --rpc-url "$RPC_URL" \
    --etherscan-api-key "$BSCSCAN_API_KEY" \
    --constructor-args "$constructor_args"
}

echo "Reading RugInstance $RUG_ADDRESS constructor inputs..."
FACTORY_ADDRESS="$(call "$RUG_ADDRESS" 'factory()(address)')"
CREATOR="$(call "$RUG_ADDRESS" 'creator()(address)')"
WBNB="$(call "$RUG_ADDRESS" 'WBNB()(address)')"
PROTOCOL_TREASURY="$(call "$RUG_ADDRESS" 'protocolTreasury()(address)')"
METADATA_URI="$(call "$RUG_ADDRESS" 'metadataURI()(string)' | strip_quotes)"
METADATA_HASH="$(call "$RUG_ADDRESS" 'metadataHash()(bytes32)')"
DISCLOSURE_HASH="$(call "$RUG_ADDRESS" 'disclosureHash()(bytes32)')"
CREATOR_STAKE="$(call "$RUG_ADDRESS" 'creatorStake()(uint256)' | awk '{print $1}')"
FOUNDER_BPS="$(call "$RUG_ADDRESS" 'founderBps()(uint16)' | awk '{print $1}')"
SWAP_FEE_BPS="$(call "$RUG_ADDRESS" 'swapFeeBps()(uint16)' | awk '{print $1}')"
PROTOCOL_FEE_BPS="$(call "$RUG_ADDRESS" 'protocolFeeBps()(uint16)' | awk '{print $1}')"
TOKEN_TOTAL_SUPPLY="$(call "$RUG_ADDRESS" 'tokenTotalSupply()(uint256)' | awk '{print $1}')"
if [ -z "$TOKEN_ADDRESS" ]; then TOKEN_ADDRESS="$(call "$RUG_ADDRESS" 'token()(address)')"; fi
if [ -z "$POOL_ADDRESS" ]; then POOL_ADDRESS="$(call "$RUG_ADDRESS" 'pool()(address)')"; fi

RUG_NAME="${RUG_NAME:-}"
RUG_SYMBOL="${RUG_SYMBOL:-}"
if [ -z "$RUG_NAME" ] && [ "$TOKEN_ADDRESS" != "0x0000000000000000000000000000000000000000" ]; then
  RUG_NAME="$(call "$TOKEN_ADDRESS" 'name()(string)' | strip_quotes)"
fi
if [ -z "$RUG_SYMBOL" ] && [ "$TOKEN_ADDRESS" != "0x0000000000000000000000000000000000000000" ]; then
  RUG_SYMBOL="$(call "$TOKEN_ADDRESS" 'symbol()(string)' | strip_quotes)"
fi
: "${RUG_NAME:?RUG_NAME is required when token name cannot be read}"
: "${RUG_SYMBOL:?RUG_SYMBOL is required when token symbol cannot be read}"

MIN_LAUNCH_BPS="$(call "$FACTORY_ADDRESS" 'minLaunchBps()(uint16)' | awk '{print $1}')"
OPENING_CAP_BPS="$(call "$FACTORY_ADDRESS" 'openingCapBps()(uint16)' | awk '{print $1}')"
OPENING_DURATION="$(call "$FACTORY_ADDRESS" 'openingDuration()(uint40)' | awk '{print $1}')"
FOUNDER_UNLOCK_DELAY="$(call "$FACTORY_ADDRESS" 'founderUnlockDelay()(uint40)' | awk '{print $1}')"

RUG_ARGS="$(cast abi-encode \
  'constructor((address,address,address,address,string,string,string,bytes32,bytes32,uint256,uint16,uint16,uint16,uint16,uint16,uint40,uint40,uint256))' \
  "($FACTORY_ADDRESS,$CREATOR,$WBNB,$PROTOCOL_TREASURY,\"$RUG_NAME\",\"$RUG_SYMBOL\",\"$METADATA_URI\",$METADATA_HASH,$DISCLOSURE_HASH,$CREATOR_STAKE,$FOUNDER_BPS,$SWAP_FEE_BPS,$PROTOCOL_FEE_BPS,$MIN_LAUNCH_BPS,$OPENING_CAP_BPS,$OPENING_DURATION,$FOUNDER_UNLOCK_DELAY,$TOKEN_TOTAL_SUPPLY)")"
verify_contract "$RUG_ADDRESS" contracts/src/RugInstance.sol:RugInstance "$RUG_ARGS"

if [ "$TOKEN_ADDRESS" != "0x0000000000000000000000000000000000000000" ]; then
  TOKEN_SUPPLY="$(call "$TOKEN_ADDRESS" 'totalSupply()(uint256)' | awk '{print $1}')"
  TOKEN_ARGS="$(cast abi-encode 'constructor(string,string,address,uint256)' "$RUG_NAME" "$RUG_SYMBOL" "$RUG_ADDRESS" "$TOKEN_SUPPLY")"
  verify_contract "$TOKEN_ADDRESS" contracts/src/RugToken.sol:RugToken "$TOKEN_ARGS"
fi

if [ "$POOL_ADDRESS" != "0x0000000000000000000000000000000000000000" ]; then
  POOL_TOKEN="$(call "$POOL_ADDRESS" 'token()(address)')"
  POOL_WBNB="$(call "$POOL_ADDRESS" 'WBNB()(address)')"
  POOL_RUG="$(call "$POOL_ADDRESS" 'rugInstance()(address)')"
  POOL_TREASURY="$(call "$POOL_ADDRESS" 'protocolTreasury()(address)')"
  POOL_FEE="$(call "$POOL_ADDRESS" 'swapFeeBps()(uint16)' | awk '{print $1}')"
  POOL_PROTOCOL_FEE="$(call "$POOL_ADDRESS" 'protocolFeeBps()(uint16)' | awk '{print $1}')"
  POOL_ARGS="$(cast abi-encode 'constructor(address,address,address,address,uint16,uint16)' "$POOL_TOKEN" "$POOL_WBNB" "$POOL_RUG" "$POOL_TREASURY" "$POOL_FEE" "$POOL_PROTOCOL_FEE")"
  verify_contract "$POOL_ADDRESS" contracts/src/RugPool.sol:RugPool "$POOL_ARGS"
fi

echo "Rug stack verification script completed."
