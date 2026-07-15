#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

step() {
  printf '\n==> %s\n' "$1"
}

cd "$ROOT"

step "Prerequisites"
./scripts/check-prereqs.sh

step "Shell syntax"
bash -n scripts/*.sh

step "Config consistency"
./scripts/check-config-consistency.sh
./scripts/check-deployment-records.sh

step "ABI consistency"
./scripts/check-abi-consistency.sh

step "D1 schema consistency"
./scripts/check-db-schema-consistency.sh

step "TypeScript and Worker/economics tests"
npm test

step "Production build"
npm run build

step "Foundry contracts"
FOUNDRY_OUTPUT="$(mktemp)"
trap 'rm -f "$FOUNDRY_OUTPUT"' EXIT
forge test --force 2>&1 | tee "$FOUNDRY_OUTPUT"
if ! rg -q 'Ran [1-9][0-9]* test suites?' "$FOUNDRY_OUTPUT"; then
  echo "Foundry completed without discovering any contract test suites." >&2
  exit 1
fi
rm -f "$FOUNDRY_OUTPUT"
trap - EXIT

step "Cloudflare local Worker/API/assets smoke"
./scripts/check-cloudflare-local.sh

if [ "${RUN_RENDER_CHECK:-0}" = "1" ]; then
  step "Cloudflare local browser render smoke"
  ./scripts/check-cloudflare-render.sh
fi

if [ "${SKIP_NETWORK_CHECKS:-0}" = "1" ]; then
  step "Indexer local smoke"
  echo "Skipping network-backed indexer smoke because SKIP_NETWORK_CHECKS=1."
else
  step "Indexer local smoke"
  ./scripts/check-indexer-local.sh
fi

step "Worker deploy dry-run"
(cd workers/api && npx wrangler deploy --dry-run)

if [ "${RUN_BSC_READ_CHECK:-0}" = "1" ] && [ "${SKIP_NETWORK_CHECKS:-0}" = "1" ]; then
  step "BSC Testnet contract read check"
  echo "Skipping BSC Testnet read check because SKIP_NETWORK_CHECKS=1."
elif [ "${RUN_BSC_READ_CHECK:-0}" = "1" ]; then
  step "BSC Testnet contract read check"
  ./scripts/check-bsc-testnet-contracts.sh
fi

if [ "${RUN_BSC_MAINNET_READ_CHECK:-0}" = "1" ] && [ "${SKIP_NETWORK_CHECKS:-0}" = "1" ]; then
  step "BSC Mainnet contract read check"
  echo "Skipping BSC Mainnet read check because SKIP_NETWORK_CHECKS=1."
elif [ "${RUN_BSC_MAINNET_READ_CHECK:-0}" = "1" ]; then
  step "BSC Mainnet contract read check"
  ./scripts/check-bsc-mainnet-contracts.sh
fi

if [ "${RUN_BSC_E2E_CHECK:-0}" = "1" ] && [ "${SKIP_NETWORK_CHECKS:-0}" = "1" ]; then
  step "BSC Testnet E2E read-only check"
  echo "Skipping BSC Testnet E2E read-only check because SKIP_NETWORK_CHECKS=1."
elif [ "${RUN_BSC_E2E_CHECK:-0}" = "1" ]; then
  step "BSC Testnet E2E read-only check"
  ./scripts/check-bsc-testnet-e2e.sh
fi

if [ "${RUN_BSC_VERIFY_DRY_RUN:-0}" = "1" ] && [ "${SKIP_NETWORK_CHECKS:-0}" = "1" ]; then
  step "BSC Testnet verification dry-run"
  echo "Skipping BSC Testnet verification dry-run because SKIP_NETWORK_CHECKS=1."
elif [ "${RUN_BSC_VERIFY_DRY_RUN:-0}" = "1" ]; then
  step "BSC Testnet verification dry-run"
  ./scripts/check-bsc-verification-dry-run.sh
fi

step "Private key scan"
if rg -i '(private[_-]?key|deployer[_-]?key|user[_-]?key).{0,32}(0x)?[0-9a-f]{64}' \
  -g '!node_modules' -g '!dist' -g '!out' -g '!broadcast' -g '!lib/forge-std/**' \
  -g '!.env.example' . >/dev/null; then
  echo "A literal private-key-looking value was found in the workspace." >&2
  exit 1
fi

echo
echo "Local all-check passed."
