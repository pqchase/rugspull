export const BPS_DENOMINATOR = 10_000n;

export type LaunchInputs = {
  totalSupply: bigint;
  founderBps: bigint;
  creatorStake: bigint;
  totalContributed: bigint;
  openingCap: bigint;
};

export type LaunchAllocation = {
  founderAllocation: bigint;
  nonFounderSupply: bigint;
  acceptedContribution: bigint;
  openingTokenAllocation: bigint;
  poolTokenReserve: bigint;
  poolQuoteReserve: bigint;
};

export function founderAllocation(totalSupply: bigint, founderBps: bigint): bigint {
  if (founderBps > BPS_DENOMINATOR) throw new Error("founderBps too high");
  return (totalSupply * founderBps) / BPS_DENOMINATOR;
}

export function openingAccepted(totalContributed: bigint, openingCap: bigint): bigint {
  return totalContributed < openingCap ? totalContributed : openingCap;
}

export function openingTokenAllocation(
  nonFounderSupply: bigint,
  creatorStake: bigint,
  acceptedContribution: bigint,
): bigint {
  if (acceptedContribution === 0n) return 0n;
  return (nonFounderSupply * acceptedContribution) / (creatorStake + 2n * acceptedContribution);
}

export function launchAllocation(inputs: LaunchInputs): LaunchAllocation {
  const founder = founderAllocation(inputs.totalSupply, inputs.founderBps);
  const nonFounderSupply = inputs.totalSupply - founder;
  const acceptedContribution = openingAccepted(inputs.totalContributed, inputs.openingCap);
  const openingTokens = openingTokenAllocation(
    nonFounderSupply,
    inputs.creatorStake,
    acceptedContribution,
  );
  return {
    founderAllocation: founder,
    nonFounderSupply,
    acceptedContribution,
    openingTokenAllocation: openingTokens,
    poolTokenReserve: nonFounderSupply - openingTokens,
    poolQuoteReserve: inputs.creatorStake + acceptedContribution,
  };
}

export function getAmountOut(
  amountIn: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
  feeBps: bigint,
): bigint {
  if (amountIn <= 0n) throw new Error("amountIn must be positive");
  if (reserveIn <= 0n || reserveOut <= 0n) throw new Error("reserves must be positive");
  if (feeBps >= BPS_DENOMINATOR) throw new Error("feeBps too high");
  const amountInAfterFee = (amountIn * (BPS_DENOMINATOR - feeBps)) / BPS_DENOMINATOR;
  if (amountInAfterFee <= 0n) throw new Error("amountIn after fee is zero");
  const amountOut = (reserveOut * amountInAfterFee) / (reserveIn + amountInAfterFee);
  if (amountOut <= 0n) throw new Error("amountOut is zero");
  return amountOut;
}

export function feeAmount(amount: bigint, feeBps: bigint): bigint {
  if (amount < 0n) throw new Error("amount must not be negative");
  if (feeBps < 0n || feeBps >= BPS_DENOMINATOR) throw new Error("feeBps too high");
  return amount * feeBps / BPS_DENOMINATOR;
}

export function quoteBuyExactQuote(
  quoteIn: bigint,
  reserveQuote: bigint,
  reserveToken: bigint,
  swapFeeBps: bigint,
  protocolFeeBps: bigint,
): { amountOut: bigint; protocolFeeQuote: bigint; poolQuoteIn: bigint } {
  const protocolFeeQuote = feeAmount(quoteIn, protocolFeeBps);
  const poolQuoteIn = quoteIn - protocolFeeQuote;
  return {
    amountOut: getAmountOut(poolQuoteIn, reserveQuote, reserveToken, swapFeeBps),
    protocolFeeQuote,
    poolQuoteIn,
  };
}

export function quoteSellExactTokens(
  tokenIn: bigint,
  reserveToken: bigint,
  reserveQuote: bigint,
  swapFeeBps: bigint,
  protocolFeeBps: bigint,
): { amountOut: bigint; grossQuoteOut: bigint; protocolFeeQuote: bigint } {
  const grossQuoteOut = getAmountOut(tokenIn, reserveToken, reserveQuote, swapFeeBps);
  const protocolFeeQuote = feeAmount(grossQuoteOut, protocolFeeBps);
  return {
    amountOut: grossQuoteOut - protocolFeeQuote,
    grossQuoteOut,
    protocolFeeQuote,
  };
}

export function minimumAmountOut(estimate: bigint, slippageBps: bigint): bigint {
  if (estimate < 0n) throw new Error("estimate must not be negative");
  if (slippageBps < 0n || slippageBps >= BPS_DENOMINATOR) {
    throw new Error("slippageBps out of range");
  }
  return estimate * (BPS_DENOMINATOR - slippageBps) / BPS_DENOMINATOR;
}

export function openingPriceNotBelowPool(allocation: LaunchAllocation): boolean {
  const q = allocation.acceptedContribution;
  const x = allocation.poolTokenReserve;
  const y = allocation.poolQuoteReserve;
  const a = allocation.openingTokenAllocation;
  return q * x >= y * a;
}

export function claimAmounts(
  contribution: bigint,
  totalContributed: bigint,
  openingTokenAllocationValue: bigint,
  acceptedContribution: bigint,
): { tokenAmount: bigint; refundAmount: bigint } {
  if (totalContributed <= 0n) throw new Error("totalContributed must be positive");
  return {
    tokenAmount: (openingTokenAllocationValue * contribution) / totalContributed,
    refundAmount: ((totalContributed - acceptedContribution) * contribution) / totalContributed,
  };
}
