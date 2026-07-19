# Rugspull

BSC-first MVP for transparent one-shot founder-rug launches.

[Live app](https://rugspull.com) | [Risk disclosure](https://rugspull.com/docs/risk) |
[WBNB guide](https://rugspull.com/what-is-wbnb) |
[Token approval guide](https://rugspull.com/what-is-a-token-approval) |
[Slippage guide](https://rugspull.com/what-is-slippage-on-bnb-chain) |
[Constant-product AMM guide](https://rugspull.com/constant-product-amm-explained) |
[Liquidity and reserve-depth guide](https://rugspull.com/what-is-liquidity-on-bnb-chain) |
[Transaction receipt guide](https://rugspull.com/what-is-a-transaction-receipt-on-bnb-chain) |
[Event-log guide](https://rugspull.com/how-to-read-event-logs-on-bscscan) |
[Claim/refund verification](https://rugspull.com/how-to-verify-claims-and-refunds-on-bscscan) |
[Settlement evidence semantics](https://rugspull.com/what-does-settled-mean-for-claims-and-refunds) |
[Evidence prerelease](https://github.com/pqchase/rugspull/releases/tag/v0.4.0-evidence.1) |
[BscScan](https://bscscan.com/address/0xDFF540baBCa2ee8A2A8Ff26359Ecc9c5921D8A63#code) |
[X](https://x.com/rugspull) | [Evidence feed](https://rugspull.com/feed.xml) |
[Security contact](https://rugspull.com/.well-known/security.txt) |
[Integration package](https://rugspull.com/integration.json) |
[API Reference](https://rugspull.com/api-reference) |
[OpenAPI](https://rugspull.com/openapi.json) |
[Postman Collection](https://rugspull.com/rugspull-read.postman_collection.json) |
[APIs.json](https://rugspull.com/.well-known/apis.json) |
[API Onboarding](https://rugspull.com/.well-known/api-onboarding) |
[RFC 9727 API Catalog](https://rugspull.com/.well-known/api-catalog) |
[Integration guide](docs/INTEGRATION.md)

Rugspull is high-risk satire, not a safe investment, yield product, or promise of returns. The
creator may sell the entire disclosed founder allocation once after unlock, and total loss remains
possible. Source verification is not an independent audit.

The protocol uses Solidity/Foundry contracts, WBNB as the only quote asset, an opening batch with unified pricing, failed-launch refunds, and an internal canonical constant-product AMM. Native BNB remains necessary for transaction gas; WBNB balances and allowances do not pay gas. Creation approves the Factory, contributions approve the exact `RugInstance`, and canonical buys or sells approve the exact `RugPool` only when the required token allowance is insufficient. Canonical swaps submit minimum output and deadline constraints; those checks can revert but do not guarantee inclusion, liquidity, MEV protection, or recovery. RugPool quotes from stored reserves with integer-rounded constant-product arithmetic; direct token transfers remain unquoted balance surplus because the pool has no sync or skim function. Reserve depth affects price impact, but nonzero reserves do not guarantee price, execution, a buyer, an exit, or recovery. Founder allocation never leaves `RugInstance` and can only be sold once into the canonical `RugPool`.

v0.4 fixes the launch profile at 45% Founder Allocation, 24-hour Opening, 48-hour post-Opening founder lock, 30% minimum launch, 50% accepted-contribution cap, 0.1 WBNB minimum creator stake, and 0.003 WBNB creation fee. Canonical trades use a nominal 0.30% fee: 0.25% remains in the pool and 0.05% WBNB goes to the protocol treasury.

## Structure

```text
contracts/          Solidity protocol and Foundry tests
packages/economics  TypeScript parity implementation of economic formulas
packages/contracts-ts Chain constants and frontend contract helpers
workers/api         Cloudflare Worker cache/index API
apps/web            React + Vite frontend MVP
docs/               Technical specification package
```

Report security issues privately to `info@rugspull.com`; see `SECURITY.md` before opening a public
issue about a live vulnerability.

For non-sensitive mechanism counterexamples, missing invariants, test gaps, or factual disclosure
corrections, use the structured [public review form](https://github.com/pqchase/rugspull/issues/new?template=mechanism-counterexample.yml).

## Commands

```bash
npm install
./scripts/check-prereqs.sh
npm test
npm run build
npm run check:release:local
npm run check:audit
npm run check:deploy:ready
CHECK_NETWORK=0 npm run check:deploy:ready
./scripts/check-config-consistency.sh
./scripts/check-deployment-records.sh
./scripts/check-abi-consistency.sh
./scripts/check-db-schema-consistency.sh
npm run check:local
SKIP_NETWORK_CHECKS=1 npm run check:local
./scripts/check-cloudflare-local.sh
npx playwright install chromium
npm run check:cloudflare:render
INDEXNOW_DRY_RUN=1 npm run submit:indexnow
npm run submit:indexnow
./scripts/check-cloudflare-remote.sh
WORKER_URL=https://your-worker.example npm run check:cloudflare:url
./scripts/check-bsc-testnet-e2e.sh
./scripts/check-bsc-verification-dry-run.sh
forge test
forge test --match-contract RugMathTest
forge test --match-contract RugPoolTest
forge test --match-contract RugInstanceTest
forge test --match-contract RugFactoryTest
forge test --match-contract RugInvariantTest
forge test --match-contract RugScenarioTest
```

## Safety Boundaries

- No upgradeable proxies in MVP.
- WBNB only.
- No PancakeSwap canonical pool in v0.
- No pool reserve withdrawal function.
- No backend endpoint signs or executes buy/sell/rug/claim.
- D1 is cache/index state only, not financial truth.
- BSC Mainnet was deployed and the production frontend was cut over on 2026-07-15 at the project
  owner's explicit direction. Sourcify and BscScan exact-source verification plus fork E2E are
  complete; independent audit, private/SLA RPC, moderation, and legal gates remain open and must
  not be represented as complete.
- The one-time deployer is separate from the shared Factory owner/protocol treasury address. The
  shared-address custody risk is an explicit single-operator governance decision.

## BSC Mainnet

Current immutable production deployment:

```text
RugFactory: 0xDFF540baBCa2ee8A2A8Ff26359Ecc9c5921D8A63
Tx:         0x95426057625753b19dfbe3754c5e79bdff771e69159cf69a67977b24cd464cc6
Chain:      BSC Mainnet / 56
Block:      109991561
Owner:      0x0326E94178402Ea733dD6faa8f9E88962E3DF4d2
Treasury:   0x0326E94178402Ea733dD6faa8f9E88962E3DF4d2
Source:     Sourcify + BscScan exact_match
```

BscScan: <https://bscscan.com/address/0xDFF540baBCa2ee8A2A8Ff26359Ecc9c5921D8A63#code>

Read-check the deployed Factory without a private key:

```bash
./scripts/check-bsc-mainnet-contracts.sh
VERIFY_DRY_RUN=1 ./scripts/verify-bsc-mainnet-factory.sh
# Re-submit only if BscScan loses its mirrored exact-match record.
BSCSCAN_API_KEY=... ./scripts/verify-bsc-mainnet-factory.sh
```

The deployment record, constructor profile, runtime code hash, gas use, and fork-E2E evidence are
recorded in `deployments/bsc-mainnet.json`. The disposable deployer key is intentionally not stored.

## BSC Testnet

Current testnet deployment:

```text
RugFactory: 0x336245d97Abb2F06eb396d6A9d671D4029CE2e5d
Tx:         0xff613aeba58f3dfa5943702967f05f93503c401adba1ec26ac4fc83165f2b85a
Chain:      BSC Testnet / 97
Block:      118839588
Source:     Sourcify exact_match
```

Short-duration E2E deployment used for live testnet verification:

```text
Factory:       0x8e6ba49e54F7bDa1a5499D143395116d3430ae3c
Failed Rug:    0xeD8F823839a115B26cA126C0b41a61eC38b606bd
Rugged Rug:    0xF8f2BC14FbB238D2AB7EAf0Eb548FA27D7e2ac7c
Token:         0xdec35484bFF547Cc347441b9d881354Bd0c0dCbd
Pool:          0xFBb80c25Fc5Bb3E9e60949ce72Ffa9493513fE62
Source:        Sourcify exact_match for all five contracts
```

Set these environment variables before deploying:

```bash
export PRIVATE_KEY=...
export WBNB=0xae13d989dac2f0debff460ac112a837c89baa7cd
export PROTOCOL_TREASURY=0x...
```

Then run:

```bash
forge script contracts/script/DeployBscTestnet.s.sol:DeployBscTestnet \
  --rpc-url https://data-seed-prebsc-1-s1.bnbchain.org:8545 \
  --broadcast \
  --verify
```

Verify an already-deployed Factory:

```bash
export FACTORY_ADDRESS=0x...
export BSCSCAN_API_KEY=...
./scripts/verify-bsc-testnet-factory.sh

# Constructor-arg dry-run without BscScan credentials.
VERIFY_DRY_RUN=1 FACTORY_ADDRESS=0x... ./scripts/verify-bsc-testnet-factory.sh
```

Verify a launched RugInstance, RugToken, and RugPool:

```bash
export RUG_ADDRESS=0x...
export TOKEN_ADDRESS=0x...
export POOL_ADDRESS=0x...
export BSCSCAN_API_KEY=...
./scripts/verify-bsc-testnet-rug-stack.sh

# Parameter dry-run without BscScan credentials.
VERIFY_DRY_RUN=1 RUG_ADDRESS=0x... ./scripts/verify-bsc-testnet-rug-stack.sh

# Full verification dry-run for the recorded E2E Factory/Rug/Token/Pool.
./scripts/check-bsc-verification-dry-run.sh
```

Read-check deployed contracts without private keys or BscScan credentials:

```bash
./scripts/check-bsc-testnet-contracts.sh
./scripts/check-bsc-testnet-e2e.sh

VERIFY_FACTORY_PROFILE=0 \
FACTORY_ADDRESS=0x8e6ba49e54F7bDa1a5499D143395116d3430ae3c \
RUG_ADDRESS=0xF8f2BC14FbB238D2AB7EAf0Eb548FA27D7e2ac7c \
TOKEN_ADDRESS=0xdec35484bFF547Cc347441b9d881354Bd0c0dCbd \
POOL_ADDRESS=0xFBb80c25Fc5Bb3E9e60949ce72Ffa9493513fE62 \
./scripts/check-bsc-testnet-contracts.sh
```

Create a test Rug:

```bash
export FACTORY_ADDRESS=0x...
export RUG_NAME="Transparent Test Rug"
export RUG_SYMBOL=TRUG
export METADATA_URI=r2://metadata/local-test.json
# Optional; if omitted, the script uses keccak256(bytes(METADATA_URI)).
export METADATA_HASH=0x...
export CREATOR_STAKE=100000000000000000

forge script contracts/script/CreateRugBscTestnet.s.sol:CreateRugBscTestnet \
  --rpc-url https://data-seed-prebsc-1-s1.bnbchain.org:8545 \
  --broadcast \
  --legacy
```

Contribute and finalize:

```bash
export RUG_ADDRESS=0x...
export CONTRIBUTION_AMOUNT=30000000000000000

forge script contracts/script/ContributeRugBscTestnet.s.sol:ContributeRugBscTestnet \
  --rpc-url https://data-seed-prebsc-1-s1.bnbchain.org:8545 \
  --broadcast \
  --legacy

forge script contracts/script/FinalizeRugBscTestnet.s.sol:FinalizeRugBscTestnet \
  --rpc-url https://data-seed-prebsc-1-s1.bnbchain.org:8545 \
  --broadcast \
  --legacy
```

Claim, trade, and rug:

```bash
forge script contracts/script/ClaimOpeningBscTestnet.s.sol:ClaimOpeningBscTestnet \
  --rpc-url https://data-seed-prebsc-1-s1.bnbchain.org:8545 \
  --broadcast \
  --legacy

export POOL_ADDRESS=0x...
export TOKEN_ADDRESS=0x...
export TO=0x...
export QUOTE_IN=1000000000000000
export TOKEN_IN=1000000000000000000000
export MIN_TOKENS_OUT=1
export MIN_QUOTE_OUT=1

forge script contracts/script/BuyRugBscTestnet.s.sol:BuyRugBscTestnet \
  --rpc-url https://data-seed-prebsc-1-s1.bnbchain.org:8545 \
  --broadcast \
  --legacy

forge script contracts/script/SellRugBscTestnet.s.sol:SellRugBscTestnet \
  --rpc-url https://data-seed-prebsc-1-s1.bnbchain.org:8545 \
  --broadcast \
  --legacy

forge script contracts/script/RugBscTestnet.s.sol:RugBscTestnet \
  --rpc-url https://data-seed-prebsc-1-s1.bnbchain.org:8545 \
  --broadcast \
  --legacy
```

Failed launch recovery:

```bash
forge script contracts/script/ClaimFailedRefundBscTestnet.s.sol:ClaimFailedRefundBscTestnet \
  --rpc-url https://data-seed-prebsc-1-s1.bnbchain.org:8545 \
  --broadcast \
  --legacy

forge script contracts/script/WithdrawCreatorStakeBscTestnet.s.sol:WithdrawCreatorStakeBscTestnet \
  --rpc-url https://data-seed-prebsc-1-s1.bnbchain.org:8545 \
  --broadcast \
  --legacy
```

## Cloudflare Local / Deploy

The Worker serves both `/api/*` and the built frontend through Workers Static Assets.
It also registers a Cloudflare scheduled trigger that runs the indexer every 5 minutes.
The create flow writes an optional image plus metadata through `/api/uploads/finalize`, so one single-use Turnstile token protects the complete upload. The lower-level `/api/metadata/finalize` and `/api/assets/finalize` endpoints remain available for one-request integrations.
Immutable R2 objects are served back through `/api/r2/metadata/...` and `/api/r2/assets/...` so indexed Rug pages can render metadata and images.

Current deployed mainnet Worker/frontend:

```text
Primary URL: https://rugspull.com
Worker fallback: https://rugspull-api.nanqz.workers.dev
Chain: BSC Mainnet / 56
Factory: 0xDFF540baBCa2ee8A2A8Ff26359Ecc9c5921D8A63
Worker version: 308f2680-0e3a-4c96-8978-6c6fce241e49
Mainnet smoke Rug: none; no user-facing test asset was created with real funds
```

Set `TURNSTILE_SECRET` on the Worker and the matching `VITE_TURNSTILE_SITE_KEY` for the frontend before any public deployment. Without the secret, upload endpoints fail closed with `503` and the create button remains disabled. `ALLOW_UNPROTECTED_UPLOADS=1` is an explicit local or closed-test Worker bypass only; it is never a public-release waiver.
Set `ADMIN_TOKEN` on the Worker to require `Authorization: Bearer ...` for manual `POST /api/indexer/run`; the scheduled cron supplies the same token internally.
The frontend includes a connected-wallet WBNB panel for wrapping test BNB into the WBNB quote asset required by the protocol.
The account page reads indexed rugs plus on-chain `contributionOf` and `claimed` state for the connected wallet.
Each Rug page also reads the connected wallet's contribution and claimed status to estimate opening token claims and refunds.
Pool swap and founder controls read current `RugPool` reserves, show a 1%/3%/5% slippage selector, and submit a non-zero calculated minimum output.
Each Rug page reconstructs price, WBNB volume, pool reserves, protocol fees, and the founder Rug marker from indexed `LaunchSucceeded`, `Swap`, and `RugPulled` events. `GET /api/rugs/:chainId/:rug/market` serves the bounded detail series and `GET /api/market/sparklines` batches compact homepage series for up to 24 Rugs.
Chart data and aggregate market stats are rebuildable D1 discovery caches. They are never used for quotes, slippage protection, balances, or settlement; transaction controls continue to read current contract state directly.
Indexed rows retain their source `factory_address`; public list and account queries expose only the configured current Factory. Historical Factory receipts remain directly addressable, but the frontend hides transaction controls when a Rug does not expose the complete current interface.
Rug transaction buttons are disabled when the URL chain id is unsupported or when the current on-chain state would reject the action.
The `/ops` page provides a read-only view of API config, indexer latest block, factory sources, sync state, and RPC warnings.

```bash
npm run dev:cloudflare
./scripts/check-cloudflare-local.sh
./scripts/check-indexer-local.sh
REQUIRE_INDEXED_RUG=1 ./scripts/check-indexer-local.sh
```

`check-indexer-local.sh` verifies the indexer endpoint and, when the configured RPC supports historical logs, verifies indexed E2E events. The checked-in Worker configuration contains only a no-key public fallback; the archive-capable primary RPC must be installed as the `RPC_URL` Worker Secret. Re-run the preflight before each deployment because provider limits can change.
Set `REQUIRE_INDEXED_RUG=1` before handoff or deployment to make the known rugged E2E Rug a hard requirement instead of a soft warning.
Use `./scripts/check-bsc-rpc-logs.sh` to verify the configured Worker RPC can read historical factory logs before deploying.
The indexer follows Factory `RugCreated`, RugInstance lifecycle events, and RugPool `Swap` events so each Rug page can show launch, trading history, and its event-derived market chart.
On `RugCreated`, it also reads chain view data such as `metadataURI`, `openingStart`, and `founderUnlockTime` to keep D1 cache rows useful for discovery.
Use `GET /api/indexer/status` to inspect latest block, configured factory sources, sync progress, and RPC/index warnings.
The frontend `/ops` page reads the same config and indexer status endpoints for a quick deployment health view.

Run the full local gate before handoff or deployment:

```bash
npm run check:release:local
npm run check:local

# CI/offline mode: skips checks that depend on public BSC RPC history.
SKIP_NETWORK_CHECKS=1 npm run check:local

# Optional: also read-check the historical BSC Testnet Factory.
RUN_BSC_READ_CHECK=1 npm run check:local

# Optional: also read-check the production BSC Mainnet Factory.
RUN_BSC_MAINNET_READ_CHECK=1 npm run check:local

# Optional: also read-check the deployed BSC Testnet failed/rugged E2E flows.
RUN_BSC_E2E_CHECK=1 npm run check:local

# Optional: also dry-run BscScan verification constructor args.
RUN_BSC_VERIFY_DRY_RUN=1 npm run check:local

# Optional: also verify browser-rendered frontend routes through the local Worker.
RUN_RENDER_CHECK=1 npm run check:local
```

Deploy:

```bash
# Full remote deployment flow: local gate, remote resources, secrets, preflight, deploy,
# and deployed URL smoke check. WORKER_URL overrides auto-detected workers.dev URLs.
ADMIN_TOKEN=... TURNSTILE_SECRET=... WORKER_URL=https://your-worker.example npm run deploy:cloudflare:remote

# Or run the same flow step by step.

# Creates or finds the D1/R2 resources and writes the real D1 id into wrangler.toml.
./scripts/prepare-cloudflare-remote.sh

# Or update wrangler.toml manually from an existing D1 id.
D1_DATABASE_ID=... ./scripts/configure-cloudflare-bindings.sh

# ADMIN_TOKEN is required; omit it to generate and install a token without storing it locally.
# TURNSTILE_SECRET is required for public readiness.
ADMIN_TOKEN=... TURNSTILE_SECRET=... ./scripts/configure-cloudflare-secrets.sh
./scripts/check-bsc-rpc-logs.sh
npm run check:deploy:ready
# Use only for local Cloudflare/account readiness when RPC archive access is not available yet.
CHECK_NETWORK=0 npm run check:deploy:ready
# Production fallback mode when public RPC rejects eth_getLogs; create flow registers new Rugs through eth_getTransactionReceipt + eth_call.
REQUIRE_RPC_LOGS=0 npm run check:deploy:ready
# Deployment fallback mode for public RPCs that reject eth_getLogs.
# New rugs are registered through /api/indexer/register-rug after create transactions.
# The registration request must include the mined create transaction hash; client-provided block numbers are ignored.
REQUIRE_RPC_LOGS=0 ./scripts/check-cloudflare-remote.sh
./scripts/check-cloudflare-remote.sh
npm run deploy:cloudflare
WORKER_URL=https://your-worker.example npm run check:cloudflare:url
```

Public vulnerability-reporting guidance is documented in `SECURITY.md`.
