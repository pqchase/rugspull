import { rugFactoryAbi, rugInstanceAbi, rugPoolAbi } from "@rugspull/contracts-ts";
import {
  type Address,
  bytesToHex,
  decodeEventLog,
  decodeFunctionResult,
  encodeFunctionData,
  encodeEventTopics,
  getAddress,
  hexToBigInt,
  keccak256,
  numberToHex,
  stringToHex,
} from "viem";

export interface Env {
  ASSETS?: Fetcher;
  DB: D1Database;
  R2: R2Bucket;
  ADMIN_TOKEN?: string;
  TURNSTILE_SECRET?: string;
  ALLOW_UNPROTECTED_UPLOADS?: string;
  FACTORY_ADDRESS?: string;
  FACTORY_SOURCES?: string;
  FACTORY_DEPLOY_BLOCK?: string;
  CHAIN_ID?: string;
  RPC_URL?: string;
  RPC_URLS?: string;
  INDEXER_BLOCK_RANGE?: string;
  INDEXER_STALE_BLOCKS?: string;
}

type RpcLog = {
  address: Address;
  blockNumber: `0x${string}`;
  transactionHash: `0x${string}`;
  logIndex: `0x${string}`;
  topics: [`0x${string}`, ...`0x${string}`[]];
  data: `0x${string}`;
};

type RpcReceipt = {
  blockNumber: `0x${string}`;
  transactionHash: `0x${string}`;
  logs: RpcLog[];
};

type MarketEventRow = {
  tx_hash: string;
  log_index: number;
  block_number: number;
  rug_address: string;
  event_name: string;
  event_json: string;
};

type MarketStatsRow = {
  chain_id: number;
  rug_address: string;
  trade_count: number;
  buy_quote_volume: string;
  sell_quote_volume: string;
  protocol_fee_quote: string;
  latest_price_x18: string;
  updated_block: number;
};

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
  "x-content-type-options": "nosniff",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, cf-turnstile-response, x-turnstile-token",
  "access-control-max-age": "86400",
  "access-control-expose-headers": "link",
  "link": "</.well-known/api-catalog>; rel=\"api-catalog\", </openapi.json>; rel=\"service-desc\", <https://github.com/pqchase/rugspull/blob/main/docs/INTEGRATION.md>; rel=\"service-doc\"",
};
const imageMimeTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const maxImageBytes = 2 * 1024 * 1024;
const EVERGREEN_ROUTE_LABELS = {
  "/how-it-works": "How it works",
  "/contracts": "Contracts",
  "/fees": "Fees",
  "/transparency": "Transparency",
  "/security-model": "Security model",
  "/api-reference": "Read API reference",
  "/founder-allocation-explained": "Founder Allocation explained",
  "/how-to-check-a-smart-contract-on-bscscan": "How to check a BSC smart contract",
  "/crypto-rug-pull-red-flags": "Crypto rug-pull red flags",
  "/what-is-a-crypto-rug-pull": "What is a crypto rug pull?",
  "/rug-pull-vs-liquidity-pull": "Rug pull vs liquidity pull",
  "/rugpool-vs-pancakeswap": "RugPool vs PancakeSwap",
  "/failed-opening-refund-guide": "Failed Opening refund guide",
  "/what-if-founder-never-rugs": "What if the Founder never rugs?",
  "/why-trading-continues-after-rugged": "Why trading continues after Rugged",
  "/24-hour-opening-explained": "24-hour Opening explained",
  "/creator-stake-risk-explained": "Creator stake risk explained",
  "/why-founder-cannot-sell-in-parts": "Why Founder cannot sell in parts",
  "/can-the-creator-contribute": "Can the Creator contribute?",
  "/can-the-creator-cancel-opening": "Can the Creator cancel Opening?",
  "/what-happens-to-excess-contributions": "What happens to excess contributions?",
  "/who-can-finalize-an-opening": "Who can finalize an Opening?",
  "/how-to-claim-opening-tokens": "How to claim Opening tokens",
  "/what-is-wbnb": "What is WBNB?",
  "/what-is-a-token-approval": "What is a token approval?",
  "/what-is-slippage-on-bnb-chain": "What is slippage on BNB Chain?",
  "/constant-product-amm-explained": "Constant-product AMM explained",
  "/what-is-liquidity-on-bnb-chain": "What is liquidity on BNB Chain?",
  "/how-to-read-amm-reserves-on-bscscan": "How to read AMM reserves on BscScan",
  "/what-is-mev-on-bnb-chain": "What is MEV on BNB Chain?",
  "/what-are-alternative-pools-on-bnb-chain": "What are alternative pools on BNB Chain?",
  "/what-are-smart-contract-invariants": "What are smart contract invariants?",
  "/what-does-token-conservation-mean": "What does token conservation mean?",
  "/what-does-wbnb-conservation-mean": "What does WBNB conservation mean?",
  "/what-does-no-double-claim-mean": "What does no double claim mean?",
  "/what-does-no-double-rug-mean": "What does no double rug mean?",
  "/what-does-reserve-reconciliation-mean": "What does reserve reconciliation mean?",
  "/what-does-founder-token-immobility-mean": "What does Founder Token immobility mean?",
  "/what-does-protocol-fee-destination-mean": "What does protocol fee destination mean?",
  "/what-does-non-decreasing-amm-k-mean": "What does non-decreasing AMM k mean?",
  "/what-does-status-monotonicity-mean": "What does lifecycle-status monotonicity mean?",
  "/verified-source-code-does-not-mean-audited": "Why verified source code is not an audit",
  "/why-d1-is-not-financial-truth": "Why D1 is not financial truth",
  "/testnet-lifecycle": "BSC Testnet lifecycle evidence",
  "/office-counter": "Office Counter — evidence snapshot",
  "/lifecycle-templates": "Lifecycle artifact templates",
  "/creator-handbook": "Creator handbook",
  "/community-safety": "Community safety rules",
  "/stage-0-review": "Stage 0 Day 7 gate review",
} as const;
type EvergreenRoute = keyof typeof EVERGREEN_ROUTE_LABELS;

function evergreenRouteForPath(pathname: string): EvergreenRoute | null {
  return (Object.keys(EVERGREEN_ROUTE_LABELS) as EvergreenRoute[])
    .find((route) => pathname === route || pathname.startsWith(`${route}/`)) ?? null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (request.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
        return new Response(null, { status: 204, headers: jsonHeaders });
      }
      if (request.method === "GET" && url.pathname === "/api/health") {
        return json({ ok: true, service: "rugspull-api" });
      }
      if (request.method === "GET" && url.pathname === "/api/config") {
        return json({
          chainId: chainId(env),
          factory: env.FACTORY_ADDRESS ?? null,
          factories: factorySources(env).map((source) => source.address),
          financialTruth: "BSC contracts",
          uploadsProtected: Boolean(env.TURNSTILE_SECRET),
          uploadsEnabled: Boolean(env.TURNSTILE_SECRET) || env.ALLOW_UNPROTECTED_UPLOADS === "1",
        });
      }
      if (request.method === "GET" && url.pathname === "/api/rugs") {
        return listRugs(url, env);
      }
      if (request.method === "GET" && url.pathname === "/api/indexer/status") {
        return indexerStatus(env);
      }
      if (request.method === "GET" && url.pathname === "/api/market/sparklines") {
        return listMarketSparklines(url, env);
      }
      if (request.method === "GET" && url.pathname.startsWith("/api/r2/")) {
        return getR2Object(url, env);
      }
      const rugMatch = url.pathname.match(/^\/api\/rugs\/(\d+)\/(0x[a-fA-F0-9]{40})(\/events|\/market)?$/);
      if (request.method === "GET" && rugMatch?.[3] === "/events") {
        return listEvents(Number(rugMatch[1]), rugMatch[2], env);
      }
      if (request.method === "GET" && rugMatch?.[3] === "/market") {
        return getMarketSeries(Number(rugMatch[1]), rugMatch[2], url, env);
      }
      if (request.method === "GET" && rugMatch) {
        return getRug(Number(rugMatch[1]), rugMatch[2], env);
      }
      if (request.method === "POST" && url.pathname === "/api/indexer/run") {
        return runIndexer(request, env);
      }
      if (request.method === "POST" && url.pathname === "/api/indexer/register-rug") {
        return registerRug(request, env);
      }
      if (request.method === "POST" && url.pathname === "/api/metadata/init") {
        return json({
          maxJsonBytes: 32_768,
          maxImageBytes,
          acceptedMimeTypes: ["application/json"],
          acceptedImageMimeTypes: [...imageMimeTypes],
          immutable: true,
          turnstileProtected: Boolean(env.TURNSTILE_SECRET),
        });
      }
      if (request.method === "POST" && url.pathname === "/api/uploads/finalize") {
        return finalizeUploadBundle(request, env);
      }
      if (request.method === "POST" && url.pathname === "/api/assets/finalize") {
        return finalizeAsset(request, env);
      }
      if (request.method === "POST" && url.pathname === "/api/metadata/finalize") {
        return finalizeMetadata(request, env);
      }
      if (["/api/buy", "/api/sell", "/api/rug", "/api/claim"].includes(url.pathname)) {
        return json({ error: "Financial transactions must be signed directly by the user's wallet." }, 405);
      }
      if (!url.pathname.startsWith("/api/") && env.ASSETS) {
        return serveAsset(request, env);
      }
      return json({ error: "Not found" }, 404);
    } catch (error) {
      console.error("Unhandled API error", error);
      return json({ error: "Internal server error" }, 500);
    }
  },
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const headers = new Headers();
    if (env.ADMIN_TOKEN) headers.set("authorization", `Bearer ${env.ADMIN_TOKEN}`);
    ctx.waitUntil(runIndexer(new Request("https://rugspull.internal/api/indexer/run", { method: "POST", headers }), env));
  },
};

