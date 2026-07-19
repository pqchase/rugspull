# Rugspull read-only integration guide

This guide helps wallets, explorers, terminals, researchers, and data authors interpret Rugspull's
public BNB Smart Chain data without treating a cache, label, or source badge as financial truth.

It is not a listing request, partnership announcement, audit, safety assessment, price oracle,
availability promise, or request to organize mainnet participation. Independent audit is pending,
total loss remains possible, and organized new mainnet activity remains NO-GO while the published
activation gates are unresolved.

## Start with the canonical identity

| Field | Value |
| --- | --- |
| Network | BNB Smart Chain mainnet, chain id `56` |
| Quote asset | WBNB only: `0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c` |
| Current Factory | `0xDFF540baBCa2ee8A2A8Ff26359Ecc9c5921D8A63` |
| Factory deployment block | `109991561` |
| Exact-match source | [BscScan](https://bscscan.com/address/0xDFF540baBCa2ee8A2A8Ff26359Ecc9c5921D8A63#code) |
| Machine integration package | [`integration.json`](https://rugspull.com/integration.json) |
| OpenAPI 3.1 | [`openapi.json`](https://rugspull.com/openapi.json) |
| Risk disclosure | [rugspull.com/docs/risk](https://rugspull.com/docs/risk) |

Each `RugCreated` event introduces a separate RugInstance. Token and RugPool addresses exist only
after that Instance reaches `LaunchSucceeded`. Do not infer, reserve, or publish nonexistent Token or
Pool addresses. Check each exact deployment separately before describing its source status.

## Read the public cache

The Worker exposes discovery and indexed-event data. It does not execute `buy`, `sell`, `rug`,
`claim`, or refund transactions for users.

```bash
# Confirm current chain and Factory configuration.
curl -fsS https://rugspull.com/api/config

# Inspect indexer checkpoints and warnings.
curl -fsS https://rugspull.com/api/indexer/status

# List up to 25 current-Factory records.
curl -fsS 'https://rugspull.com/api/rugs?limit=25'
```

For one emitted Instance address:

```bash
CHAIN_ID=56
RUG=0x0000000000000000000000000000000000000000

curl -fsS "https://rugspull.com/api/rugs/$CHAIN_ID/$RUG"
curl -fsS "https://rugspull.com/api/rugs/$CHAIN_ID/$RUG/events"
curl -fsS "https://rugspull.com/api/rugs/$CHAIN_ID/$RUG/market?limit=240"
```

Replace the zero address with an address actually emitted by the configured Factory. A missing cache
record is not proof that a contract or event does not exist. BNB Smart Chain state and matching logs remain authoritative;
D1 is rebuildable.

There is no public numeric rate-limit or uptime SLA. Cache responsibly, use exponential backoff, and
handle warnings, partial history, RPC errors, reorgs, and null timestamps explicitly.

## Reconstruct the lifecycle from events

Use the current Factory as the discovery root, then follow the Instance and Pool addresses emitted
by its events.

| Order | Contract | Event | Downstream meaning |
| --- | --- | --- | --- |
| 1 | RugFactory | `RugCreated` | Discover an Instance and bind creator, stake, Opening end, metadata hash, and disclosure hash to the Factory |
| 2 | RugInstance | `Contributed` | Record contribution flow; wallet count is not a unique-person count |
| 3a | RugInstance | `LaunchFailed` | Mark Failed and expose user-initiated refund eligibility; do not say automatically refunded |
| 3b | RugInstance | `LaunchSucceeded` | Bind Token, RugPool, accepted contribution, allocation, and initial reserves |
| 4 | RugInstance | `ClaimedOpening` | Record the claim and excess refund actually executed by one wallet |
| 4 | RugInstance | `ClaimedFailedRefund` | Record the Failed refund actually executed by one wallet |
| 4 | RugInstance | `CreatorStakeWithdrawn` | Record creator stake withdrawal separately from contributor refunds |
| 5 | RugPool | `Swap` | Rebuild side, amounts, protocol fee, reserves, price, and WBNB volume |
| 6 | RugInstance | `RugPulled` | Record the one full protocol-held Founder Allocation exit and quote received |

`Rugged` is a contract lifecycle state. It is not a generic scam verdict, safety label, refund
condition, loss calculation, or proof that creator-associated wallets stopped trading.

## Reconstruct market values with integer math

After each `LaunchSucceeded` or `Swap` event:

```text
priceX18 = reserveQuote * 1e18 / reserveToken
```

- Buy WBNB volume is `amountIn`.
- Sell WBNB volume is `amountOut + protocolFeeQuote`.
- Protocol-fee volume is the sum of `Swap.protocolFeeQuote`.
- The current public market endpoint does not offer OHLCV candles.
- A third party creating candles must disclose interval, missing-block, timestamp, reorg, rounding,
  and completeness rules.
- Reconcile `RugPool.getReserves()` against actual RugToken and WBNB balances. A chart or cached row
  cannot substitute for balance reconciliation.

## Do not model RugPool as PancakeSwap

RugPool is Rugspull's internal, non-upgradeable constant-product canonical pool:

- WBNB is the only MVP quote asset.
- RugPool issues no LP token.
- RugPool exposes no reserve-withdraw function.
- The nominal trade fee is 0.30%: 0.25% remains in the pool and 0.05% WBNB goes to the immutable
  protocol treasury, subject to integer rounding.
- Third parties can create alternative pools. Rugspull cannot prevent their use, remove MEV,
  identify all related wallets, guarantee price quality, or prevent total loss.

Do not display PancakeSwap routing, LP ownership, lock status, or pool labels for RugPool merely
because both systems use a constant-product concept.

## External-display review checklist

Before describing a wallet, terminal, directory, or data provider as integrated, verify all of the
following against a public result URL:

1. Full Factory and Instance addresses are shown and traceable to `RugCreated`.
2. Chain id `56` and WBNB quote asset are correct.
3. Exact-match source is not labeled as an audit, endorsement, or safety score.
4. RugPool is not labeled PancakeSwap and no nonexistent LP token is displayed.
5. Failed, Active, and Rugged semantics match the contracts; refunds are not called automatic.
6. Price, WBNB volume, protocol fee, and reserve formulas use the correct integer fields.
7. Cache delay and incomplete history are disclosed without hiding direct-chain evidence.
8. Risk, source, Factory, and security-contact links are visible.
9. No paid placement, expedited review, rebate, token allocation, stake, gas, or other promotional
   consideration was exchanged.
10. The third party's public record is inspected before any listing, integration, partnership,
    recommendation, or endorsement claim is made.

Sensitive funds-at-risk reports belong in private email to `info@rugspull.com`; do not publish an
unpatched exploit, private key, seed phrase, or personal data in a public issue. No bounty or
response-time SLA is offered.
