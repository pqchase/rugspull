#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOYMENT_FILE="${E2E_DEPLOYMENT_FILE:-$ROOT/deployments/bsc-testnet-e2e.json}"

deployment_value() {
  node -e 'const d=require(process.argv[1]); process.stdout.write(String(d[process.argv[2]]));' "$DEPLOYMENT_FILE" "$1"
}

RPC_URL="${RPC_URL:-https://data-seed-prebsc-1-s1.bnbchain.org:8545}"
FACTORY_ADDRESS="${FACTORY_ADDRESS:-$(deployment_value shortDurationFactory)}"
RUG_ADDRESS="${RUG_ADDRESS:-$(deployment_value successfulPathRug)}"
TOKEN_ADDRESS="${TOKEN_ADDRESS:-$(deployment_value successfulPathToken)}"
POOL_ADDRESS="${POOL_ADDRESS:-$(deployment_value successfulPathPool)}"

export RPC_URL FACTORY_ADDRESS RUG_ADDRESS TOKEN_ADDRESS POOL_ADDRESS VERIFY_DRY_RUN=1

echo "Dry-running BscScan verification constructor args for Factory..."
./scripts/verify-bsc-testnet-factory.sh

echo
echo "Dry-running BscScan verification constructor args for RugInstance/RugToken/RugPool..."
./scripts/verify-bsc-testnet-rug-stack.sh

echo "BSC verification dry-run passed."