async function serveAsset(request: Request, env: Env): Promise<Response> {
  let response = await env.ASSETS!.fetch(request);
  if (response.status === 404) {
    const fallbackUrl = new URL(request.url);
    fallbackUrl.pathname = "/index.html";
    response = await env.ASSETS!.fetch(new Request(fallbackUrl, request));
  }
  const pathname = new URL(request.url).pathname;
  if (["GET", "HEAD"].includes(request.method) && response.ok && pathname === "/.well-known/api-onboarding") {
    const headers = new Headers(response.headers);
    headers.set("content-type", "application/json; charset=utf-8");
    headers.set("x-content-type-options", "nosniff");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
  const keyMatch = pathname.match(/^\/([A-Za-z0-9-]{8,128})\.txt$/);
  if (request.method === "GET" && response.ok && keyMatch
    && (await response.clone().text()).trim() === keyMatch[1]) {
    const headers = new Headers(response.headers);
    headers.set("content-type", "text/plain; charset=utf-8");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
  if (request.method !== "GET" || !response.headers.get("content-type")?.includes("text/html")) return response;
  const seo = await seoForPath(new URL(request.url).pathname, env);
  const socialImage = socialImageForPath(pathname);
  const structuredData = structuredDataForPath(pathname, seo);
  const rewriter = new HTMLRewriter()
    .on("title", new TextContentHandler(seo.title))
    .on("meta[name='description']", new AttributeHandler("content", seo.description))
    .on("meta[name='robots']", new AttributeHandler("content", seo.robots))
    .on("link[rel='canonical']", new AttributeHandler("href", seo.canonical))
    .on("meta[property='og:title']", new AttributeHandler("content", seo.title))
    .on("meta[property='og:description']", new AttributeHandler("content", seo.description))
    .on("meta[property='og:url']", new AttributeHandler("content", seo.canonical))
    .on("meta[property='og:image']", new AttributeHandler("content", socialImage))
    .on("meta[name='twitter:title']", new AttributeHandler("content", seo.title))
    .on("meta[name='twitter:description']", new AttributeHandler("content", seo.description))
    .on("meta[name='twitter:image']", new AttributeHandler("content", socialImage))
    .on("script[type='application/ld+json']", new JsonLdContentHandler(structuredData));
  return rewriter.transform(response);
}

type SeoMetadata = {
  title: string;
  description: string;
  robots: "index, follow" | "noindex, nofollow";
  canonical: string;
};

class TextContentHandler implements HTMLRewriterElementContentHandlers {
  constructor(private readonly value: string) {}
  element(element: Element) {
    element.setInnerContent(this.value);
  }
}

class AttributeHandler implements HTMLRewriterElementContentHandlers {
  constructor(private readonly attribute: string, private readonly value: string) {}
  element(element: Element) {
    element.setAttribute(this.attribute, this.value);
  }
}

class JsonLdContentHandler implements HTMLRewriterElementContentHandlers {
  constructor(private readonly value: object) {}
  element(element: Element) {
    element.setInnerContent(JSON.stringify(this.value).replace(/</g, "\\u003c"), { html: true });
  }
}

export function structuredDataForPath(pathname: string, seo: SeoMetadata) {
  const website = {
    "@type": "WebSite",
    "@id": "https://rugspull.com/#website",
    name: "Rugspull",
    url: "https://rugspull.com/",
    sameAs: ["https://x.com/rugspull", "https://t.me/rugspullcom", "https://github.com/pqchase/rugspull"],
    contactPoint: { "@type": "ContactPoint", contactType: "customer support", email: "info@rugspull.com" },
  };
  const evergreenRoute = evergreenRouteForPath(pathname);
  if (!evergreenRoute) return { "@context": "https://schema.org", "@graph": [website] };
  return {
    "@context": "https://schema.org",
    "@graph": [
      website,
      {
        "@type": "Article",
        headline: seo.title.replace(/ \| Rugspull$/, ""),
        description: seo.description,
        url: seo.canonical,
        inLanguage: "en",
        mainEntityOfPage: { "@type": "WebPage", "@id": seo.canonical },
        isPartOf: { "@id": "https://rugspull.com/#website" },
        publisher: { "@type": "Organization", name: "Rugspull", url: "https://rugspull.com/" },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Rugspull", item: "https://rugspull.com/" },
          { "@type": "ListItem", position: 2, name: EVERGREEN_ROUTE_LABELS[evergreenRoute], item: seo.canonical },
        ],
      },
    ],
  };
}

export function socialImageForPath(pathname: string) {
  if (pathname.startsWith("/what-is-a-crypto-rug-pull") || pathname.startsWith("/rug-pull-vs-liquidity-pull") || pathname.startsWith("/crypto-rug-pull-red-flags")) {
    return "https://rugspull.com/assets/og-education.png";
  }
  if (pathname.startsWith("/security-model") || pathname.startsWith("/api-reference") || pathname.startsWith("/transparency") || pathname.startsWith("/contracts") || pathname.startsWith("/how-to-check-a-smart-contract-on-bscscan") || pathname.startsWith("/what-are-smart-contract-invariants") || pathname.startsWith("/what-does-token-conservation-mean") || pathname.startsWith("/what-does-wbnb-conservation-mean") || pathname.startsWith("/what-does-no-double-claim-mean") || pathname.startsWith("/what-does-no-double-rug-mean") || pathname.startsWith("/what-does-reserve-reconciliation-mean") || pathname.startsWith("/what-does-founder-token-immobility-mean") || pathname.startsWith("/what-does-protocol-fee-destination-mean") || pathname.startsWith("/what-does-non-decreasing-amm-k-mean") || pathname.startsWith("/what-does-status-monotonicity-mean") || pathname.startsWith("/verified-source-code-does-not-mean-audited") || pathname.startsWith("/why-d1-is-not-financial-truth") || pathname.startsWith("/rugpool-vs-pancakeswap") || pathname.startsWith("/failed-opening-refund-guide") || pathname.startsWith("/what-if-founder-never-rugs") || pathname.startsWith("/testnet-lifecycle") || pathname.startsWith("/office-counter") || pathname.startsWith("/lifecycle-templates") || pathname.startsWith("/creator-handbook") || pathname.startsWith("/community-safety") || pathname.startsWith("/stage-0-review")) {
    return "https://rugspull.com/assets/og-security.png";
  }
  if (pathname.startsWith("/how-it-works") || pathname.startsWith("/fees") || pathname.startsWith("/founder-allocation-explained") || pathname.startsWith("/why-trading-continues-after-rugged") || pathname.startsWith("/24-hour-opening-explained") || pathname.startsWith("/creator-stake-risk-explained") || pathname.startsWith("/why-founder-cannot-sell-in-parts") || pathname.startsWith("/can-the-creator-contribute") || pathname.startsWith("/can-the-creator-cancel-opening") || pathname.startsWith("/what-happens-to-excess-contributions") || pathname.startsWith("/who-can-finalize-an-opening") || pathname.startsWith("/how-to-claim-opening-tokens") || pathname.startsWith("/what-is-wbnb") || pathname.startsWith("/what-is-a-token-approval") || pathname.startsWith("/what-is-slippage-on-bnb-chain") || pathname.startsWith("/constant-product-amm-explained") || pathname.startsWith("/what-is-liquidity-on-bnb-chain") || pathname.startsWith("/how-to-read-amm-reserves-on-bscscan") || pathname.startsWith("/what-is-mev-on-bnb-chain") || pathname.startsWith("/what-are-alternative-pools-on-bnb-chain") || pathname.startsWith("/docs/risk")) {
    return "https://rugspull.com/assets/og-mechanism.png";
  }
  return "https://rugspull.com/assets/community-hall-stage.jpg";
}

export async function seoForPath(pathname: string, env?: Pick<Env, "DB" | "FACTORY_ADDRESS">): Promise<SeoMetadata> {
  const canonicalPath = evergreenRouteForPath(pathname) ?? pathname;
  const canonical = `https://rugspull.com${canonicalPath === "/" ? "/" : canonicalPath}`;
  if (pathname.startsWith("/ops")) {
    return { title: "Backstage | Rugspull", description: "Indexer and deployment diagnostics for Rugspull.", robots: "noindex, nofollow", canonical };
  }
  if (pathname.startsWith("/account/")) {
    return { title: "My Chair | Rugspull", description: "Wallet-specific Rugspull positions and activity.", robots: "noindex, nofollow", canonical };
  }
  if (pathname.startsWith("/create")) {
    return { title: "Create a Rug | Rugspull", description: "Publish a disclosed one-shot founder exit experiment on BNB Smart Chain.", robots: "index, follow", canonical };
  }
  if (pathname.startsWith("/docs/risk")) {
    return { title: "Risk Disclosure | Rugspull", description: "Read the economics, founder sell rules, and total-loss risks before touching a Rug.", robots: "index, follow", canonical };
  }
  if (pathname.startsWith("/how-it-works")) {
    return { title: "How Rugspull Works | Rugspull", description: "Inspect the Opening, founder lock, one-shot sell, and internal WBNB pool rules.", robots: "index, follow", canonical };
  }
  if (pathname.startsWith("/contracts")) {
    return { title: "Rugspull Contracts | Rugspull", description: "Verify the deployed BNB Smart Chain Factory, source, and immutable configuration.", robots: "index, follow", canonical };
  }
  if (pathname.startsWith("/fees")) {
    return { title: "Rugspull Fees | Rugspull", description: "Read the creation fee and canonical pool fee split with worked WBNB examples.", robots: "index, follow", canonical };
  }
  if (pathname.startsWith("/transparency")) {
    return { title: "Rugspull Transparency | Rugspull", description: "See deployment facts, open operational gates, and what the indexer does not control.", robots: "index, follow", canonical };
  }
  if (pathname.startsWith("/security-model")) {
    return { title: "Rugspull Security Model | Rugspull", description: "Inspect the tested invariants, settlement boundary, founder-token controls, and unresolved security gates.", robots: "index, follow", canonical };
  }
  if (pathname.startsWith("/api-reference")) {
    return { title: "Read API Reference | Rugspull", description: "Inspect Rugspull's nine GET-only discovery-cache endpoints, machine-readable specifications, and financial-truth boundaries.", robots: "index, follow", canonical };
  }
  if (pathname.startsWith("/founder-allocation-explained")) {
    return { title: "Founder Allocation Explained | Rugspull", description: "Understand Rugspull's 45% protocol-held Founder Allocation, 48-hour lock, one full sell, and limits of that rule.", robots: "index, follow", canonical };
  }
  if (pathname.startsWith("/how-to-check-a-smart-contract-on-bscscan")) {
    return { title: "How to Check a BSC Smart Contract | Rugspull", description: "A practical BscScan checklist for addresses, verified source, constructor values, privileged functions, balances, events, and audit limits.", robots: "index, follow", canonical };
  }
  if (pathname.startsWith("/crypto-rug-pull-red-flags")) {
    return { title: "Crypto Rug Pull Red Flags | Rugspull", description: "Inspect token controls, liquidity permissions, insider concentration, treasury access, public claims, and the limits of every warning sign.", robots: "index, follow", canonical };
  }
  if (pathname.startsWith("/what-is-a-crypto-rug-pull")) {
    return { title: "What Is a Crypto Rug Pull? | Rugspull", description: "A neutral guide to liquidity pulls, founder sells, hidden token controls, and the limits of on-chain warning signs.", robots: "index, follow", canonical };
  }
  if (pathname.startsWith("/rug-pull-vs-liquidity-pull")) {
    return { title: "Rug Pull vs Liquidity Pull | Rugspull", description: "Compare founder token selling with reserve withdrawal and inspect Rugspull's canonical-pool boundary.", robots: "index, follow", canonical };
  }
  if (pathname.startsWith("/rugpool-vs-pancakeswap")) {
    return { title: "RugPool vs PancakeSwap | Rugspull", description: "Learn why Rugspull's internal canonical WBNB pool is not a PancakeSwap pair, router, LP position, or liquidity-lock claim.", robots: "index, follow", canonical };
  }
  if (pathname.startsWith("/failed-opening-refund-guide")) {
    return { title: "Failed Opening Refund Guide | Rugspull", description: "Verify a Failed Rug, distinguish contributor refunds from Creator stake, and claim WBNB directly without assuming an automatic refund.", robots: "index, follow", canonical };
  }
  if (pathname.startsWith("/what-if-founder-never-rugs")) {
    return { title: "What If the Founder Never Rugs? | Rugspull", description: "Understand why Founder unlock is permission, not a deadline, and what remains true while a Rug stays Active and Still Waiting.", robots: "index, follow", canonical };
  }
  if (pathname.startsWith("/why-trading-continues-after-rugged")) {
    return { title: "Why Trading Continues After Rugged | Rugspull", description: "Learn why Rugged records a Founder Allocation sale without pausing RugPool, and why continued trading does not guarantee liquidity, price, or an exit.", robots: "index, follow", canonical };
  }
  if (pathname.startsWith("/24-hour-opening-explained")) {
    return { title: "24-Hour Opening Explained | Rugspull", description: "Understand Rugspull's 24-hour contribution batch, 30% minimum, 50% acceptance cap, proportional claims, and the risks the window does not remove.", robots: "index, follow", canonical };
  }
  if (pathname.startsWith("/creator-stake-risk-explained")) {
    return { title: "Why Creator Stake Can Lose Money | Rugspull", description: "Trace Creator stake and creation fee through Failed and successful Openings, and learn why Founder sale output is not a stake refund or profit guarantee.", robots: "index, follow", canonical };
  }
  if (pathname.startsWith("/why-founder-cannot-sell-in-parts")) {
    return { title: "Why Founder Cannot Sell in Parts | Rugspull", description: "Inspect why rug() sells the full protocol-held Founder Allocation once, what makes the transaction atomic, and which ordinary-wallet sales remain possible.", robots: "index, follow", canonical };
  }
  if (pathname.startsWith("/can-the-creator-contribute")) {
    return { title: "Can the Creator Contribute? | Rugspull", description: "Learn why the recorded Creator address cannot contribute during Opening, which other wallets can, and why that check is not anti-sybil or a fairness guarantee.", robots: "index, follow", canonical };
  }
  if (pathname.startsWith("/can-the-creator-cancel-opening")) {
    return { title: "Can the Creator Cancel Opening? | Rugspull", description: "Learn why an Opening has no Creator cancellation path, how permissionless finalization selects Failed or Active, and which actions remain after each result.", robots: "index, follow", canonical };
  }
  if (pathname.startsWith("/what-happens-to-excess-contributions")) {
    return { title: "What Happens to Excess Opening Contributions? | Rugspull", description: "Understand Rugspull's 50%-of-stake Opening cap, proportional token and excess-WBNB formulas, wallet claims, and integer-rounding boundary.", robots: "index, follow", canonical };
  }
  if (pathname.startsWith("/who-can-finalize-an-opening")) {
    return { title: "Who Can Finalize an Opening? | Rugspull", description: "Learn when Rugspull finalization becomes available, why any address may call it, how Failed or Active is selected, and why the cutoff is not automatic settlement.", robots: "index, follow", canonical };
  }
  if (pathname.startsWith("/how-to-claim-opening-tokens")) {
    return { title: "How to Claim Opening Tokens | Rugspull", description: "Learn when claimOpening() is available, which wallet must call it, how token and excess-WBNB amounts are calculated, and why claims are one-shot rather than automatic.", robots: "index, follow", canonical };
  }
  if (pathname.startsWith("/what-is-wbnb")) {
    return { title: "What Is WBNB? BNB Chain Quote Asset Guide | Rugspull", description: "Understand how WBNB relates to native BNB, why Rugspull uses it as the only quote asset, which approvals are required, and why native BNB is still needed for gas.", robots: "index, follow", canonical };
  }
  if (pathname.startsWith("/what-is-a-token-approval")) {
    return { title: "What Is a Token Approval on BNB Chain? | Rugspull", description: "Learn what BEP-20 allowances authorize, which Rugspull contract spends for each action, when no approval is needed, and what revoking an allowance can and cannot do.", robots: "index, follow", canonical };
  }
  if (pathname.startsWith("/what-is-slippage-on-bnb-chain")) {
    return { title: "What Is Slippage on BNB Chain? | Rugspull", description: "Learn how estimates, price impact, minimum output, deadlines, and failed slippage checks affect BNB Chain swaps without guaranteeing execution or liquidity.", robots: "index, follow", canonical };
  }
  if (pathname.startsWith("/constant-product-amm-explained")) {
    return { title: "What Is a Constant-Product AMM? | Rugspull", description: "Learn how token and WBNB reserves, x times y, fees, integer rounding, price impact, and uncounted donations affect Rugspull's canonical AMM.", robots: "index, follow", canonical };
  }
  if (pathname.startsWith("/what-is-liquidity-on-bnb-chain")) {
    return { title: "What Is Liquidity on BNB Chain? | Rugspull", description: "Learn how token and WBNB reserve depth affects price impact, execution, Founder sales, and canonical-pool risk without guaranteeing an exit.", robots: "index, follow", canonical };
  }
  if (pathname.startsWith("/how-to-read-amm-reserves-on-bscscan")) {
    return { title: "How to Read AMM Reserves on BscScan | Rugspull", description: "Verify a RugPool address, read stored token and WBNB reserves, reconcile balances and Swap events, and distinguish canonical liquidity from surplus or alternative pools.", robots: "index, follow", canonical };
  }
  if (pathname.startsWith("/what-is-mev-on-bnb-chain")) {
    return { title: "What Is MEV on BNB Chain? | Rugspull", description: "Learn how transaction ordering can change RugPool reserves, swap output, slippage checks, deadlines, Founder sales, and AMM execution risk.", robots: "index, follow", canonical };
  }
  if (pathname.startsWith("/what-are-alternative-pools-on-bnb-chain")) {
    return { title: "What Are Alternative Pools on BNB Chain? | Rugspull", description: "Learn why one RugToken can trade in multiple pools, how to identify the canonical RugPool, and why external reserves, prices, fees, routing, and LP controls stay separate.", robots: "index, follow", canonical };
  }
  if (pathname.startsWith("/what-are-smart-contract-invariants")) {
    return { title: "What Are Smart Contract Invariants? | Rugspull", description: "Learn how Rugspull's Foundry state machine checks seven conservation, reserve, fee, lifecycle, and one-shot properties—and what those tests cannot prove.", robots: "index, follow", canonical };
  }
  if (pathname.startsWith("/what-does-token-conservation-mean")) {
    return { title: "What Does Token Conservation Mean? | Rugspull", description: "Trace RugToken's fixed supply across RugInstance, Opening claims, RugPool swaps, and the one-shot Founder sale—and learn what conservation does not prove.", robots: "index, follow", canonical };
  }
  if (pathname.startsWith("/what-does-wbnb-conservation-mean")) {
    return { title: "What Does WBNB Conservation Mean? | Rugspull", description: "Trace WBNB through creation fees, Creator stake, contributions, refunds, RugPool swaps, protocol fees, and the Founder sale—and learn what conservation does not prove.", robots: "index, follow", canonical };
  }
  if (pathname.startsWith("/what-does-no-double-claim-mean")) {
    return { title: "What Does No Double Claim Mean? | Rugspull", description: "Learn how Rugspull makes successful Opening claims and Failed refunds one-shot per contributing wallet—and what that protection does not prove.", robots: "index, follow", canonical };
  }
  if (pathname.startsWith("/what-does-no-double-rug-mean")) {
    return { title: "What Does No Double Rug Mean? | Rugspull", description: "Learn why Rugspull's protocol-held Founder Allocation can be sold only once in full—and what that one-shot rule does not protect.", robots: "index, follow", canonical };
  }
  if (pathname.startsWith("/what-does-reserve-reconciliation-mean")) {
    return { title: "What Does Reserve Reconciliation Mean? | Rugspull", description: "Learn how RugPool stored token and WBNB reserves match canonical swap balances, why direct transfers create surplus, and how to verify the difference.", robots: "index, follow", canonical };
  }
  if (pathname.startsWith("/what-does-founder-token-immobility-mean")) {
    return { title: "What Does Founder Token Immobility Mean? | Rugspull", description: "Learn why Rugspull keeps the Founder Allocation in RugInstance until its one-shot sale, why unlock does not transfer tokens, and what the custody invariant does not prove.", robots: "index, follow", canonical };
  }
  if (pathname.startsWith("/what-does-protocol-fee-destination-mean")) {
    return { title: "What Does Protocol Fee Destination Mean? | Rugspull", description: "Learn how Rugspull routes creation and swap protocol fees in WBNB, why the pool fee stays in RugPool, and what the destination invariant actually covers.", robots: "index, follow", canonical };
  }
  if (pathname.startsWith("/what-does-non-decreasing-amm-k-mean")) {
    return { title: "What Does Non-Decreasing AMM K Mean? | Rugspull", description: "Learn why RugPool's stored reserve product should not decrease across canonical swaps, how fees and rounding affect k, and what the invariant does not prove.", robots: "index, follow", canonical };
  }
  if (pathname.startsWith("/what-does-status-monotonicity-mean")) {
    return { title: "What Does Lifecycle-Status Monotonicity Mean? | Rugspull", description: "Learn why a RugInstance can move from Opening to Failed or Active, and from Active to Rugged, but cannot reopen or move backward.", robots: "index, follow", canonical };
  }
  if (pathname.startsWith("/verified-source-code-does-not-mean-audited")) {
    return { title: "Verified Source Code Is Not an Audit | Rugspull", description: "Learn what explorer source verification proves, what it leaves unreviewed, and how to check compiler settings, configuration, contracts, tests, and audit scope.", robots: "index, follow", canonical };
  }
  if (pathname.startsWith("/why-d1-is-not-financial-truth")) {
    return { title: "Why Cloudflare D1 Is Not Financial Truth | Rugspull", description: "Learn why Rugspull treats D1 as a rebuildable discovery cache, how to detect indexer lag, and which contract reads and receipts remain authoritative.", robots: "index, follow", canonical };
  }
  if (pathname.startsWith("/testnet-lifecycle")) {
    return { title: "BSC Testnet Lifecycle Evidence | Rugspull", description: "Inspect two clearly labeled BSC Testnet E2E paths: Failed with refund completion and Rugged with post-rug trading and reserve reconciliation.", robots: "index, follow", canonical };
  }
  if (pathname.startsWith("/office-counter")) {
    return { title: "Office Counter — Evidence Snapshot | Rugspull", description: "A dated, evidence-first Rugspull status report covering chain state, tests, TESTNET evidence, distribution, pending reviews, and open operational gates.", robots: "index, follow", canonical };
  }
  if (pathname.startsWith("/lifecycle-templates")) {
    return { title: "Lifecycle Artifact Templates | Rugspull", description: "Reusable, fact-reviewed Permit, Failed, Active, Still Waiting, and Rugged record templates with explicit evidence and risk boundaries.", robots: "index, follow", canonical };
  }
  if (pathname.startsWith("/creator-handbook")) {
    return { title: "Creator Handbook | Rugspull", description: "A TESTNET-first mechanism readback, qualification, disclosure, metadata, communication, and incident checklist for Rugspull Creators.", robots: "index, follow", canonical };
  }
  if (pathname.startsWith("/community-safety")) {
    return { title: "Community Safety Rules | Rugspull", description: "Read Rugspull's public rules for criticism, impersonation, phishing, malicious links, corrections, moderation limits, and stop-amplification triggers.", robots: "index, follow", canonical };
  }
  if (pathname.startsWith("/stage-0-review")) {
    return { title: "Stage 0 Day 7 Gate Review | Rugspull", description: "A dated, evidence-backed review of Rugspull's Telegram, measurement, outreach, incident, staffing, and mainnet activation gates.", robots: "index, follow", canonical };
  }
  const rugMatch = pathname.match(/^\/rug\/(\d+)\/(0x[a-fA-F0-9]{40})$/);
  if (rugMatch) {
    let rugName = "Inspect a Rug";
    let rugSymbol = "";
    let robots: SeoMetadata["robots"] = "index, follow";
    if (env?.DB) {
      const row = await env.DB.prepare("SELECT * FROM rugs WHERE chain_id = ? AND lower(rug_address) = lower(?)")
        .bind(Number(rugMatch[1]), rugMatch[2])
        .first<{ name?: string; symbol?: string; factory_address?: string | null }>()
        .catch(() => null);
      rugName = row?.name?.trim() || rugName;
      rugSymbol = row?.symbol?.trim() ? ` (${row.symbol.trim()})` : "";
      if (row?.factory_address && env.FACTORY_ADDRESS
        && row.factory_address.toLowerCase() !== env.FACTORY_ADDRESS.toLowerCase()) {
        robots = "noindex, nofollow";
      }
    }
    return {
      title: `${rugName}${rugSymbol} | Rugspull`,
      description: "Inspect live chain state, act directly with your wallet, and read the public receipts for this Rug.",
      robots,
      canonical,
    };
  }
  return {
    title: "Rugspull | Disclosed Rugpull Parody on BNB Smart Chain",
    description: "A public parody of rugpull incentives: one disclosed founder sell, no pool-reserve withdrawal, and on-chain settlement.",
    robots: "index, follow",
    canonical: "https://rugspull.com/",
  };
}

async function listRugs(url: URL, env: Env): Promise<Response> {
  const status = normalizeRugStatus(url.searchParams.get("status"));
  if (url.searchParams.has("status") && !status) {
    return json({ error: "Unsupported rug status filter" }, 400);
  }
  const limit = boundedInteger(url.searchParams.get("limit"), 25, 1, 100);
  const cursor = boundedInteger(url.searchParams.get("cursor"), 0, 0, 1_000_000);
  const currentFactory = env.FACTORY_ADDRESS?.toLowerCase();
  if (!currentFactory) return json({ error: "Factory is not configured" }, 503);
  const stmt = status
    ? env.DB.prepare(
      "SELECT * FROM rugs WHERE chain_id = ? AND lower(factory_address) = lower(?) AND status = ? ORDER BY updated_block DESC LIMIT ? OFFSET ?",
    ).bind(chainId(env), currentFactory, status, limit, cursor)
    : env.DB.prepare(
      "SELECT * FROM rugs WHERE chain_id = ? AND lower(factory_address) = lower(?) ORDER BY updated_block DESC LIMIT ? OFFSET ?",
    ).bind(chainId(env), currentFactory, limit, cursor);
  const result = await stmt.all();
  return json({ rugs: result.results ?? [], nextCursor: cursor + (result.results?.length ?? 0) });
}

async function getRug(chainIdValue: number, rug: string, env: Env): Promise<Response> {
  const row = await env.DB.prepare("SELECT * FROM rugs WHERE chain_id = ? AND lower(rug_address) = lower(?)")
    .bind(chainIdValue, rug)
    .first();
  if (!row) return json({ error: "Rug not indexed" }, 404);
  return json({ rug: row });
}

async function listEvents(chainIdValue: number, rug: string, env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    "SELECT * FROM rug_events WHERE chain_id = ? AND lower(rug_address) = lower(?) ORDER BY block_number, log_index LIMIT 100",
  ).bind(chainIdValue, rug).all();
  return json({ events: result.results ?? [] });
}

