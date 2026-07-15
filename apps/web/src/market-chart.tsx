import { useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import { formatEther } from "viem";

export type MarketSide = "launch" | "buy" | "sell";
export type MarketRange = "1h" | "6h" | "24h" | "all";
export type MarketView = "price" | "volume" | "pool";

export type MarketPoint = {
  blockNumber: number;
  timestamp: number | null;
  txHash: string;
  side: MarketSide;
  amountIn: string;
  amountOut: string;
  quoteVolume: string;
  protocolFeeQuote: string;
  reserveToken: string;
  reserveQuote: string;
  priceX18: string;
  rugPull: boolean;
};

export type MarketMarker = {
  type: "rugPull";
  blockNumber: number;
  timestamp: number | null;
  txHash: string;
  founderTokensSold: string;
  quoteOut: string;
};

export type MarketResponse = {
  chainId: number;
  rug: string;
  source: string;
  points: MarketPoint[];
  markers: MarketMarker[];
  stats: {
    tradeCount: number;
    buyQuoteVolume: string;
    sellQuoteVolume: string;
    protocolFeeQuote: string;
    latestPriceX18: string;
    updatedBlock: number;
    complete: boolean;
    priceChangeBps: string;
    visiblePointCount: number;
  };
};

const WIDTH = 960;
const HEIGHT = 320;
const PLOT = { left: 68, right: 22, top: 30, bottom: 48 };
const MARKET_LOCALE = "en-US";

export function filterMarketPoints(points: MarketPoint[], range: MarketRange, nowSeconds?: number) {
  if (range === "all") return points;
  const seconds = range === "1h" ? 3_600 : range === "6h" ? 21_600 : 86_400;
  const timestamped = points.filter((point) => point.timestamp !== null);
  if (timestamped.length === 0) return points;
  const now = nowSeconds ?? Math.max(...timestamped.map((point) => point.timestamp as number));
  const filtered = points.filter((point) => point.timestamp === null || point.timestamp >= now - seconds);
  return filtered.length > 0 ? filtered : points.slice(-1);
}

export function buildLinePath(values: number[], width = WIDTH, height = HEIGHT) {
  if (values.length === 0) return "";
  const plotWidth = width - PLOT.left - PLOT.right;
  const plotHeight = height - PLOT.top - PLOT.bottom;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || Math.max(Math.abs(max), 1);
  return values.map((value, index) => {
    const x = PLOT.left + (values.length === 1 ? plotWidth / 2 : index / (values.length - 1) * plotWidth);
    const y = PLOT.top + (max === min ? plotHeight / 2 : (max - value) / span * plotHeight);
    return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
}

export function formatMarketPriceX18(value: string) {
  const price = Number(value) / 1e18;
  if (!Number.isFinite(price) || price <= 0) return "-";
  if (price >= 1) return `${price.toLocaleString(MARKET_LOCALE, { maximumFractionDigits: 6 })} WBNB`;
  if (price >= 0.0001) return `${price.toLocaleString(MARKET_LOCALE, { maximumFractionDigits: 8 })} WBNB`;
  return `${price.toExponential(3)} WBNB`;
}

export function MiniMarketChart({ prices, status }: { prices: string[]; status: string }) {
  const values = prices.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0);
  const path = buildMiniPath(values);
  return (
    <span className="mini-market" aria-label={`Price history, ${values.length} indexed points`}>
      <svg viewBox="0 0 120 34" role="img" aria-hidden="true">
        <path className="mini-market-baseline" d="M2 26 L118 26" />
        {path ? <path className="mini-market-line" data-status={status} d={path} /> : null}
      </svg>
      <small>{values.length > 1 ? `${values.length} ticks` : "No trades"}</small>
    </span>
  );
}

export function MarketBoard({ market, loading }: { market: MarketResponse | null; loading: boolean }) {
  const [view, setView] = useState<MarketView>("price");
  const [range, setRange] = useState<MarketRange>("all");
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const points = useMemo(() => filterMarketPoints(market?.points ?? [], range), [market?.points, range]);
  const hovered = hoveredIndex === null ? null : points[hoveredIndex] ?? null;
  const totalVolume = market
    ? BigInt(market.stats.buyQuoteVolume) + BigInt(market.stats.sellQuoteVolume)
    : 0n;

  return (
    <section className="market-board" aria-label="On-chain market chart">
      <header className="market-board-heading">
        <div>
          <span className="board-label">Community hall market blackboard</span>
          <h2>THE LINE KNOWS WHAT YOU DID.</h2>
          <p>Prices and totals reconstructed from canonical pool events. Settlement still comes from the contracts.</p>
        </div>
        <span className="market-source">CHAIN EVENT CACHE</span>
      </header>

      <div className="market-metrics">
        <MarketMetric label="Last price" value={formatMarketPriceX18(market?.stats.latestPriceX18 ?? "0")} />
        <MarketMetric label="Trades" value={market ? market.stats.tradeCount.toLocaleString(MARKET_LOCALE) : "-"} />
        <MarketMetric label="WBNB volume" value={formatWbnb(totalVolume.toString())} />
        <MarketMetric label="Protocol fees" value={formatWbnb(market?.stats.protocolFeeQuote ?? "0")} />
      </div>

      <div className="market-controls">
        <div className="market-tabs" role="tablist" aria-label="Market chart view">
          <ChartTab label="Price" selected={view === "price"} onClick={() => setView("price")} />
          <ChartTab label="Volume" selected={view === "volume"} onClick={() => setView("volume")} />
          <ChartTab label="Pool" selected={view === "pool"} onClick={() => setView("pool")} />
        </div>
        <div className="market-ranges" role="group" aria-label="Chart time range">
          {(["1h", "6h", "24h", "all"] as MarketRange[]).map((value) => (
            <button key={value} type="button" aria-pressed={range === value} onClick={() => setRange(value)}>
              {value.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="market-canvas-wrap">
        {loading ? <div className="market-empty"><strong>Chalk is checking the chain.</strong></div> : null}
        {!loading && points.length === 0 ? (
          <div className="market-empty">
            <strong>Nobody traded.</strong>
            <span>The graph has declined to invent a personality.</span>
          </div>
        ) : null}
        {!loading && points.length > 0 ? (
          <MarketSvg
            markers={market?.markers ?? []}
            points={points}
            view={view}
            hoveredIndex={hoveredIndex}
            onHover={setHoveredIndex}
          />
        ) : null}
        {hovered ? <ChartTooltip point={hovered} view={view} index={hoveredIndex ?? 0} count={points.length} /> : null}
      </div>

      <footer className="market-legend">
        <span><i className="legend-buy" />Buy</span>
        <span><i className="legend-sell" />Sell</span>
        <span><i className="legend-rug" />Founder Rug</span>
        {view === "pool" || (market && !market.stats.complete) ? (
          <b>{[view === "pool" ? "Reserves normalized separately" : "", market && !market.stats.complete ? "Visible history only" : ""].filter(Boolean).join(" · ")}</b>
        ) : null}
      </footer>
    </section>
  );
}

function MarketSvg({
  points,
  markers,
  view,
  hoveredIndex,
  onHover,
}: {
  points: MarketPoint[];
  markers: MarketMarker[];
  view: MarketView;
  hoveredIndex: number | null;
  onHover(index: number | null): void;
}) {
  const plotWidth = WIDTH - PLOT.left - PLOT.right;
  const xAt = (index: number) => PLOT.left + (points.length === 1 ? plotWidth / 2 : index / (points.length - 1) * plotWidth);
  const handlePointer = (event: ReactPointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width * WIDTH;
    const ratio = Math.max(0, Math.min(1, (x - PLOT.left) / plotWidth));
    onHover(Math.round(ratio * Math.max(0, points.length - 1)));
  };
  const priceValues = points.map((point) => Number(point.priceX18) / 1e18);
  const tokenValues = points.map((point) => Number(formatEther(BigInt(point.reserveToken))));
  const quoteValues = points.map((point) => Number(formatEther(BigInt(point.reserveQuote))));
  const markerIndexes = [...new Set([
    ...points.flatMap((point, index) => point.rugPull ? [index] : []),
    ...markers
      .filter((marker) => marker.blockNumber >= points[0].blockNumber && marker.blockNumber <= points[points.length - 1].blockNumber)
      .map((marker) => nearestBlockIndex(points, marker.blockNumber)),
  ])];

  return (
    <svg
      className="market-svg"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={`${view} chart with ${points.length} indexed points`}
      onPointerMove={handlePointer}
      onPointerLeave={() => onHover(null)}
    >
      <rect className="chart-paper" x="0" y="0" width={WIDTH} height={HEIGHT} />
      {[0, 1, 2, 3, 4].map((line) => {
        const y = PLOT.top + line / 4 * (HEIGHT - PLOT.top - PLOT.bottom);
        return <path className="chart-grid" d={`M${PLOT.left} ${y} H${WIDTH - PLOT.right}`} key={line} />;
      })}
      {view === "price" ? <PriceLayer points={points} values={priceValues} xAt={xAt} /> : null}
      {view === "volume" ? <VolumeLayer points={points} xAt={xAt} /> : null}
      {view === "pool" ? <PoolLayer tokenValues={tokenValues} quoteValues={quoteValues} /> : null}
      {markerIndexes.map((index) => (
        <g className="rug-marker" key={`rug-${index}`}>
          <path d={`M${xAt(index)} ${PLOT.top - 7} V${HEIGHT - PLOT.bottom}`} />
          <text x={Math.min(xAt(index) + 8, WIDTH - 150)} y={PLOT.top + 14}>RUG PULLED</text>
        </g>
      ))}
      {hoveredIndex !== null ? (
        <path className="chart-crosshair" d={`M${xAt(hoveredIndex)} ${PLOT.top} V${HEIGHT - PLOT.bottom}`} />
      ) : null}
      <text className="chart-axis-label" x={PLOT.left} y={HEIGHT - 16}>{pointTime(points[0])}</text>
      <text className="chart-axis-label chart-axis-end" x={WIDTH - PLOT.right} y={HEIGHT - 16}>{pointTime(points[points.length - 1])}</text>
    </svg>
  );
}

function PriceLayer({ points, values, xAt }: { points: MarketPoint[]; values: number[]; xAt(index: number): number }) {
  const path = buildLinePath(values);
  const yAt = valuePositions(values);
  return (
    <g>
      <path className="price-line-shadow" d={path} />
      <path className="price-line" d={path} />
      {points.map((point, index) => point.side === "launch" ? null : (
        <circle
          className={point.side === "buy" ? "trade-dot buy-dot" : "trade-dot sell-dot"}
          cx={xAt(index)}
          cy={yAt[index]}
          key={`${point.txHash}-${index}`}
          r={point.rugPull ? 7 : 4.5}
        />
      ))}
    </g>
  );
}

function VolumeLayer({ points, xAt }: { points: MarketPoint[]; xAt(index: number): number }) {
  const values = points.map((point) => Number(formatEther(BigInt(point.quoteVolume))));
  const max = Math.max(...values, 0.000000001);
  const plotHeight = HEIGHT - PLOT.top - PLOT.bottom;
  const barWidth = Math.max(4, Math.min(32, (WIDTH - PLOT.left - PLOT.right) / Math.max(points.length, 1) * 0.62));
  return (
    <g>
      {points.map((point, index) => {
        const height = values[index] / max * plotHeight;
        return <rect
          className={point.side === "sell" ? "volume-bar sell-bar" : "volume-bar buy-bar"}
          height={Math.max(point.side === "launch" ? 0 : 2, height)}
          key={`${point.txHash}-${index}`}
          width={barWidth}
          x={xAt(index) - barWidth / 2}
          y={HEIGHT - PLOT.bottom - height}
        />;
      })}
    </g>
  );
}

function PoolLayer({ tokenValues, quoteValues }: { tokenValues: number[]; quoteValues: number[] }) {
  return (
    <g>
      <path className="pool-token-line" d={buildNormalizedPath(tokenValues)} />
      <path className="pool-quote-line" d={buildNormalizedPath(quoteValues)} />
      <text className="pool-label pool-token-label" x={PLOT.left + 8} y={PLOT.top + 18}>TOKEN RESERVE</text>
      <text className="pool-label pool-quote-label" x={PLOT.left + 8} y={PLOT.top + 38}>WBNB RESERVE</text>
    </g>
  );
}

function ChartTooltip({ point, view, index, count }: { point: MarketPoint; view: MarketView; index: number; count: number }) {
  const left = count <= 1 ? 50 : Math.max(12, Math.min(78, index / (count - 1) * 100));
  const primary = view === "price"
    ? formatMarketPriceX18(point.priceX18)
    : view === "volume"
      ? formatWbnb(point.quoteVolume)
      : `${formatWbnb(point.reserveQuote)} / ${formatCompactToken(point.reserveToken)}`;
  return (
    <div className="chart-tooltip" style={{ left: `${left}%` }}>
      <strong>{point.rugPull ? "FOUNDER RUG" : point.side.toUpperCase()}</strong>
      <span>{primary}</span>
      <small>{pointTime(point)} · block {point.blockNumber}</small>
    </div>
  );
}

function ChartTab({ label, selected, onClick }: { label: string; selected: boolean; onClick(): void }) {
  return <button type="button" role="tab" aria-selected={selected} onClick={onClick}>{label}</button>;
}

function MarketMetric({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function valuePositions(values: number[]) {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || Math.max(Math.abs(max), 1);
  const plotHeight = HEIGHT - PLOT.top - PLOT.bottom;
  return values.map((value) => PLOT.top + (max === min ? plotHeight / 2 : (max - value) / span * plotHeight));
}

function buildNormalizedPath(values: number[]) {
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const normalized = values.map((value) => max === min ? 0.5 : (value - min) / (max - min));
  return buildLinePath(normalized);
}

function buildMiniPath(values: number[]) {
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  return values.map((value, index) => {
    const x = 2 + (values.length === 1 ? 58 : index / (values.length - 1) * 116);
    const y = max === min ? 17 : 4 + (max - value) / (max - min) * 24;
    return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
}

function nearestBlockIndex(points: MarketPoint[], blockNumber: number) {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  points.forEach((point, index) => {
    const distance = Math.abs(point.blockNumber - blockNumber);
    if (distance < bestDistance) {
      bestIndex = index;
      bestDistance = distance;
    }
  });
  return bestIndex;
}

function formatWbnb(value: string) {
  const amount = Number(formatEther(BigInt(value || "0")));
  if (!Number.isFinite(amount)) return "-";
  if (amount === 0) return "0 WBNB";
  if (amount < 0.000001) return `${amount.toExponential(2)} WBNB`;
  return `${amount.toLocaleString(MARKET_LOCALE, { maximumFractionDigits: 6 })} WBNB`;
}

function formatCompactToken(value: string) {
  const amount = Number(formatEther(BigInt(value || "0")));
  return `${amount.toLocaleString(MARKET_LOCALE, { maximumFractionDigits: 2, notation: "compact" })} token`;
}

function pointTime(point: MarketPoint) {
  if (point.timestamp === null) return `Block ${point.blockNumber}`;
  return new Date(point.timestamp * 1_000).toLocaleString(MARKET_LOCALE, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
