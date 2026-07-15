#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOYMENT_RECORD="${DEPLOYMENT_RECORD:-$ROOT/deployments/bsc-mainnet.json}"
RPC_URL="${RPC_URL:-https://bsc-dataseed-public.bnbchain.org}"

deployment_value() {
  node -e 'const d=require(process.argv[1]); const path=process.argv[2].split("."); let v=d; for (const key of path) v=v[key]; process.stdout.write(String(v));' \
    "$DEPLOYMENT_RECORD" "$1"
}

call() {
  cast call --rpc-url "$RPC_URL" "$@"
}

value() {
  awk 'NR == 1 { print $1 }'
}

require_eq() {
  if [ "$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')" != "$(printf '%s' "$2" | tr '[:upper:]' '[:lower:]')" ]; then
    printf 'FAIL %s: got %s, expected %s\n' "$3" "$1" "$2" >&2
    exit 1
  fi
  printf 'PASS %s: %s\n' "$3" "$1"
}

FACTORY="$(deployment_value factory)"
TX_HASH="$(deployment_value txHash)"
DEPLOY_BLOCK="$(deployment_value deployBlock)"

require_eq "$(cast chain-id --rpc-url "$RPC_URL")" "$(deployment_value chainId)" "chain id"
require_eq "$(cast receipt "$TX_HASH" status --rpc-url "$RPC_URL")" "true" "deployment receipt"
require_eq "$(cast receipt "$TX_HASH" blockNumber --rpc-url "$RPC_URL")" "$DEPLOY_BLOCK" "deployment block"
require_eq "$(call "$FACTORY" 'VERSION()(string)' | tr -d '"')" "$(deployment_value version)" "Factory version"
require_eq "$(call "$FACTORY" 'WBNB()(address)')" "$(deployment_value wbnb)" "WBNB"
require_eq "$(call "$FACTORY" 'owner()(address)')" "$(deployment_value owner)" "Factory owner"
require_eq "$(call "$FACTORY" 'protocolTreasury()(address)')" "$(deployment_value protocolTreasury)" "protocol treasury"
require_eq "$(call "$FACTORY" 'pendingOwner()(address)')" "0x0000000000000000000000000000000000000000" "pending owner"
require_eq "$(call "$FACTORY" 'createPaused()(bool)')" "$(deployment_value createPaused)" "creation pause state"
require_eq "$(call "$FACTORY" 'founderBps()(uint16)' | value)" "$(deployment_value economics.founderBps)" "founder bps"
require_eq "$(call "$FACTORY" 'swapFeeBps()(uint16)' | value)" "$(deployment_value economics.swapFeeBps)" "pool fee bps"
require_eq "$(call "$FACTORY" 'protocolFeeBps()(uint16)' | value)" "$(deployment_value economics.protocolFeeBps)" "protocol fee bps"
require_eq "$(call "$FACTORY" 'minLaunchBps()(uint16)' | value)" "$(deployment_value economics.minLaunchBps)" "minimum launch bps"
require_eq "$(call "$FACTORY" 'openingCapBps()(uint16)' | value)" "$(deployment_value economics.openingCapBps)" "opening cap bps"
require_eq "$(call "$FACTORY" 'openingDuration()(uint40)' | value)" "$(deployment_value economics.openingDuration)" "opening duration"
require_eq "$(call "$FACTORY" 'founderUnlockDelay()(uint40)' | value)" "$(deployment_value economics.founderUnlockDelay)" "founder unlock delay"
require_eq "$(call "$FACTORY" 'creationFee()(uint256)' | value)" "$(deployment_value economics.creationFeeWei)" "creation fee"
require_eq "$(call "$FACTORY" 'minCreatorStake()(uint256)' | value)" "$(deployment_value economics.minCreatorStakeWei)" "minimum creator stake"
require_eq "$(call "$FACTORY" 'tokenTotalSupply()(uint256)' | value)" "$(deployment_value economics.tokenTotalSupplyWei)" "token total supply"

CODE="$(cast code "$FACTORY" --rpc-url "$RPC_URL")"
require_eq "$(((${#CODE} - 2) / 2))" "$(deployment_value runtimeCodeBytes)" "runtime code bytes"
require_eq "$(cast keccak "$CODE")" "$(deployment_value runtimeCodeHash)" "runtime code hash"

echo "Current Rug count: $(call "$FACTORY" 'allRugsLength()(uint256)' | value)"
echo "BSC Mainnet contract read check passed."