async function getMarketSeries(chainIdValue: number, rug: string, url: URL, env: Env): Promise<Response> {
  const limit = boundedInteger(url.searchParams.get("limit"), 240, 20, 500);
  const rugAddress = rug.toLowerCase();
  const result = await env.DB.prepare(
    `SELECT * FROM (
       SELECT tx_hash, log_index, block_number, rug_address, event_name, event_json
       FROM rug_events
       WHERE chain_id = ? AND lower(rug_address) = lower(?)
         AND event_name IN ('LaunchSucceeded', 'Swap', 'RugPulled')
       ORDER BY block_number DESC, log_index DESC
       LIMIT ?
     ) ORDER BY block_number, log_index`,
  ).bind(chainIdValue, rugAddress, limit).all<MarketEventRow>();
  const rows = result.results ?? [];
  const lastRugPull = await env.DB.prepare(
    `SELECT tx_hash, log_index, block_number, rug_address, event_name, event_json
     FROM rug_events
     WHERE chain_id = ? AND lower(rug_address) = lower(?) AND event_name = 'RugPulled'
     ORDER BY block_number DESC, log_index DESC LIMIT 1`,
  ).bind(chainIdValue, rugAddress).first<MarketEventRow>();

  const blockTimes = await ensureBlockTimes(
    env,
    chainIdValue,
    [...rows, ...(lastRugPull ? [lastRugPull] : [])].map((row) => row.block_number),
  );
  const rugTransactions = new Set(
    [...rows, ...(lastRugPull ? [lastRugPull] : [])]
      .filter((row) => row.event_name === "RugPulled")
      .map((row) => row.tx_hash.toLowerCase()),
  );

  const points = rows.flatMap((row) => {
    if (row.event_name !== "LaunchSucceeded" && row.event_name !== "Swap") return [];
    const args = parseEventArgs(row.event_json);
    const reserveToken = uintField(args, "reserveToken", "poolTokenReserve");
    const reserveQuote = uintField(args, "reserveQuote", "poolQuoteReserve");
    if (reserveToken === 0n || reserveQuote === 0n) return [];
    const isLaunch = row.event_name === "LaunchSucceeded";
    const isBuy = isLaunch ? null : Boolean(args.isBuy);
    const protocolFeeQuote = isLaunch ? 0n : uintField(args, "protocolFeeQuote");
    const amountIn = isLaunch ? 0n : uintField(args, "amountIn");
    const amountOut = isLaunch ? 0n : uintField(args, "amountOut");
    const quoteVolume = isLaunch
      ? 0n
      : isBuy
        ? amountIn
        : amountOut + protocolFeeQuote;
    const sender = typeof args.sender === "string" ? args.sender.toLowerCase() : "";
    return [{
      blockNumber: row.block_number,
      timestamp: blockTimes.get(row.block_number) ?? null,
      txHash: row.tx_hash,
      side: isLaunch ? "launch" : isBuy ? "buy" : "sell",
      amountIn: amountIn.toString(),
      amountOut: amountOut.toString(),
      quoteVolume: quoteVolume.toString(),
      protocolFeeQuote: protocolFeeQuote.toString(),
      reserveToken: reserveToken.toString(),
      reserveQuote: reserveQuote.toString(),
      priceX18: marketPriceX18(reserveToken, reserveQuote).toString(),
      rugPull: !isLaunch && ((!isBuy && sender === rugAddress) || rugTransactions.has(row.tx_hash.toLowerCase())),
    }];
  });
  const marketStats = await loadMarketStats(env, chainIdValue, rugAddress);
  const firstPrice = points.length > 0 ? BigInt(points[0].priceX18) : 0n;
  const lastPrice = points.length > 0 ? BigInt(points[points.length - 1].priceX18) : 0n;
  const priceChangeBps = firstPrice === 0n ? 0n : (lastPrice - firstPrice) * 10_000n / firstPrice;
  const markers = lastRugPull ? [{
    type: "rugPull",
    blockNumber: lastRugPull.block_number,
    timestamp: blockTimes.get(lastRugPull.block_number) ?? null,
    txHash: lastRugPull.tx_hash,
    founderTokensSold: uintField(parseEventArgs(lastRugPull.event_json), "founderTokensSold").toString(),
    quoteOut: uintField(parseEventArgs(lastRugPull.event_json), "quoteOut").toString(),
  }] : [];

  return json({
    chainId: chainIdValue,
    rug: rugAddress,
    source: "indexed BSC events",
    points,
    markers,
    stats: {
      ...marketStats,
      priceChangeBps: priceChangeBps.toString(),
      visiblePointCount: points.length,
    },
  });
}

