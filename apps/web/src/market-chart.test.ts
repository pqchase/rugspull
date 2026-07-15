import { describe, expect, it } from "vitest";
import { buildLinePath, filterMarketPoints, formatMarketPriceX18, type MarketPoint } from "./market-chart";

const point = (timestamp: number | null, priceX18: string): MarketPoint => ({
  blockNumber: 1,
  timestamp,
  txHash: `0x${"1".repeat(64)}`,
  side: "buy",
  amountIn: "0",
  amountOut: "0",
  quoteVolume: "0",
  protocolFeeQuote: "0",
  reserveToken: "1",
  reserveQuote: "1",
  priceX18,
  rugPull: false,
});

describe("market chart helpers", () => {
  it("filters timestamped points without dropping untimestamped chain evidence", () => {
    const points = [point(1_000, "1"), point(null, "2"), point(4_500, "3")];
    expect(filterMarketPoints(points, "1h", 4_600)).toEqual(points);
    expect(filterMarketPoints(points, "1h", 10_000)).toEqual([points[1]]);
    expect(filterMarketPoints(points, "all", 10_000)).toEqual(points);
  });

  it("builds stable paths for one point and flat markets", () => {
    expect(buildLinePath([])).toBe("");
    expect(buildLinePath([5])).toContain("M503.00,151.00");
    expect(buildLinePath([5, 5])).toContain("L938.00,151.00");
  });

  it("formats tiny WBNB prices without rounding them to zero", () => {
    expect(formatMarketPriceX18("5000000000")).toBe("5.000e-9 WBNB");
    expect(formatMarketPriceX18("0")).toBe("-");
  });
});
