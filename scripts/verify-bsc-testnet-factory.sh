#!/usr/bin/env bash
set -euo pipefail

: "${FACTORY_ADDRESS:?FACTORY_ADDRESS is required}"

RPC_URL="${RPC_URL:-https://data-seed-prebsc-1-s1.bnbchain.org:8545}"
VERIFY_DRY_RUN="${VERIFY_DRY_RUN:-0}"

if [ "$VERIFY_DRY_RUN" != "1" ]; then
  : "${BSCSCAN_API_KEY:?BSCSCAN_API_KEY is required unless VERIFY_DRY_RUN=1}"
fi

call() {
  cast call --rpc-url "$RPC_URL" "$@"
}

value() {
  awk 'NR == 1 { print $1 }'
}

WBNB="${WBNB:-$(call "$FACTORY_ADDRESS" 'WBNB()(address)' | value)}"
PROTOCOL_TREASURY="${PROTOCOL_TREASURY:-$(call "$FACTORY_ADDRESS" 'protocolTreasury()(address)' | value)}"
FACTORY_OWNER="${FACTORY_OWNER:-$(call "$FACTORY_ADDRESS" 'owner()(address)' | value)}"
FOUNDER_BPS="${FOUNDER_BPS:-$(call "$FACTORY_ADDRESS" 'founderBps()(uint16)' | value)}"
SWAP_FEE_BPS="${SWAP_FEE_BPS:-$(call "$FACTORY_ADDRESS" 'swapFeeBps()(uint16)' | value)}"
PROTOCOL_FEE_BPS="${PROTOCOL_FEE_BPS:-$(call "$FACTORY_ADDRESS" 'protocolFeeBps()(uint16)' | value)}"
MIN_LAUNCH_BPS="${MIN_LAUNCH_BPS:-$(call "$FACTORY_ADDRESS" 'minLaunchBps()(uint16)' | value)}"
OPENING_CAP_BPS="${OPENING_CAP_BPS:-$(call "$FACTORY_ADDRESS" 'openingCapBps()(uint16)' | value)}"
OPENING_DURATION="${OPENING_DURATION:-$(call "$FACTORY_ADDRESS" 'openingDuration()(uint40)' | value)}"
FOUNDER_UNLOCK_DELAY="${FOUNDER_UNLOCK_DELAY:-$(call "$FACTORY_ADDRESS" 'founderUnlockDelay()(uint40)' | value)}"
CREATION_FEE="${CREATION_FEE:-$(call "$FACTORY_ADDRESS" 'creationFee()(uint256)' | value)}"
MIN_CREATOR_STAKE="${MIN_CREATOR_STAKE:-$(call "$FACTORY_ADDRESS" 'minCreatorStake()(uint256)' | value)}"
TOKEN_TOTAL_SUPPLY="${TOKEN_TOTAL_SUPPLY:-$(call "$FACTORY_ADDRESS" 'tokenTotalSupply()(uint256)' | value)}"

CONSTRUCTOR_ARGS="$(cast abi-encode \
  'constructor((address,address,address,uint16,uint16,uint16,uint16,uint16,uint40,uint40,uint256,uint256,uint256))' \
  "($WBNB,$PROTOCOL_TREASURY,$FACTORY_OWNER,$FOUNDER_BPS,$SWAP_FEE_BPS,$PROTOCOL_FEE_BPS,$MIN_LAUNCH_BPS,$OPENING_CAP_BPS,$OPENING_DURATION,$FOUNDER_UNLOCK_DELAY,$CREATION_FEE,$MIN_CREATOR_STAKE,$TOKEN_TOTAL_SUPPLY)")"

if [ "$VERIFY_DRY_RUN" = "1" ]; then
  echo "Would verify $FACTORY_ADDRESS as contracts/src/RugFactory.sol:RugFactory"
  echo "Constructor args: $CONSTRUCTOR_ARGS"
  exit 0
fi

forge verify-contract "$FACTORY_ADDRESS" contracts/src/RugFactory.sol:RugFactory \
  --chain-id 97 \
  --rpc-url "$RPC_URL" \
  --etherscan-api-key "$BSCSCAN_API_KEY" \
  --constructor-args "$CONSTRUCTOR_ARGS"