async function listMarketSparklines(url: URL, env: Env): Promise<Response> {
  const requestedChain = boundedInteger(url.searchParams.get("chainId"), chainId(env), 1, 1_000_000);
  if (requestedChain !== chainId(env)) return json({ error: "Unsupported chain" }, 400);
  const rawAddresses = (url.searchParams.get("rugs") ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  if (rawAddresses.length > 24) return json({ error: "At most 24 rugs can be requested" }, 400);
  const addresses: string[] = [];
  try {
    for (const value of rawAddresses) addresses.push(getAddress(value).toLowerCase());
  } catch {
    return json({ error: "Invalid Rug address" }, 400);
  }
  const unique = [...new Set(addresses)];
  const sparklines = Object.fromEntries(unique.map((address) => [address, [] as string[]]));
  if (unique.length === 0) return json({ chainId: requestedChain, sparklines });

  const placeholders = unique.map(() => "?").join(", ");
  const result = await env.DB.prepare(
    `SELECT rug_address, block_number, log_index, event_json FROM (
       SELECT rug_address, block_number, log_index, event_json,
         ROW_NUMBER() OVER (
           PARTITION BY lower(rug_address) ORDER BY block_number DESC, log_index DESC
         ) AS point_rank
       FROM rug_events
       WHERE chain_id = ? AND event_name IN ('LaunchSucceeded', 'Swap')
         AND lower(rug_address) IN (${placeholders})
     ) WHERE point_rank <= 16
     ORDER BY lower(rug_address), block_number, log_index`,
  ).bind(requestedChain, ...unique).all<Pick<MarketEventRow, "rug_address" | "block_number" | "log_index" | "event_json">>();
  for (const row of result.results ?? []) {
    const args = parseEventArgs(row.event_json);
    const reserveToken = uintField(args, "reserveToken", "poolTokenReserve");
    const reserveQuote = uintField(args, "reserveQuote", "poolQuoteReserve");
    if (reserveToken === 0n || reserveQuote === 0n) continue;
    const address = row.rug_address.toLowerCase();
    if (!sparklines[address]) continue;
    sparklines[address].push(marketPriceX18(reserveToken, reserveQuote).toString());
  }
  return json({ chainId: requestedChain, sparklines });
}

async function getR2Object(url: URL, env: Env): Promise<Response> {
  const key = decodeURIComponent(url.pathname.replace(/^\/api\/r2\//, ""));
  if (!isPublicR2Key(key)) return json({ error: "Invalid R2 object key" }, 400);
  const object = await env.R2.get(key);
  if (!object) return json({ error: "R2 object not found" }, 404);
  const contentType = object.httpMetadata?.contentType ?? contentTypeForKey(key);
  return new Response(object.body, {
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=31536000, immutable",
      "content-security-policy": "default-src 'none'; sandbox",
      "x-content-type-options": "nosniff",
      "access-control-allow-origin": "*",
    },
  });
}

async function indexerStatus(env: Env): Promise<Response> {
  const chain = chainId(env);
  const staleBlockThreshold = boundedInteger(env.INDEXER_STALE_BLOCKS ?? null, 1_200, 100, 50_000);
  const warnings: string[] = [];
  let latestBlock: number | null = null;
  if (rpcUrls(env).length > 0) {
    try {
      latestBlock = Number(await rpc(env, "eth_blockNumber", []).then((x) => hexToBigInt(x as `0x${string}`)));
    } catch (error) {
      warnings.push(`RPC latest block unavailable: ${errorMessage(error)}`);
    }
  } else {
    warnings.push("RPC_URL is not configured.");
  }
  const result = await env.DB.prepare(
    "SELECT contract_address, last_scanned_block FROM sync_state WHERE chain_id = ? ORDER BY contract_address",
  ).bind(chain).all<{ contract_address: string; last_scanned_block: number }>();
  const sync = result.results ?? [];
  if (latestBlock !== null) {
    for (const source of factorySources(env)) {
      const checkpoint = sync.find((row) => row.contract_address.toLowerCase() === source.address.toLowerCase());
      if (!checkpoint && latestBlock >= source.fromBlock) {
        warnings.push(`Factory ${source.address} has no indexer checkpoint.`);
        continue;
      }
      if (checkpoint) {
        const lag = Math.max(0, latestBlock - Math.max(source.fromBlock, checkpoint.last_scanned_block - 1));
        if (lag > staleBlockThreshold) warnings.push(`Factory ${source.address} indexer is ${lag} blocks behind.`);
      }
    }
  }
  return json({
    chainId: chain,
    latestBlock,
    factories: factorySources(env),
    staleBlockThreshold,
    sync,
    warnings,
  });
}

async function runIndexer(request: Request, env: Env): Promise<Response> {
  if (!env.ADMIN_TOKEN) {
    return json({ error: "Indexer administration is not configured" }, 503);
  }
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (token !== env.ADMIN_TOKEN) {
    return json({ error: "Unauthorized" }, 401);
  }
  if (rpcUrls(env).length === 0 || !env.FACTORY_ADDRESS) {
    return json({ error: "RPC_URL/RPC_URLS and FACTORY_ADDRESS are required" }, 500);
  }

  const chain = chainId(env);
  const latest = Number(await rpc(env, "eth_blockNumber", []).then((x) => hexToBigInt(x as `0x${string}`)));
  const blockRange = boundedInteger(env.INDEXER_BLOCK_RANGE ?? null, 50_000, 100, 50_000);
  let indexed = 0;
  const warnings: string[] = [];

  for (const source of factorySources(env)) {
    const factoryAddress = getAddress(source.address);
    const factoryKey = factoryAddress.toLowerCase();
    let factoryFrom = await readSyncStart(env, chain, factoryKey, source.fromBlock);
    for (let i = 0; i < 10 && factoryFrom <= latest; i++) {
      const factoryTo = Math.min(factoryFrom + blockRange - 1, latest);
      const createdTopic = encodeEventTopics({ abi: rugFactoryAbi, eventName: "RugCreated" })[0];
      let logs: RpcLog[] = [];
      try {
        logs = await getLogs(env, factoryAddress, factoryFrom, factoryTo, [createdTopic]);
      } catch (error) {
        warnings.push(`Factory ${factoryAddress} ${factoryFrom}-${factoryTo}: ${errorMessage(error)}`);
        break;
      }
      for (const log of logs) {
        indexed += await indexFactoryLog(env, chain, log);
      }
      await writeSync(env, chain, factoryKey, factoryTo + 1);
      factoryFrom = factoryTo + 1;
    }
  }

  const rugs = await env.DB.prepare(
    `SELECT r.rug_address, r.created_block
     FROM rugs r
     LEFT JOIN sync_state s
       ON s.chain_id = r.chain_id AND lower(s.contract_address) = lower(r.rug_address)
     WHERE r.chain_id = ?
     ORDER BY COALESCE(s.last_scanned_block, r.created_block) ASC
     LIMIT 100`,
  )
    .bind(chain)
    .all<{ rug_address: string; created_block: number }>();
  for (const row of rugs.results ?? []) {
    const rugAddress = getAddress(row.rug_address);
    const rugKey = rugAddress.toLowerCase();
    let rugFrom = await readSyncStart(env, chain, rugKey, row.created_block);
    for (let i = 0; i < 10 && rugFrom <= latest; i++) {
      const rugTo = Math.min(rugFrom + blockRange - 1, latest);
      let logs: RpcLog[] = [];
      try {
        logs = await getLogs(env, rugAddress, rugFrom, rugTo);
      } catch (error) {
        warnings.push(`Rug ${rugAddress} ${rugFrom}-${rugTo}: ${errorMessage(error)}`);
        break;
      }
      for (const log of logs) {
        indexed += await indexRugLog(env, chain, log);
      }
      await writeSync(env, chain, rugKey, rugTo + 1);
      rugFrom = rugTo + 1;
    }
  }

  const pools = await env.DB.prepare(
    `SELECT r.rug_address, r.pool_address, r.created_block
     FROM rugs r
     LEFT JOIN sync_state s
       ON s.chain_id = r.chain_id AND lower(s.contract_address) = lower(r.pool_address)
     WHERE r.chain_id = ? AND r.pool_address IS NOT NULL
     ORDER BY COALESCE(s.last_scanned_block, r.created_block) ASC
     LIMIT 100`,
  ).bind(chain).all<{ rug_address: string; pool_address: string; created_block: number }>();
  for (const row of pools.results ?? []) {
    const poolAddress = getAddress(row.pool_address);
    const poolKey = poolAddress.toLowerCase();
    let poolFrom = await readSyncStart(env, chain, poolKey, row.created_block);
    for (let i = 0; i < 10 && poolFrom <= latest; i++) {
      const poolTo = Math.min(poolFrom + blockRange - 1, latest);
      let logs: RpcLog[] = [];
      try {
        logs = await getLogs(env, poolAddress, poolFrom, poolTo);
      } catch (error) {
        warnings.push(`Pool ${poolAddress} ${poolFrom}-${poolTo}: ${errorMessage(error)}`);
        break;
      }
      for (const log of logs) {
        indexed += await indexPoolLog(env, chain, log, row.rug_address as Address);
      }
      await writeSync(env, chain, poolKey, poolTo + 1);
      poolFrom = poolTo + 1;
    }
  }

  return json({ ok: true, indexed, latestBlock: latest, warnings });
}

async function registerRug(request: Request, env: Env): Promise<Response> {
  if (rpcUrls(env).length === 0 || !env.FACTORY_ADDRESS) {
    return json({ error: "RPC_URL/RPC_URLS and FACTORY_ADDRESS are required" }, 500);
  }
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return json({ error: "register-rug expects application/json" }, 415);
  }
  const body = await request.json().catch(() => null) as { rug?: unknown; txHash?: unknown } | null;
  if (!body || typeof body.rug !== "string") return json({ error: "Rug address is required" }, 400);
  if (typeof body.txHash !== "string" || !/^0x[a-fA-F0-9]{64}$/.test(body.txHash)) {
    return json({ error: "A valid create transaction hash is required" }, 400);
  }

  let rug: Address;
  try {
    rug = getAddress(body.rug) as Address;
  } catch {
    return json({ error: "Invalid Rug address" }, 400);
  }

  const chain = chainId(env);
  const created = await readCreatedEvent(env, body.txHash, rug);
  if (!created) return json({ error: "RugCreated event was not found in the supplied transaction" }, 400);
  const factory = await readRugAddress(env, rug, "factory");
  const configuredFactories = new Set(factorySources(env).map((source) => source.address.toLowerCase()));
  if (!configuredFactories.has(factory.toLowerCase())) {
    return json({ error: "Rug factory does not match configured Factory" }, 400);
  }

  const creator = created.creator;
  const statusValue = await readRugUint(env, rug, "status");
  const token = await readRugAddress(env, rug, "token").catch(() => "0x0000000000000000000000000000000000000000" as Address);
  const pool = await readRugAddress(env, rug, "pool").catch(() => "0x0000000000000000000000000000000000000000" as Address);
  const metadataURI = await readRugString(env, rug, "metadataURI").catch(() => "");
  const creatorStake = await readRugUint(env, rug, "creatorStake");
  const totalContributed = await readRugUint(env, rug, "totalContributed");
  const acceptedContribution = await readRugUint(env, rug, "acceptedContribution").catch(() => 0n);
  const founderRemaining = await readRugUint(env, rug, "founderRemaining").catch(() => 0n);
  const openingStart = await readRugUint(env, rug, "openingStart");
  const openingEnd = await readRugUint(env, rug, "openingEnd");
  const founderUnlockTime = await readRugUint(env, rug, "founderUnlockTime");
  const createdBlock = created.blockNumber;

  const status = rugStatusName(Number(statusValue));
  await env.DB.prepare(
    `INSERT INTO rugs (
      chain_id, rug_address, factory_address, creator, status, name, symbol, metadata_uri, metadata_hash, disclosure_hash,
      creator_stake, total_contributed, accepted_contribution, founder_remaining, token_address, pool_address,
      opening_start, opening_end, founder_unlock_time, created_block, updated_block
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(chain_id, rug_address) DO UPDATE SET
      factory_address = excluded.factory_address,
      creator = excluded.creator,
      status = excluded.status,
      name = excluded.name,
      symbol = excluded.symbol,
      metadata_uri = excluded.metadata_uri,
      metadata_hash = excluded.metadata_hash,
      disclosure_hash = excluded.disclosure_hash,
      creator_stake = excluded.creator_stake,
      total_contributed = excluded.total_contributed,
      accepted_contribution = excluded.accepted_contribution,
      founder_remaining = excluded.founder_remaining,
      token_address = excluded.token_address,
      pool_address = excluded.pool_address,
      opening_start = excluded.opening_start,
      opening_end = excluded.opening_end,
      founder_unlock_time = excluded.founder_unlock_time,
      updated_block = excluded.updated_block`,
  ).bind(
    chain,
    rug.toLowerCase(),
    factory.toLowerCase(),
    creator.toLowerCase(),
    status,
    created.name,
    created.symbol,
    metadataURI,
    created.metadataHash,
    created.disclosureHash,
    creatorStake.toString(),
    totalContributed.toString(),
    acceptedContribution.toString(),
    founderRemaining.toString(),
    isZeroAddress(token) ? null : token.toLowerCase(),
    isZeroAddress(pool) ? null : pool.toLowerCase(),
    Number(openingStart),
    created.openingEnd || Number(openingEnd),
    Number(founderUnlockTime),
    createdBlock,
    createdBlock,
  ).run();

  return json({ ok: true, rug: rug.toLowerCase(), status });
}

async function readCreatedEvent(env: Env, txHash: string, rug: Address) {
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) return null;
  const receipt = await rpc(env, "eth_getTransactionReceipt", [txHash]) as RpcReceipt | null;
  if (!receipt) return null;
  const configuredFactories = new Set(factorySources(env).map((source) => source.address.toLowerCase()));
  for (const log of receipt.logs) {
    if (!configuredFactories.has(log.address.toLowerCase())) continue;
    try {
      const decoded = decodeEventLog({ abi: rugFactoryAbi, data: log.data, topics: log.topics });
      if (decoded.eventName !== "RugCreated") continue;
      if ((decoded.args.rug as Address).toLowerCase() !== rug.toLowerCase()) continue;
      return {
        blockNumber: blockNumber({ ...log, blockNumber: receipt.blockNumber }),
        creator: getAddress(decoded.args.creator as Address) as Address,
        name: decoded.args.name as string,
        symbol: decoded.args.symbol as string,
        creatorStake: decoded.args.creatorStake as bigint,
        openingEnd: Number(decoded.args.openingEnd),
        metadataHash: decoded.args.metadataHash as `0x${string}`,
        disclosureHash: decoded.args.disclosureHash as `0x${string}`,
      };
    } catch {
      continue;
    }
  }
  return null;
}

