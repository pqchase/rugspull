# Source Snapshot — Rugspull BSC v0.4

This file records external assumptions used when drafting the technical spec. Re-check these before mainnet deployment.

## BNB Smart Chain

- BNB Smart Chain is EVM compatible and supports Ethereum tooling such as MetaMask, Truffle, Remix, etc.
- BSC documentation dated March 16, 2026 states a 0.05 Gwei standard gas price and about 0.45 second block time.
- Re-checked July 15, 2026: BSC Mainnet chain id is 56 and canonical WBNB at
  `0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c` returned deployed runtime code through two public
  RPCs before Factory deployment.
- Mainnet preflight found the official public endpoint accepts current reads but disables
  `eth_getLogs`. The production Worker therefore uses bloXroute first, then 48 Club, dRPC, and the
  official endpoint as fallbacks, scanning 900-block chunks. On July 15, 2026, both bloXroute and
  48 Club successfully returned the complete deployment-to-current Factory log range. These are
  still public, rate-limited endpoints and are not an SLA substitute.
- Sources:
  - https://docs.bnbchain.org/bnb-smart-chain/overview/
  - https://docs.bnbchain.org/bnb-smart-chain/developers/json_rpc/json-rpc-endpoint/
  - https://docs.bloxroute.com/protect-fast-rpcs/protect-rpcs/bsc-protect-rpc
  - https://docs.48.club/privacy-rpc
  - https://docs.nodereal.io/reference/getting-started-with-your-api
  - https://docs.nodereal.io/reference/eth-getlogs-bnb-chain

## PancakeSwap

- PancakeSwap is a major DEX available across BNB Chain and other networks.
- PancakeSwap v2 BSC addresses as of the developer docs snapshot:
  - Factory: `0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73`
  - Router: `0x10ED43C718714eb63d5aA57B78B54704E256024E`
- MVP does not use PancakeSwap as canonical pool, but these addresses matter for future integration.
- Sources:
  - https://docs.pancakeswap.finance/
  - https://developer.pancakeswap.finance/contracts/v2/addresses

## Trading fee benchmark

- Re-checked July 13, 2026: Pump documents a 0.30% total fee for non-canonical PumpSwap pools, split into a 0.05% protocol fee and a 0.25% LP fee.
- Re-checked July 13, 2026: PancakeSwap documents a fixed 0.25% Exchange V2 trading fee with portions allocated to liquidity and protocol-side uses.
- Rugspull v0.4 adopts the Pump non-canonical split as a simple immutable benchmark: 0.25% retained by RugPool plus 0.05% WBNB sent to protocolTreasury. Rugspull has no creator trading fee.
- These sources are market references, not settlement dependencies; the deployed Factory and source code are authoritative.
- Sources:
  - https://pump.fun/docs/fees
  - https://docs.pancakeswap.finance/trade/pancakeswap-exchange/trade

## Cloudflare

- Workers Free has 100,000 requests/day.
- Workers Free CPU limit is 10ms per invocation.
- Requests to static assets are free and unlimited.
- D1 Free includes 5M rows read/day, 100k rows written/day, and 5GB storage.
- Re-checked July 12, 2026: Turnstile tokens expire after five minutes and can be validated only once. A replay returns `timeout-or-duplicate`.
- Upload flows therefore use one bundled image-plus-metadata request per Turnstile token; server-side Siteverify remains mandatory.
- Sources:
  - https://developers.cloudflare.com/workers/platform/pricing/
  - https://developers.cloudflare.com/workers/platform/limits/
  - https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
  - https://developers.cloudflare.com/workers/static-assets/

## OpenZeppelin

- OpenZeppelin Contracts provides ERC20, role/access control, security utilities, and audited tagged releases.
- ReentrancyGuard prevents nested reentrant calls.
- Sources:
  - https://docs.openzeppelin.com/contracts/5.x
  - https://docs.openzeppelin.com/contracts/4.x/api/security

## Foundry

- Forge runs Solidity tests.
- Foundry fuzz testing automatically fuzzes test functions with parameters.
- `forge-std` is pinned to tag v1.16.2, commit `bf647bd6046f2f7da30d0c2bf435e5c76a780c1b`.
- v0.4 runs handler-based stateful invariants with 128 runs and 64 calls per run, with `fail_on_revert = true`.
- Source: https://www.getfoundry.sh/forge/testing

## Design note

The external docs above are not part of the protocol's trust base. If any external integration assumption changes, update this file, the main technical spec, and the related tests.
