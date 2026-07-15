import { describe, expect, it } from "vitest";
import {
  claimAmounts,
  getAmountOut,
  launchAllocation,
  minimumAmountOut,
  openingPriceNotBelowPool,
  quoteBuyExactQuote,
  quoteSellExactTokens,
} from "./index";

const ether = 10n ** 18n;

describe("rugspull economics", () => {
  it("conserves token supply and keeps opening price above pool spot", () => {
    const a = launchAllocation({
      totalSupply: 1_000_000_000n * ether,
      founderBps: 4_500n,
      creatorStake: 10n * ether,
      totalContributed: 8n * ether,
      openingCap: 5n * ether,
    });
    expect(a.founderAllocation + a.openingTokenAllocation + a.poolTokenReserve).toBe(
      1_000_000_000n * ether,
    );
    expect(a.founderAllocation).toBe(450_000_000n * ether);
    expect(openingPriceNotBelowPool(a)).toBe(true);
  });

  it("claim sums do not exceed allocations", () => {
    const total = 10n * ether;
    const accepted = 5n * ether;
    const allocation = 1_000n * ether;
    const users = [3n * ether, 3n * ether, 4n * ether];
    const sums = users.map((u) => claimAmounts(u, total, allocation, accepted)).reduce(
      (acc, x) => ({
        tokenAmount: acc.tokenAmount + x.tokenAmount,
        refundAmount: acc.refundAmount + x.refundAmount,
      }),
      { tokenAmount: 0n, refundAmount: 0n },
    );
    expect(sums.tokenAmount <= allocation).toBe(true);
    expect(sums.refundAmount <= total - accepted).toBe(true);
  });

  it("AMM output is monotonic", () => {
    const small = getAmountOut(1n * ether, 100n * ether, 200n * ether, 25n);
    const large = getAmountOut(2n * ether, 100n * ether, 200n * ether, 25n);
    expect(large > small).toBe(true);
    expect(large < 200n * ether).toBe(true);
  });

  it("derives a non-zero minimum output from visible slippage", () => {
    expect(minimumAmountOut(100n * ether, 300n)).toBe(97n * ether);
    expect(() => minimumAmountOut(1n, 10_000n)).toThrow("slippageBps");
  });

  it("charges the protocol fee in quote on both swap directions", () => {
    const buy = quoteBuyExactQuote(10n * ether, 100n * ether, 200n * ether, 25n, 5n);
    expect(buy.protocolFeeQuote).toBe(5n * ether / 1_000n);
    expect(buy.poolQuoteIn).toBe(9_995n * ether / 1_000n);

    const sell = quoteSellExactTokens(10n * ether, 200n * ether, 100n * ether, 25n, 5n);
    expect(sell.protocolFeeQuote).toBe(sell.grossQuoteOut * 5n / 10_000n);
    expect(sell.amountOut + sell.protocolFeeQuote).toBe(sell.grossQuoteOut);
  });
});