async function finalizeUploadBundle(request: Request, env: Env): Promise<Response> {
  const turnstile = await requireTurnstile(request, env);
  if (turnstile) return turnstile;
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return json({ error: "uploads/finalize expects multipart/form-data" }, 415);
  }

  const form = await request.formData().catch(() => null);
  const metadataPart = form?.get("metadata");
  if (typeof metadataPart !== "string") return json({ error: "Metadata JSON is required" }, 400);
  const metadataBytes = new TextEncoder().encode(metadataPart);
  if (metadataBytes.byteLength > 32_768) return json({ error: "Metadata JSON too large" }, 413);

  let parsed: unknown;
  try {
    parsed = JSON.parse(metadataPart);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!isMetadataObject(parsed) || !hasSafeJsonDepth(parsed)) {
    return json({ error: "Metadata must include name, symbol, description, and image strings" }, 400);
  }

  const imagePart = form?.get("image");
  let image: Awaited<ReturnType<typeof storeAsset>> | null = null;
  if (imagePart !== null && imagePart !== undefined) {
    if (typeof imagePart === "string") return json({ error: "Image must be a file" }, 400);
    const imageBuffer = await imagePart.arrayBuffer();
    const imageType = normalizeContentType(imagePart.type);
    const validation = validateImage(imageBuffer, imageType);
    if (validation) return validation;
    image = await storeAsset(imageBuffer, imageType, env);
    parsed = { ...(parsed as Record<string, unknown>), image: image.uri };
  }

  const metadata = await storeMetadata(parsed as Record<string, unknown>, env);
  return json({ ...metadata, image });
}

