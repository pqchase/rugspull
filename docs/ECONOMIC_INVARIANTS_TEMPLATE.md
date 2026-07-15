# Economic Invariants Template — Rugspull BSC

Use this file to document formulas, proof sketches, and test coverage.

## 0. v0.4 immutable profile

```text
founderBps = 4500
openingDuration = 24 hours
founderUnlockDelay = 48 hours after Opening
minLaunchBps = 3000
openingCapBps = 5000
minCreatorStake = 0.1 WBNB
creationFee = 0.003 WBNB
swapFeeBps = 25
protocolFeeBps = 5
```

## 1. Opening variables

```text
T = total supply
f = founder bps
F = floor(T * f / 10000)
N = T - F
C = creator stake
U = total user contribution
M = min launch amount
Cap = opening accepted cap
Q = min(U, Cap)
A = floor(N * Q / (C + 2Q))
X = N - A
Y = C + Q
```

## 2. Launch condition

```text
Success iff U >= M
Failure iff U < M
```

Failure path:

```text
user refunds = contribution_i
creator refund = C
pool not created
Founder not active
```

## 3. Supply conservation

```text
F + A + X == T
```

Where:

```text
F = founderRemaining before rug
A = openingTokenAllocation
X = poolTokenReserve at initialization
```

## 4. Opening price condition

Opening price:

```text
P_opening = Q / A
```

Pool spot price:

```text
P_pool = Y / X
```

Required:

```text
P_opening >= P_pool
```

Use cross multiplication:

```text
Q * X >= Y * A
```

## 5. Claims

For user `i`:

```text
token_i = floor(A * u_i / U)
refund_i = floor((U - Q) * u_i / U)
```

Required:

```text
sum(token_i) <= A
sum(refund_i) <= U - Q
no user can claim twice
```

## 6. AMM output and fee conservation

```text
Buy:
protocolFeeQuote = floor(quoteIn * 5 / 10000)
poolQuoteIn = quoteIn - protocolFeeQuote
pricingQuoteIn = floor(poolQuoteIn * 9975 / 10000)
tokensOut = floor(reserveToken * pricingQuoteIn / (reserveQuote + pricingQuoteIn))

Sell and founder rug:
pricingTokenIn = floor(tokenIn * 9975 / 10000)
grossQuoteOut = floor(reserveQuote * pricingTokenIn / (reserveToken + pricingTokenIn))
protocolFeeQuote = floor(grossQuoteOut * 5 / 10000)
netQuoteOut = grossQuoteOut - protocolFeeQuote
```

Required:

```text
amountOut < reserveOut
amountOut increases monotonically with amountIn
k does not decrease after swap when accounting for fee
protocol treasury delta == protocolFeeQuote
pool balances == stored reserves after every canonical action
WBNB is conserved across known participants, RugInstance, RugPool, and treasury
```

## 7. Founder Rug

Before rug:

```text
founderRemaining == F
status == Active
```

After successful rug:

```text
founderRemaining == 0
status == Rugged
creator receives quoteOut
protocol treasury receives the 5 bps quote fee
second rug reverts
```

## 8. Self-buy invariant

If all user contributions and active buys are controlled by the creator, then after accounting for all WBNB inputs from those addresses, the creator cannot extract risk-free profit solely through the protocol.

This should be tested with scenario simulations, not assumed.

## 9. Dust policy

Integer division dust must never be withdrawable by the creator.

Document actual implementation:

```text
Opening token dust: remains permanently in RugInstance and is not creator-withdrawable
Refund dust: remains permanently in RugInstance and is not creator-withdrawable
Swap rounding value: remains in RugPool through the reserve arithmetic
Protocol fee below one WBNB wei: rounds down to zero
```

Because contributors are not stored in an iterable on-chain array, there is no bounded, permissionless way to prove that every claim has completed. v0.4 therefore deliberately leaves claim dust inaccessible instead of adding a creator or admin sweep.

## 10. Direct-transfer surplus

An unsolicited direct ERC20 transfer to RugPool is not a canonical swap and does not update stored reserves. The excess remains inaccessible because v0.4 has no `skim`, `sync`, or reserve-withdraw path. Canonical actions must keep actual balances exactly equal to stored reserves when no unsolicited transfer occurred.