async function finalizeMetadata(request: Request, env: Env): Promise<Response> {
  const turnstile = await requireTurnstile(request, env);
  if (turnstile) return turnstile;
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return json({ error: "metadata/finalize expects application/json" }, 415);
  }
  const bodyText = await request.text();
  const bytes = new TextEncoder().encode(bodyText);
  if (bytes.byteLength > 32_768) return json({ error: "Metadata JSON too large" }, 413);

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!isMetadataObject(parsed) || !hasSafeJsonDepth(parsed)) {
    return json({ error: "Metadata must include name, symbol, description, and image strings" }, 400);
  }
  return json(await storeMetadata(parsed, env));
}

async function finalizeAsset(request: Request, env: Env): Promise<Response> {
  const turnstile = await requireTurnstile(request, env);
  if (turnstile) return turnstile;
  const contentType = normalizeContentType(request.headers.get("content-type"));
  const body = await request.arrayBuffer();
  const validation = validateImage(body, contentType);
  if (validation) return validation;
  return json(await storeAsset(body, contentType, env));
}

async function storeAsset(body: ArrayBuffer, contentType: string, env: Env) {
  const bytes = new Uint8Array(body);
  const hash = keccak256(bytesToHex(bytes));
  const key = `assets/${hash}${extensionForMime(contentType)}`;
  const existing = await env.R2.head(key);
  if (!existing) {
    await env.R2.put(key, body, {
      httpMetadata: { contentType },
      customMetadata: { hash },
    });
  }
  await env.DB.prepare(
    `INSERT OR IGNORE INTO metadata_objects
      (hash, r2_key, mime_type, byte_size, created_at, uploader)
      VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(hash, key, contentType, body.byteLength, Math.floor(Date.now() / 1000), null).run();
  return { hash, uri: `r2://${key}`, mimeType: contentType, byteSize: body.byteLength };
}

async function storeMetadata(parsed: Record<string, unknown>, env: Env) {
  const canonical = JSON.stringify(sortObject(parsed));
  const canonicalBytes = new TextEncoder().encode(canonical);
  if (canonicalBytes.byteLength > 32_768) throw new Error("Canonical metadata exceeds size limit");
  const hash = keccak256(stringToHex(canonical));
  const key = `metadata/${hash}.json`;
  const existing = await env.R2.head(key);
  if (!existing) {
    await env.R2.put(key, canonical, {
      httpMetadata: { contentType: "application/json; charset=utf-8" },
      customMetadata: { hash },
    });
  }
  await env.DB.prepare(
    `INSERT OR IGNORE INTO metadata_objects
      (hash, r2_key, mime_type, byte_size, created_at, uploader)
      VALUES (?, ?, ?, ?, ?, ?)`,
  ).bind(hash, key, "application/json", canonicalBytes.byteLength, Math.floor(Date.now() / 1000), null).run();
  return { hash, uri: `r2://${key}`, byteSize: canonicalBytes.byteLength };
}

async function requireTurnstile(request: Request, env: Env): Promise<Response | null> {
  if (!env.TURNSTILE_SECRET) {
    if (env.ALLOW_UNPROTECTED_UPLOADS === "1") return null;
    return json({ error: "Metadata uploads are disabled until Turnstile is configured" }, 503);
  }
  const token = request.headers.get("cf-turnstile-response") ?? request.headers.get("x-turnstile-token");
  if (!token) return json({ error: "Turnstile token required" }, 403);

  const body = new URLSearchParams();
  body.set("secret", env.TURNSTILE_SECRET);
  body.set("response", token);
  const remoteIp = request.headers.get("cf-connecting-ip");
  if (remoteIp) body.set("remoteip", remoteIp);

  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return json({ error: "Turnstile verification is unavailable" }, 503);
    const result = await response.json() as { success?: boolean };
    return result.success ? null : json({ error: "Turnstile verification failed" }, 403);
  } catch {
    return json({ error: "Turnstile verification is unavailable" }, 503);
  }
}

async function indexFactoryLog(env: Env, chain: number, log: RpcLog): Promise<number> {
  const decoded = decodeEventLog({
    abi: rugFactoryAbi,
    data: log.data,
    topics: log.topics,
  });
  if (decoded.eventName !== "RugCreated") return 0;
  const args = decoded.args;
  const inserted = await insertEvent(env, chain, log, decoded.eventName, args, args.rug as Address);
  if (!inserted) {
    await env.DB.prepare(
      "UPDATE rugs SET factory_address = ? WHERE chain_id = ? AND lower(rug_address) = lower(?) AND factory_address IS NULL",
    ).bind(log.address.toLowerCase(), chain, args.rug as Address).run();
    return 0;
  }
  const metadataURI = await readRugString(env, args.rug as Address, "metadataURI").catch(() => "");
  const openingStart = await readRugUint(env, args.rug as Address, "openingStart").catch(() => 0n);
  const founderUnlockTime = await readRugUint(env, args.rug as Address, "founderUnlockTime").catch(() => 0n);
  await env.DB.prepare(
    `INSERT INTO rugs (
      chain_id, rug_address, factory_address, creator, status, name, symbol, metadata_uri, metadata_hash, disclosure_hash,
      creator_stake, total_contributed, opening_start, opening_end, founder_unlock_time, created_block, updated_block
    ) VALUES (?, ?, ?, ?, 'Opening', ?, ?, ?, ?, ?, ?, '0', ?, ?, ?, ?, ?)
    ON CONFLICT(chain_id, rug_address) DO UPDATE SET
      factory_address = excluded.factory_address,
      creator = excluded.creator,
      name = excluded.name,
      symbol = excluded.symbol,
      metadata_uri = excluded.metadata_uri,
      metadata_hash = excluded.metadata_hash,
      disclosure_hash = excluded.disclosure_hash,
      creator_stake = excluded.creator_stake,
      opening_start = excluded.opening_start,
      opening_end = excluded.opening_end,
      founder_unlock_time = excluded.founder_unlock_time,
      updated_block = excluded.updated_block`,
  ).bind(
    chain,
    (args.rug as Address).toLowerCase(),
    log.address.toLowerCase(),
    (args.creator as Address).toLowerCase(),
    args.name,
    args.symbol,
    metadataURI,
    args.metadataHash,
    args.disclosureHash,
    args.creatorStake.toString(),
    Number(openingStart),
    Number(args.openingEnd),
    Number(founderUnlockTime),
    blockNumber(log),
    blockNumber(log),
  ).run();
  return 1;
}

async function indexRugLog(env: Env, chain: number, log: RpcLog): Promise<number> {
  let decoded: ReturnType<typeof decodeEventLog>;
  try {
    decoded = decodeEventLog({ abi: rugInstanceAbi, data: log.data, topics: log.topics });
  } catch {
    return 0;
  }
  const args = decoded.args as Record<string, unknown>;
  const rug = ((args.rug as string | undefined) ?? log.address).toLowerCase();
  if (!await insertEvent(env, chain, log, decoded.eventName, args)) return 0;

  if (decoded.eventName === "Contributed") {
    const row = await env.DB.prepare("SELECT total_contributed FROM rugs WHERE chain_id = ? AND rug_address = ?")
      .bind(chain, rug)
      .first<{ total_contributed: string }>();
    const nextTotal = BigInt(row?.total_contributed ?? "0") + (args.amount as bigint);
    await env.DB.prepare("UPDATE rugs SET total_contributed = ?, updated_block = ? WHERE chain_id = ? AND rug_address = ?")
      .bind(nextTotal.toString(), blockNumber(log), chain, rug)
      .run();
  }
  if (decoded.eventName === "LaunchFailed") {
    await env.DB.prepare("UPDATE rugs SET status = 'Failed', total_contributed = ?, updated_block = ? WHERE chain_id = ? AND rug_address = ?")
      .bind((args.totalContributed as bigint).toString(), blockNumber(log), chain, rug)
      .run();
  }
  if (decoded.eventName === "LaunchSucceeded") {
    await env.DB.prepare(
      `UPDATE rugs SET status = 'Active', token_address = ?, pool_address = ?, total_contributed = ?,
       accepted_contribution = ?, founder_allocation = ?, founder_remaining = ?, updated_block = ?
       WHERE chain_id = ? AND rug_address = ?`,
    ).bind(
      (args.token as Address).toLowerCase(),
      (args.pool as Address).toLowerCase(),
      (args.totalContributed as bigint).toString(),
      (args.acceptedContribution as bigint).toString(),
      (args.founderAllocation as bigint).toString(),
      (args.founderAllocation as bigint).toString(),
      blockNumber(log),
      chain,
      rug,
    ).run();
  }
  if (decoded.eventName === "RugPulled") {
    await env.DB.prepare("UPDATE rugs SET status = 'Rugged', founder_remaining = '0', updated_block = ? WHERE chain_id = ? AND rug_address = ?")
      .bind(blockNumber(log), chain, rug)
      .run();
  }
  return 1;
}

async function indexPoolLog(env: Env, chain: number, log: RpcLog, rugAddress: Address): Promise<number> {
  let decoded: ReturnType<typeof decodeEventLog>;
  try {
    decoded = decodeEventLog({ abi: rugPoolAbi, data: log.data, topics: log.topics });
  } catch {
    return 0;
  }
  if (decoded.eventName !== "Swap") return 0;
  const inserted = await insertEvent(env, chain, log, decoded.eventName, decoded.args, rugAddress);
  if (!inserted) return 0;
  await applySwapToMarketStats(
    env,
    chain,
    rugAddress.toLowerCase(),
    decoded.args as Record<string, unknown>,
    blockNumber(log),
  );
  return 1;
}

async function insertEvent(env: Env, chain: number, log: RpcLog, eventName: string, args: unknown, rugAddress?: Address) {
  const result = await env.DB.prepare(
    `INSERT OR IGNORE INTO rug_events
      (chain_id, tx_hash, log_index, block_number, rug_address, event_name, event_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    chain,
    log.transactionHash,
    Number(hexToBigInt(log.logIndex)),
    blockNumber(log),
    (rugAddress ?? log.address).toLowerCase(),
    eventName,
    JSON.stringify(args, (_, value) => (typeof value === "bigint" ? value.toString() : value)),
  ).run();
  return (result.meta?.changes ?? 0) > 0;
}

async function applySwapToMarketStats(
  env: Env,
  chain: number,
  rug: string,
  args: Record<string, unknown>,
  updatedBlock: number,
) {
  const current = await env.DB.prepare(
    "SELECT * FROM rug_market_stats WHERE chain_id = ? AND lower(rug_address) = lower(?)",
  ).bind(chain, rug).first<MarketStatsRow>();
  const next = addSwapToStats(current ?? emptyMarketStats(chain, rug), args, updatedBlock);
  await writeMarketStats(env, next);
}

async function loadMarketStats(env: Env, chain: number, rug: string) {
  const [current, countRow] = await Promise.all([
    env.DB.prepare(
      "SELECT * FROM rug_market_stats WHERE chain_id = ? AND lower(rug_address) = lower(?)",
    ).bind(chain, rug).first<MarketStatsRow>(),
    env.DB.prepare(
      "SELECT COUNT(*) AS trade_count FROM rug_events WHERE chain_id = ? AND lower(rug_address) = lower(?) AND event_name = 'Swap'",
    ).bind(chain, rug).first<{ trade_count: number }>(),
  ]);
  const indexedTradeCount = Number(countRow?.trade_count ?? 0);
  if (current && current.trade_count === indexedTradeCount) {
    return publicMarketStats(current, true);
  }

  const result = await env.DB.prepare(
    `SELECT event_json, block_number FROM rug_events
     WHERE chain_id = ? AND lower(rug_address) = lower(?) AND event_name = 'Swap'
     ORDER BY block_number, log_index LIMIT 5001`,
  ).bind(chain, rug).all<Pick<MarketEventRow, "event_json" | "block_number">>();
  const rows = result.results ?? [];
  const complete = indexedTradeCount <= 5_000 && rows.length === indexedTradeCount;
  let rebuilt = emptyMarketStats(chain, rug);
  for (const row of rows.slice(0, 5_000)) {
    rebuilt = addSwapToStats(rebuilt, parseEventArgs(row.event_json), row.block_number);
  }
  if (complete) await writeMarketStats(env, rebuilt);
  return publicMarketStats(rebuilt, complete);
}

function emptyMarketStats(chain: number, rug: string): MarketStatsRow {
  return {
    chain_id: chain,
    rug_address: rug.toLowerCase(),
    trade_count: 0,
    buy_quote_volume: "0",
    sell_quote_volume: "0",
    protocol_fee_quote: "0",
    latest_price_x18: "0",
    updated_block: 0,
  };
}

function addSwapToStats(current: MarketStatsRow, args: Record<string, unknown>, updatedBlock: number): MarketStatsRow {
  const isBuy = Boolean(args.isBuy);
  const amountIn = uintField(args, "amountIn");
  const amountOut = uintField(args, "amountOut");
  const protocolFee = uintField(args, "protocolFeeQuote");
  const reserveToken = uintField(args, "reserveToken");
  const reserveQuote = uintField(args, "reserveQuote");
  const quoteVolume = isBuy ? amountIn : amountOut + protocolFee;
  return {
    ...current,
    trade_count: current.trade_count + 1,
    buy_quote_volume: (BigInt(current.buy_quote_volume) + (isBuy ? quoteVolume : 0n)).toString(),
    sell_quote_volume: (BigInt(current.sell_quote_volume) + (isBuy ? 0n : quoteVolume)).toString(),
    protocol_fee_quote: (BigInt(current.protocol_fee_quote) + protocolFee).toString(),
    latest_price_x18: marketPriceX18(reserveToken, reserveQuote).toString(),
    updated_block: updatedBlock,
  };
}

async function writeMarketStats(env: Env, stats: MarketStatsRow) {
  await env.DB.prepare(
    `INSERT INTO rug_market_stats (
       chain_id, rug_address, trade_count, buy_quote_volume, sell_quote_volume,
       protocol_fee_quote, latest_price_x18, updated_block
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(chain_id, rug_address) DO UPDATE SET
       trade_count = excluded.trade_count,
       buy_quote_volume = excluded.buy_quote_volume,
       sell_quote_volume = excluded.sell_quote_volume,
       protocol_fee_quote = excluded.protocol_fee_quote,
       latest_price_x18 = excluded.latest_price_x18,
       updated_block = excluded.updated_block`,
  ).bind(
    stats.chain_id,
    stats.rug_address,
    stats.trade_count,
    stats.buy_quote_volume,
    stats.sell_quote_volume,
    stats.protocol_fee_quote,
    stats.latest_price_x18,
    stats.updated_block,
  ).run();
}

function publicMarketStats(stats: MarketStatsRow, complete: boolean) {
  return {
    tradeCount: stats.trade_count,
    buyQuoteVolume: stats.buy_quote_volume,
    sellQuoteVolume: stats.sell_quote_volume,
    protocolFeeQuote: stats.protocol_fee_quote,
    latestPriceX18: stats.latest_price_x18,
    updatedBlock: stats.updated_block,
    complete,
  };
}

async function readRugString(env: Env, rug: Address, functionName: "metadataURI"): Promise<string> {
  const data = encodeFunctionData({ abi: rugInstanceAbi, functionName });
  const result = await rpc(env, "eth_call", [{ to: rug, data }, "latest"]);
  return decodeFunctionResult({ abi: rugInstanceAbi, functionName, data: result as `0x${string}` });
}

async function readRugUint(
  env: Env,
  rug: Address,
  functionName:
    | "acceptedContribution"
    | "creatorStake"
    | "founderRemaining"
    | "founderUnlockTime"
    | "openingEnd"
    | "openingStart"
    | "status"
    | "totalContributed",
): Promise<bigint> {
  const data = encodeFunctionData({ abi: rugInstanceAbi, functionName } as never);
  const result = await rpc(env, "eth_call", [{ to: rug, data }, "latest"]);
  return BigInt(decodeFunctionResult({ abi: rugInstanceAbi, functionName, data: result as `0x${string}` } as never) as bigint | number);
}

async function readRugAddress(env: Env, rug: Address, functionName: "creator" | "factory" | "pool" | "token"): Promise<Address> {
  const data = encodeFunctionData({ abi: rugInstanceAbi, functionName } as never);
  const result = await rpc(env, "eth_call", [{ to: rug, data }, "latest"]);
  return getAddress(decodeFunctionResult({ abi: rugInstanceAbi, functionName, data: result as `0x${string}` } as never) as string) as Address;
}

async function getLogs(
  env: Env,
  address: Address,
  fromBlock: number,
  toBlock: number,
  topics?: [`0x${string}`, ...(`0x${string}` | null)[]],
): Promise<RpcLog[]> {
  return rpc(env, "eth_getLogs", [{
    address,
    fromBlock: numberToHex(fromBlock),
    toBlock: numberToHex(toBlock),
    topics,
  }]) as Promise<RpcLog[]>;
}

async function rpc(env: Env, method: string, params: unknown[]): Promise<unknown> {
  let lastError: unknown = new Error("No RPC endpoint configured");
  for (const url of rpcUrls(env)) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`RPC returned HTTP ${response.status}`);
      const body = await response.json() as { result?: unknown; error?: { message?: string } };
      if (body.error) throw new Error(body.error.message ?? "RPC error");
      if (!("result" in body)) throw new Error("RPC response did not include a result");
      return body.result;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function readSyncStart(env: Env, chain: number, key: string, fallback: number) {
  const row = await env.DB.prepare(
    "SELECT last_scanned_block FROM sync_state WHERE chain_id = ? AND lower(contract_address) = lower(?)",
  ).bind(chain, key).first<{ last_scanned_block: number }>();
  return row?.last_scanned_block ?? fallback;
}

async function writeSync(env: Env, chain: number, key: string, block: number) {
  await env.DB.prepare(
    `INSERT INTO sync_state (chain_id, contract_address, last_scanned_block)
     VALUES (?, ?, ?)
     ON CONFLICT(chain_id, contract_address) DO UPDATE SET last_scanned_block = excluded.last_scanned_block`,
  ).bind(chain, key, block).run();
}

function chainId(env: Env) {
  return Number(env.CHAIN_ID ?? "56");
}

function factorySources(env: Env): Array<{ address: Address; fromBlock: number }> {
  const raw = env.FACTORY_SOURCES || (env.FACTORY_ADDRESS ? `${env.FACTORY_ADDRESS}@${env.FACTORY_DEPLOY_BLOCK ?? "0"}` : "");
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [address, block] = item.split("@");
      return { address: getAddress(address) as Address, fromBlock: Number(block ?? env.FACTORY_DEPLOY_BLOCK ?? "0") };
    });
}

function rpcUrls(env: Env) {
  return [...new Set([
    env.RPC_URL,
    ...(env.RPC_URLS ?? "").split(","),
  ].map((url) => url?.trim()).filter((url): url is string => Boolean(url)))];
}

function isMetadataObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (!["name", "symbol", "description", "image"].every((key) => typeof record[key] === "string")) return false;
  const name = record.name as string;
  const symbol = record.symbol as string;
  const description = record.description as string;
  const image = record.image as string;
  return name.trim().length > 0 && name.length <= 64
    && symbol.trim().length > 0 && symbol.length <= 12
    && description.length <= 2_000
    && image.length <= 2_048;
}

function hasSafeJsonDepth(value: unknown, depth = 0): boolean {
  if (depth > 32) return false;
  if (Array.isArray(value)) return value.every((entry) => hasSafeJsonDepth(entry, depth + 1));
  if (!value || typeof value !== "object") return true;
  return Object.values(value as Record<string, unknown>).every((entry) => hasSafeJsonDepth(entry, depth + 1));
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== "object") return value;
  const out = Object.create(null) as Record<string, unknown>;
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    out[key] = sortObject((value as Record<string, unknown>)[key]);
  }
  return out;
}

function normalizeContentType(value: string | null) {
  return (value ?? "").split(";")[0].trim().toLowerCase();
}

function extensionForMime(mime: string) {
  if (mime === "image/jpeg") return ".jpg";
  return `.${mime.split("/")[1]}`;
}

function isPublicR2Key(key: string) {
  return /^(metadata\/0x[a-fA-F0-9]{64}\.json|assets\/0x[a-fA-F0-9]{64}\.(png|jpg|webp|gif))$/.test(key);
}

function contentTypeForKey(key: string) {
  if (key.endsWith(".json")) return "application/json; charset=utf-8";
  if (key.endsWith(".jpg")) return "image/jpeg";
  return `image/${key.split(".").pop()}`;
}

function validateImage(body: ArrayBuffer, contentType: string): Response | null {
  if (!imageMimeTypes.has(contentType)) {
    return json({ error: "Image must be png, jpeg, webp, or gif" }, 415);
  }
  if (body.byteLength === 0) return json({ error: "Image body is empty" }, 400);
  if (body.byteLength > maxImageBytes) return json({ error: "Image too large" }, 413);
  const bytes = new Uint8Array(body);
  const matches = contentType === "image/png"
    ? bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value)
    : contentType === "image/jpeg"
      ? bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      : contentType === "image/gif"
        ? bytes.length >= 6 && new TextDecoder().decode(bytes.slice(0, 6)).match(/^GIF8[79]a$/) !== null
        : bytes.length >= 12
          && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF"
          && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  return matches ? null : json({ error: "Image bytes do not match the declared content type" }, 415);
}

async function ensureBlockTimes(env: Env, chain: number, rawBlocks: number[]) {
  const blocks = [...new Set(rawBlocks.filter((block) => Number.isInteger(block) && block >= 0))];
  const times = new Map<number, number>();
  if (blocks.length === 0) return times;
  const placeholders = blocks.map(() => "?").join(", ");
  const cached = await env.DB.prepare(
    `SELECT block_number, block_timestamp FROM block_times
     WHERE chain_id = ? AND block_number IN (${placeholders})`,
  ).bind(chain, ...blocks).all<{ block_number: number; block_timestamp: number }>();
  for (const row of cached.results ?? []) times.set(row.block_number, row.block_timestamp);

  const missing = blocks.filter((block) => !times.has(block));
  for (let offset = 0; offset < missing.length; offset += 8) {
    const batch = missing.slice(offset, offset + 8);
    const fetched = await Promise.all(batch.map(async (block) => {
      try {
        const value = await rpc(env, "eth_getBlockByNumber", [numberToHex(block), false]) as { timestamp?: `0x${string}` } | null;
        if (!value?.timestamp) return null;
        return { block, timestamp: Number(hexToBigInt(value.timestamp)) };
      } catch {
        return null;
      }
    }));
    for (const item of fetched) {
      if (!item) continue;
      times.set(item.block, item.timestamp);
      await env.DB.prepare(
        `INSERT INTO block_times (chain_id, block_number, block_timestamp) VALUES (?, ?, ?)
         ON CONFLICT(chain_id, block_number) DO UPDATE SET block_timestamp = excluded.block_timestamp`,
      ).bind(chain, item.block, item.timestamp).run();
    }
  }
  return times;
}

function parseEventArgs(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function uintField(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "bigint" && value >= 0n) return value;
    if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
    if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  }
  return 0n;
}

function marketPriceX18(reserveToken: bigint, reserveQuote: bigint) {
  if (reserveToken === 0n || reserveQuote === 0n) return 0n;
  return reserveQuote * 10n ** 18n / reserveToken;
}

function blockNumber(log: RpcLog) {
  return Number(hexToBigInt(log.blockNumber));
}

function boundedInteger(raw: string | null, fallback: number, min: number, max: number) {
  if (raw === null || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function normalizeRugStatus(raw: string | null) {
  if (raw === null || raw.trim() === "") return null;
  const lower = raw.trim().toLowerCase();
  if (lower === "opening") return "Opening";
  if (lower === "failed") return "Failed";
  if (lower === "active") return "Active";
  if (lower === "rugged") return "Rugged";
  return null;
}

function rugStatusName(status: number) {
  if (status === 0) return "Opening";
  if (status === 1) return "Failed";
  if (status === 2) return "Active";
  if (status === 3) return "Rugged";
  return "Opening";
}

function isZeroAddress(address: Address) {
  return address.toLowerCase() === "0x0000000000000000000000000000000000000000";
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}
