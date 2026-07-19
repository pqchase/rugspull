import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  AtSign,
  ArrowDownUp,
  CircleDollarSign,
  ClipboardList,
  ChevronDown,
  ExternalLink,
  FlaskConical,
  FolderGit2,
  Gauge,
  Hand,
  Home,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  ShieldAlert,
  Send,
  Ticket,
  UserRound,
  Wallet,
} from "lucide-react";
import {
  DEPLOYMENTS,
  bscMainnet,
  erc20Abi,
  rugFactoryAbi,
  rugInstanceAbi,
  rugPoolAbi,
  wbnbAbi,
} from "@rugspull/contracts-ts";
import { claimAmounts, minimumAmountOut, quoteBuyExactQuote, quoteSellExactTokens } from "@rugspull/economics";
import { createPublicClient, createWalletClient, custom, formatEther, http, isAddress, keccak256, parseEther, stringToHex } from "viem";
import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "@fontsource/barriecito/400.css";
import "./styles.css";
import { ACTIVE_CHAIN_ID, ACTIVE_WBNB_ADDRESS } from "./chain-config";
import { MarketBoard, MiniMarketChart, type MarketResponse } from "./market-chart";
import { firstAuthorizedAccount, restoreAuthorizedAccount, type Eip1193Provider } from "./wallet-session";

const RugStage = React.lazy(() => import("./RugStage").then((module) => ({ default: module.RugStage })));

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
    turnstile?: {
      render(container: HTMLElement, options: { sitekey: string; callback(token: string): void; "expired-callback"(): void }): string;
      reset(widgetId?: string): void;
    };
  }
}

type Address = `0x${string}`;
type Status = "Opening" | "Failed" | "Active" | "Rugged";
type IndexedRug = {
  chain_id: number | string;
  rug_address: Address;
  factory_address?: Address | null;
  creator: Address;
  status: Status;
  name: string;
  symbol: string;
  metadata_uri?: string;
  metadata_hash?: `0x${string}`;
  creator_stake: string;
  total_contributed: string;
  founder_remaining?: string | null;
};
type IndexedEvent = {
  tx_hash: string;
  log_index: number;
  block_number: number;
  event_name: string;
  event_json: string;
};
type AccountPosition = {
  rug: IndexedRug;
  contribution: bigint;
  claimed: boolean;
};
type ViewerPosition = {
  contribution: bigint;
  claimed: boolean;
};
type RugMetadata = {
  name?: string;
  symbol?: string;
  description?: string;
  image?: string;
};
type ApiConfig = {
  chainId: number;
  factory: Address | null;
  factories: Address[];
  financialTruth: string;
  uploadsProtected: boolean;
  uploadsEnabled: boolean;
};
type IndexerStatus = {
  chainId: number;
  latestBlock: number | null;
  factories: { address: Address; fromBlock: number }[];
  sync: { contract_address: Address; last_scanned_block: number }[];
  warnings: string[];
};

const CHAIN_ID = ACTIVE_CHAIN_ID;
const WBNB_ADDRESS = ACTIVE_WBNB_ADDRESS as Address;
const FACTORY_ADDRESS = (import.meta.env.VITE_FACTORY_ADDRESS ?? DEPLOYMENTS[56].rugFactory) as Address;
const API_BASE = import.meta.env.VITE_API_BASE ?? "";
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "";
const ZERO = "0x0000000000000000000000000000000000000000" as Address;

const publicClient = createPublicClient({
  chain: bscMainnet,
  transport: http(import.meta.env.VITE_BSC_MAINNET_RPC ?? bscMainnet.rpcUrls.default.http[0]),
});

async function waitForSuccess(hash: `0x${string}`) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`Transaction reverted: ${hash}`);
  return receipt;
}

const statusLabels: Status[] = ["Opening", "Failed", "Active", "Rugged"];
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

function App() {
  const wallet = useWallet();
  const path = usePathname();
  useDocumentMetadata(path);
  if (path.startsWith("/create")) {
    return <Shell path={path} wallet={wallet}><CreatePage wallet={wallet} /></Shell>;
  }
  if (path.startsWith("/rug/")) {
    return <Shell path={path} wallet={wallet}><RugPage key={path} wallet={wallet} /></Shell>;
  }
  if (path.startsWith("/account/")) {
    return <Shell path={path} wallet={wallet}><AccountPage key={path} wallet={wallet} /></Shell>;
  }
  if (path.startsWith("/ops")) {
    return <Shell path={path} wallet={wallet}><OpsPage /></Shell>;
  }
  if (path.startsWith("/docs/risk")) {
    return <Shell path={path} wallet={wallet}><RiskPage /></Shell>;
  }
  const evergreenRoute = evergreenRouteForPath(path);
  if (evergreenRoute) {
    return <Shell path={path} wallet={wallet}><FactPage path={evergreenRoute} /></Shell>;
  }
  return <Shell path={path} wallet={wallet}><HomePage /></Shell>;
}

function usePathname() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const syncPath = () => setPath(window.location.pathname);
    window.addEventListener("popstate", syncPath);
    return () => window.removeEventListener("popstate", syncPath);
  }, []);
  return path;
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}

function useDocumentMetadata(path: string) {
  useEffect(() => {
    const route = path.startsWith("/create")
      ? { title: "Create a Rug | Rugspull", description: "Publish a disclosed one-shot founder exit experiment on BNB Smart Chain.", robots: "index, follow" }
      : path.startsWith("/rug/")
        ? { title: "Inspect a Rug | Rugspull", description: "Inspect chain state, act directly with your wallet, and read the public receipts.", robots: "index, follow" }
        : path.startsWith("/docs/risk")
          ? { title: "Risk Disclosure | Rugspull", description: "Read the economics, founder sell rules, and total-loss risks before touching a Rug.", robots: "index, follow" }
          : path.startsWith("/how-it-works")
            ? { title: "How Rugspull Works | Rugspull", description: "Inspect the Opening, founder lock, one-shot sell, and internal WBNB pool rules.", robots: "index, follow" }
            : path.startsWith("/contracts")
              ? { title: "Rugspull Contracts | Rugspull", description: "Verify the deployed BNB Smart Chain Factory, source, and immutable configuration.", robots: "index, follow" }
              : path.startsWith("/fees")
                ? { title: "Rugspull Fees | Rugspull", description: "Read the creation fee and canonical pool fee split with worked WBNB examples.", robots: "index, follow" }
                : path.startsWith("/transparency")
                  ? { title: "Rugspull Transparency | Rugspull", description: "See deployment facts, open operational gates, and what the indexer does not control.", robots: "index, follow" }
                  : path.startsWith("/security-model")
                    ? { title: "Rugspull Security Model | Rugspull", description: "Inspect the tested invariants, settlement boundary, founder-token controls, and unresolved security gates.", robots: "index, follow" }
                    : path.startsWith("/api-reference")
                      ? { title: "Read API Reference | Rugspull", description: "Inspect Rugspull's nine GET-only discovery-cache endpoints, machine-readable specifications, and financial-truth boundaries.", robots: "index, follow" }
                    : path.startsWith("/founder-allocation-explained")
                      ? { title: "Founder Allocation Explained | Rugspull", description: "Understand Rugspull's 45% protocol-held Founder Allocation, 48-hour lock, one full sell, and limits of that rule.", robots: "index, follow" }
                      : path.startsWith("/how-to-check-a-smart-contract-on-bscscan")
                        ? { title: "How to Check a BSC Smart Contract | Rugspull", description: "A practical BscScan checklist for addresses, verified source, constructor values, privileged functions, balances, events, and audit limits.", robots: "index, follow" }
                        : path.startsWith("/crypto-rug-pull-red-flags")
                          ? { title: "Crypto Rug Pull Red Flags | Rugspull", description: "Inspect token controls, liquidity permissions, insider concentration, treasury access, public claims, and the limits of every warning sign.", robots: "index, follow" }
                    : path.startsWith("/what-is-a-crypto-rug-pull")
                      ? { title: "What Is a Crypto Rug Pull? | Rugspull", description: "A neutral guide to liquidity pulls, founder sells, hidden token controls, and the limits of on-chain warning signs.", robots: "index, follow" }
                      : path.startsWith("/rug-pull-vs-liquidity-pull")
                        ? { title: "Rug Pull vs Liquidity Pull | Rugspull", description: "Compare founder token selling with reserve withdrawal and inspect Rugspull's canonical-pool boundary.", robots: "index, follow" }
                      : path.startsWith("/rugpool-vs-pancakeswap")
                        ? { title: "RugPool vs PancakeSwap | Rugspull", description: "Learn why Rugspull's internal canonical WBNB pool is not a PancakeSwap pair, router, LP position, or liquidity-lock claim.", robots: "index, follow" }
                      : path.startsWith("/failed-opening-refund-guide")
                        ? { title: "Failed Opening Refund Guide | Rugspull", description: "Verify a Failed Rug, distinguish contributor refunds from Creator stake, and claim WBNB directly without assuming an automatic refund.", robots: "index, follow" }
                      : path.startsWith("/what-if-founder-never-rugs")
                        ? { title: "What If the Founder Never Rugs? | Rugspull", description: "Understand why Founder unlock is permission, not a deadline, and what remains true while a Rug stays Active and Still Waiting.", robots: "index, follow" }
                      : path.startsWith("/why-trading-continues-after-rugged")
                        ? { title: "Why Trading Continues After Rugged | Rugspull", description: "Learn why Rugged records a Founder Allocation sale without pausing RugPool, and why continued trading does not guarantee liquidity, price, or an exit.", robots: "index, follow" }
                      : path.startsWith("/24-hour-opening-explained")
                        ? { title: "24-Hour Opening Explained | Rugspull", description: "Understand Rugspull's 24-hour contribution batch, 30% minimum, 50% acceptance cap, proportional claims, and the risks the window does not remove.", robots: "index, follow" }
                      : path.startsWith("/creator-stake-risk-explained")
                        ? { title: "Why Creator Stake Can Lose Money | Rugspull", description: "Trace Creator stake and creation fee through Failed and successful Openings, and learn why Founder sale output is not a stake refund or profit guarantee.", robots: "index, follow" }
                      : path.startsWith("/why-founder-cannot-sell-in-parts")
                        ? { title: "Why Founder Cannot Sell in Parts | Rugspull", description: "Inspect why rug() sells the full protocol-held Founder Allocation once, what makes the transaction atomic, and which ordinary-wallet sales remain possible.", robots: "index, follow" }
                      : path.startsWith("/can-the-creator-contribute")
                        ? { title: "Can the Creator Contribute? | Rugspull", description: "Learn why the recorded Creator address cannot contribute during Opening, which other wallets can, and why that check is not anti-sybil or a fairness guarantee.", robots: "index, follow" }
                      : path.startsWith("/can-the-creator-cancel-opening")
                        ? { title: "Can the Creator Cancel Opening? | Rugspull", description: "Learn why an Opening has no Creator cancellation path, how permissionless finalization selects Failed or Active, and which actions remain after each result.", robots: "index, follow" }
                      : path.startsWith("/what-happens-to-excess-contributions")
                        ? { title: "What Happens to Excess Opening Contributions? | Rugspull", description: "Understand Rugspull's 50%-of-stake Opening cap, proportional token and excess-WBNB formulas, wallet claims, and integer-rounding boundary.", robots: "index, follow" }
                      : path.startsWith("/who-can-finalize-an-opening")
                        ? { title: "Who Can Finalize an Opening? | Rugspull", description: "Learn when Rugspull finalization becomes available, why any address may call it, how Failed or Active is selected, and why the cutoff is not automatic settlement.", robots: "index, follow" }
                      : path.startsWith("/how-to-claim-opening-tokens")
                        ? { title: "How to Claim Opening Tokens | Rugspull", description: "Learn when claimOpening() is available, which wallet must call it, how token and excess-WBNB amounts are calculated, and why claims are one-shot rather than automatic.", robots: "index, follow" }
                      : path.startsWith("/what-is-wbnb")
                        ? { title: "What Is WBNB? BNB Chain Quote Asset Guide | Rugspull", description: "Understand how WBNB relates to native BNB, why Rugspull uses it as the only quote asset, which approvals are required, and why native BNB is still needed for gas.", robots: "index, follow" }
                      : path.startsWith("/what-is-a-token-approval")
                        ? { title: "What Is a Token Approval on BNB Chain? | Rugspull", description: "Learn what BEP-20 allowances authorize, which Rugspull contract spends for each action, when no approval is needed, and what revoking an allowance can and cannot do.", robots: "index, follow" }
                      : path.startsWith("/what-is-slippage-on-bnb-chain")
                        ? { title: "What Is Slippage on BNB Chain? | Rugspull", description: "Learn how estimates, price impact, minimum output, deadlines, and failed slippage checks affect BNB Chain swaps without guaranteeing execution or liquidity.", robots: "index, follow" }
                      : path.startsWith("/constant-product-amm-explained")
                        ? { title: "What Is a Constant-Product AMM? | Rugspull", description: "Learn how token and WBNB reserves, x times y, fees, integer rounding, price impact, and uncounted donations affect Rugspull's canonical AMM.", robots: "index, follow" }
                      : path.startsWith("/what-is-liquidity-on-bnb-chain")
                        ? { title: "What Is Liquidity on BNB Chain? | Rugspull", description: "Learn how token and WBNB reserve depth affects price impact, execution, Founder sales, and canonical-pool risk without guaranteeing an exit.", robots: "index, follow" }
                      : path.startsWith("/how-to-read-amm-reserves-on-bscscan")
                        ? { title: "How to Read AMM Reserves on BscScan | Rugspull", description: "Verify a RugPool address, read stored token and WBNB reserves, reconcile balances and Swap events, and distinguish canonical liquidity from surplus or alternative pools.", robots: "index, follow" }
                      : path.startsWith("/what-is-mev-on-bnb-chain")
                        ? { title: "What Is MEV on BNB Chain? | Rugspull", description: "Learn how transaction ordering can change RugPool reserves, swap output, slippage checks, deadlines, Founder sales, and AMM execution risk.", robots: "index, follow" }
                      : path.startsWith("/what-are-alternative-pools-on-bnb-chain")
                        ? { title: "What Are Alternative Pools on BNB Chain? | Rugspull", description: "Learn why one RugToken can trade in multiple pools, how to identify the canonical RugPool, and why external reserves, prices, fees, routing, and LP controls stay separate.", robots: "index, follow" }
                      : path.startsWith("/what-are-smart-contract-invariants")
                        ? { title: "What Are Smart Contract Invariants? | Rugspull", description: "Learn how Rugspull's Foundry state machine checks seven conservation, reserve, fee, lifecycle, and one-shot properties—and what those tests cannot prove.", robots: "index, follow" }
                      : path.startsWith("/verified-source-code-does-not-mean-audited")
                        ? { title: "Verified Source Code Is Not an Audit | Rugspull", description: "Learn what explorer source verification proves, what it leaves unreviewed, and how to check compiler settings, configuration, contracts, tests, and audit scope.", robots: "index, follow" }
                      : path.startsWith("/why-d1-is-not-financial-truth")
                        ? { title: "Why Cloudflare D1 Is Not Financial Truth | Rugspull", description: "Learn why Rugspull treats D1 as a rebuildable discovery cache, how to detect indexer lag, and which contract reads and receipts remain authoritative.", robots: "index, follow" }
                      : path.startsWith("/testnet-lifecycle")
                        ? { title: "BSC Testnet Lifecycle Evidence | Rugspull", description: "Inspect two clearly labeled BSC Testnet E2E paths: Failed with refund completion and Rugged with post-rug trading and reserve reconciliation.", robots: "index, follow" }
                      : path.startsWith("/office-counter")
                        ? { title: "Office Counter — Evidence Snapshot | Rugspull", description: "A dated, evidence-first Rugspull status report covering chain state, tests, TESTNET evidence, distribution, pending reviews, and open operational gates.", robots: "index, follow" }
                      : path.startsWith("/lifecycle-templates")
                        ? { title: "Lifecycle Artifact Templates | Rugspull", description: "Reusable, fact-reviewed Permit, Failed, Active, Still Waiting, and Rugged record templates with explicit evidence and risk boundaries.", robots: "index, follow" }
                      : path.startsWith("/creator-handbook")
                        ? { title: "Creator Handbook | Rugspull", description: "A TESTNET-first mechanism readback, qualification, disclosure, metadata, communication, and incident checklist for Rugspull Creators.", robots: "index, follow" }
                      : path.startsWith("/community-safety")
                        ? { title: "Community Safety Rules | Rugspull", description: "Read Rugspull's public rules for criticism, impersonation, phishing, malicious links, corrections, moderation limits, and stop-amplification triggers.", robots: "index, follow" }
                      : path.startsWith("/stage-0-review")
                        ? { title: "Stage 0 Day 7 Gate Review | Rugspull", description: "A dated, evidence-backed review of Rugspull's Telegram, measurement, outreach, incident, staffing, and mainnet activation gates.", robots: "index, follow" }
          : path.startsWith("/ops")
            ? { title: "Backstage | Rugspull", description: "Indexer and deployment diagnostics for Rugspull.", robots: "noindex, nofollow" }
            : path.startsWith("/account/")
              ? { title: "My Chair | Rugspull", description: "View Rugs and positions associated with a wallet.", robots: "noindex, nofollow" }
              : { title: "Rugspull | Disclosed Rugpull Parody on BNB Smart Chain", description: "A public parody of rugpull incentives: one disclosed founder sell, no pool-reserve withdrawal, and on-chain settlement.", robots: "index, follow" };
    const canonicalPath = evergreenRouteForPath(path) ?? path;
    const canonical = `https://rugspull.com${canonicalPath === "/" ? "/" : canonicalPath}`;
    const socialImage = socialImageForPath(path);
    document.title = route.title;
    setMeta("meta[name='description']", "content", route.description);
    setMeta("meta[name='robots']", "content", route.robots);
    setMeta("meta[property='og:title']", "content", route.title);
    setMeta("meta[property='og:description']", "content", route.description);
    setMeta("meta[property='og:url']", "content", canonical);
    setMeta("meta[property='og:image']", "content", socialImage);
    setMeta("meta[name='twitter:title']", "content", route.title);
    setMeta("meta[name='twitter:description']", "content", route.description);
    setMeta("meta[name='twitter:image']", "content", socialImage);
    setMeta("link[rel='canonical']", "href", canonical);
    setStructuredData(path, route.title, route.description, canonical);
  }, [path]);
}

function setStructuredData(pathname: string, title: string, description: string, canonical: string) {
  const script = document.querySelector<HTMLScriptElement>("script[type='application/ld+json']");
  if (!script) return;
  script.textContent = JSON.stringify(structuredDataForPath(pathname, title, description, canonical));
}

function structuredDataForPath(pathname: string, title: string, description: string, canonical: string) {
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
  const headline = title.replace(/ \| Rugspull$/, "");
  return {
    "@context": "https://schema.org",
    "@graph": [
      website,
      {
        "@type": "Article",
        headline,
        description,
        url: canonical,
        inLanguage: "en",
        mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
        isPartOf: { "@id": "https://rugspull.com/#website" },
        publisher: { "@type": "Organization", name: "Rugspull", url: "https://rugspull.com/" },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Rugspull", item: "https://rugspull.com/" },
          { "@type": "ListItem", position: 2, name: EVERGREEN_ROUTE_LABELS[evergreenRoute], item: canonical },
        ],
      },
    ],
  };
}

function socialImageForPath(pathname: string) {
  if (pathname.startsWith("/what-is-a-crypto-rug-pull") || pathname.startsWith("/rug-pull-vs-liquidity-pull") || pathname.startsWith("/crypto-rug-pull-red-flags")) {
    return "https://rugspull.com/assets/og-education.png";
  }
  if (pathname.startsWith("/security-model") || pathname.startsWith("/api-reference") || pathname.startsWith("/transparency") || pathname.startsWith("/contracts") || pathname.startsWith("/how-to-check-a-smart-contract-on-bscscan") || pathname.startsWith("/what-are-smart-contract-invariants") || pathname.startsWith("/verified-source-code-does-not-mean-audited") || pathname.startsWith("/why-d1-is-not-financial-truth") || pathname.startsWith("/rugpool-vs-pancakeswap") || pathname.startsWith("/failed-opening-refund-guide") || pathname.startsWith("/what-if-founder-never-rugs") || pathname.startsWith("/office-counter") || pathname.startsWith("/lifecycle-templates") || pathname.startsWith("/creator-handbook") || pathname.startsWith("/community-safety") || pathname.startsWith("/stage-0-review")) {
    return "https://rugspull.com/assets/og-security.png";
  }
  if (pathname.startsWith("/how-it-works") || pathname.startsWith("/fees") || pathname.startsWith("/founder-allocation-explained") || pathname.startsWith("/why-trading-continues-after-rugged") || pathname.startsWith("/24-hour-opening-explained") || pathname.startsWith("/creator-stake-risk-explained") || pathname.startsWith("/why-founder-cannot-sell-in-parts") || pathname.startsWith("/can-the-creator-contribute") || pathname.startsWith("/can-the-creator-cancel-opening") || pathname.startsWith("/what-happens-to-excess-contributions") || pathname.startsWith("/who-can-finalize-an-opening") || pathname.startsWith("/how-to-claim-opening-tokens") || pathname.startsWith("/what-is-wbnb") || pathname.startsWith("/what-is-a-token-approval") || pathname.startsWith("/what-is-slippage-on-bnb-chain") || pathname.startsWith("/constant-product-amm-explained") || pathname.startsWith("/what-is-liquidity-on-bnb-chain") || pathname.startsWith("/how-to-read-amm-reserves-on-bscscan") || pathname.startsWith("/what-is-mev-on-bnb-chain") || pathname.startsWith("/what-are-alternative-pools-on-bnb-chain") || pathname.startsWith("/docs/risk")) {
    return "https://rugspull.com/assets/og-mechanism.png";
  }
  return "https://rugspull.com/assets/community-hall-stage.jpg";
}

function setMeta(selector: string, attribute: string, value: string) {
  document.head.querySelector(selector)?.setAttribute(attribute, value);
}

function useWallet() {
  const [account, setAccount] = useState<Address | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      setMessage("No injected wallet found.");
      return null;
    }
    setPending(true);
    try {
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: `0x${CHAIN_ID.toString(16)}` }],
        });
      } catch (error) {
        if (walletErrorCode(error) !== 4902) throw error;
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: `0x${CHAIN_ID.toString(16)}`,
              chainName: bscMainnet.name,
              nativeCurrency: bscMainnet.nativeCurrency,
              rpcUrls: bscMainnet.rpcUrls.default.http,
              blockExplorerUrls: [bscMainnet.blockExplorers.default.url],
            },
          ],
        });
      }
      const accounts = (await window.ethereum.request({ method: "eth_requestAccounts" })) as Address[];
      setAccount(accounts[0] ?? null);
      setMessage(accounts[0] ? "Wallet connected." : "Wallet returned no account.");
      return accounts[0] ?? null;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Wallet connection failed.");
      return null;
    } finally {
      setPending(false);
    }
  }, []);

  useEffect(() => {
    const provider = window.ethereum;
    if (!provider) return;
    void restoreAuthorizedAccount(provider).then(setAccount);
    const onAccountsChanged = (value: unknown) => {
      const nextAccount = firstAuthorizedAccount(value);
      setAccount(nextAccount);
      setMessage(nextAccount ? "Wallet account changed." : "Wallet disconnected.");
    };
    const onChainChanged = (value: unknown) => {
      const nextChain = typeof value === "string" ? Number.parseInt(value, 16) : Number.NaN;
      if (nextChain === CHAIN_ID) return;
      setMessage("Wallet is still connected, but transactions need BNB Smart Chain.");
    };
    provider.on?.("accountsChanged", onAccountsChanged);
    provider.on?.("chainChanged", onChainChanged);
    return () => {
      provider.removeListener?.("accountsChanged", onAccountsChanged);
      provider.removeListener?.("chainChanged", onChainChanged);
    };
  }, []);

  const walletClient = useMemo(() => {
    if (!window.ethereum || !account) return null;
    return createWalletClient({ account, chain: bscMainnet, transport: custom(window.ethereum) });
  }, [account]);

  const connectForTransaction = useCallback(async () => {
    const connectedAccount = await connect();
    if (!connectedAccount || !window.ethereum) return null;
    return {
      account: connectedAccount,
      walletClient: createWalletClient({ account: connectedAccount, chain: bscMainnet, transport: custom(window.ethereum) }),
    };
  }, [connect]);

  return { account, connect, connectForTransaction, message, pending, setMessage, walletClient };
}

type WalletState = ReturnType<typeof useWallet>;

function Shell({ children, path, wallet }: { children: React.ReactNode; path: string; wallet: WalletState }) {
  const active = (href: string) => path === href || (href !== "/" && path.startsWith(href)) ? "is-active" : undefined;

  const navigate = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target as Element;
    const anchor = target.closest("a");
    if (!anchor || anchor.target || anchor.hasAttribute("download")) return;
    const url = new URL(anchor.href, window.location.href);
    if (url.origin !== window.location.origin) return;
    event.preventDefault();
    window.history.pushState({}, "", `${url.pathname}${url.search}${url.hash}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
    if (url.hash) {
      requestAnimationFrame(() => document.querySelector(url.hash)?.scrollIntoView());
    } else {
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  };

  return (
    <div className="app-shell" onClick={navigate}>
      <header className="topbar">
        <a className="brand" href="/">
          <span>
            RUGSPULL
            <small>Tonight: bad incentives</small>
          </span>
        </a>
        <nav aria-label="Main navigation">
          <a className={active("/")} href="/"><Home size={16} />Rugs</a>
          <a className={active("/create")} href="/create"><Plus size={16} />Host One</a>
          <a className={active("/ops")} href="/ops"><Gauge size={16} />Backstage</a>
          <a className={active("/docs/risk")} href="/docs/risk"><ShieldAlert size={16} />Risk</a>
          {wallet.account ? <a className={active("/account")} href={`/account/${wallet.account}`}><UserRound size={16} />My Chair</a> : null}
          <button onClick={wallet.connect} disabled={wallet.pending}>
            {wallet.pending ? <Loader2 className="spin" size={16} /> : <Wallet size={16} />}
            {wallet.account ? short(wallet.account) : "Connect Wallet"}
          </button>
        </nav>
      </header>
      {wallet.message ? <div className="toast">{wallet.message}</div> : null}
      {wallet.account ? <WbnbPanel wallet={wallet} /> : null}
      {children}
      <footer className="site-footer">
        <div className="footer-frame">
          <section className="footer-office" aria-label="Rugspull office">
            <span className="footer-stamp">OFFICE MEMO · BNB CHAIN</span>
            <strong>RUGSPULL<br />OFFICE OF BAD DECISIONS</strong>
            <p>Distribution is social. Settlement is on-chain. Regret is self-custodied.</p>
            <a className="footer-email" href="mailto:info@rugspull.com">
              <Mail size={19} aria-hidden="true" />
              <span><small>Corrections, abuse & paperwork</small>info@rugspull.com</span>
            </a>
          </section>

          <div className="footer-content">
            <nav className="footer-switchboard" aria-label="Official channels">
              <span className="footer-switchboard-label">Official-ish switchboard</span>
              <a href="https://x.com/rugspull" target="_blank" rel="noreferrer" aria-label="Rugspull on X">
                <AtSign size={17} aria-hidden="true" />
                <span><strong>X</strong><small>@rugspull</small></span>
                <ExternalLink size={12} aria-hidden="true" />
              </a>
              <a href="https://t.me/rugspullcom" target="_blank" rel="noreferrer" aria-label="Rugspull Telegram channel">
                <Send size={17} aria-hidden="true" />
                <span><strong>Telegram</strong><small>@rugspullcom</small></span>
                <ExternalLink size={12} aria-hidden="true" />
              </a>
              <a href="https://github.com/pqchase/rugspull" target="_blank" rel="noreferrer" aria-label="Rugspull source code on GitHub">
                <FolderGit2 size={17} aria-hidden="true" />
                <span><strong>GitHub</strong><small>pqchase/rugspull</small></span>
                <ExternalLink size={12} aria-hidden="true" />
              </a>
            </nav>

            <nav className="footer-directory" aria-label="Rugspull resources">
              <section className="footer-link-group">
                <h2>Before the bad idea</h2>
                <ul>
                  <li><a href="/docs/risk">Read risk first</a></li>
                  <li><a href="/security-model">Security model</a></li>
                  <li><a href="/api-reference">Read API</a></li>
                  <li><a href="/founder-allocation-explained">Founder allocation</a></li>
                  <li><a href="/how-to-check-a-smart-contract-on-bscscan">Contract check</a></li>
                  <li><a href="/verified-source-code-does-not-mean-audited">Verified source ≠ audit</a></li>
                  <li><a href="/why-d1-is-not-financial-truth">D1 is not financial truth</a></li>
                </ul>
              </section>
              <section className="footer-link-group">
                <h2>Rugpull field guide</h2>
                <ul>
                  <li><a href="/crypto-rug-pull-red-flags">Risk signals</a></li>
                  <li><a href="/what-is-a-crypto-rug-pull">Rug pull guide</a></li>
                  <li><a href="/rug-pull-vs-liquidity-pull">Sell vs liquidity pull</a></li>
                  <li><a href="/rugpool-vs-pancakeswap">RugPool vs PancakeSwap</a></li>
                  <li><a href="/failed-opening-refund-guide">Failed refund guide</a></li>
                  <li><a href="/what-if-founder-never-rugs">Founder never rugs?</a></li>
                  <li><a href="/why-trading-continues-after-rugged">Trading after Rugged</a></li>
                  <li><a href="/24-hour-opening-explained">24-hour Opening</a></li>
                  <li><a href="/creator-stake-risk-explained">Creator stake risk</a></li>
                  <li><a href="/why-founder-cannot-sell-in-parts">No partial Founder sale</a></li>
                  <li><a href="/can-the-creator-contribute">Creator contribution rule</a></li>
                  <li><a href="/can-the-creator-cancel-opening">No Opening cancellation</a></li>
                  <li><a href="/what-happens-to-excess-contributions">Excess contributions</a></li>
                  <li><a href="/who-can-finalize-an-opening">Permissionless finalization</a></li>
                  <li><a href="/how-to-claim-opening-tokens">Opening token claim</a></li>
                  <li><a href="/what-is-wbnb">What is WBNB?</a></li>
                  <li><a href="/what-is-a-token-approval">Token approval guide</a></li>
                  <li><a href="/what-is-slippage-on-bnb-chain">Slippage guide</a></li>
                  <li><a href="/constant-product-amm-explained">Constant-product AMM</a></li>
                  <li><a href="/what-is-liquidity-on-bnb-chain">Liquidity and reserve depth</a></li>
                  <li><a href="/how-to-read-amm-reserves-on-bscscan">Read AMM reserves on BscScan</a></li>
                  <li><a href="/what-is-mev-on-bnb-chain">MEV and transaction ordering</a></li>
                  <li><a href="/what-are-alternative-pools-on-bnb-chain">Alternative pools</a></li>
                  <li><a href="/what-are-smart-contract-invariants">Smart-contract invariants</a></li>
                </ul>
              </section>
              <section className="footer-link-group footer-paperwork">
                <h2>Public paperwork pile</h2>
                <ul>
                  <li><a href="/testnet-lifecycle">TESTNET evidence</a></li>
                  <li><a href="/office-counter">Office counter</a></li>
                  <li><a href="/lifecycle-templates">Lifecycle templates</a></li>
                  <li><a href="/creator-handbook">Creator handbook</a></li>
                  <li><a href="/community-safety">Community safety</a></li>
                  <li><a href="/stage-0-review">Stage 0 review</a></li>
                </ul>
              </section>
            </nav>
          </div>
        </div>
        <div className="footer-fine-print">
          <span>BNB Smart Chain · no reserve backdoor · no support DMs</span>
          <span>© 2026 Rugspull. Keep your seed phrase out of the complaint form.</span>
        </div>
      </footer>
    </div>
  );
}

function WbnbPanel({ wallet }: { wallet: WalletState }) {
  const [amount, setAmount] = useState("0.01");
  const [nativeBalance, setNativeBalance] = useState<bigint | null>(null);
  const [wbnbBalance, setWbnbBalance] = useState<bigint | null>(null);
  const [busy, setBusy] = useState("");
  const wbnb = WBNB_ADDRESS;

  const load = useCallback(async () => {
    if (!wallet.account) return;
    const [native, wrapped] = await Promise.all([
      publicClient.getBalance({ address: wallet.account }),
      publicClient.readContract({ address: wbnb, abi: erc20Abi, functionName: "balanceOf", args: [wallet.account] }),
    ]);
    setNativeBalance(native);
    setWbnbBalance(wrapped);
  }, [wallet.account, wbnb]);

  useEffect(() => {
    void load().catch(() => undefined);
  }, [load]);

  async function wrap() {
    const session = await wallet.connectForTransaction();
    if (!session) return;
    setBusy("wrap");
    try {
      const hash = await session.walletClient.writeContract({
        address: wbnb,
        abi: wbnbAbi,
        functionName: "deposit",
        value: parseEther(amount || "0"),
      });
      await waitForSuccess(hash);
      await load();
      wallet.setMessage("BNB wrapped to WBNB.");
    } catch (error) {
      wallet.setMessage(error instanceof Error ? error.message : "Wrap failed.");
    } finally {
      setBusy("");
    }
  }

  async function unwrap() {
    const session = await wallet.connectForTransaction();
    if (!session) return;
    setBusy("unwrap");
    try {
      const hash = await session.walletClient.writeContract({
        address: wbnb,
        abi: wbnbAbi,
        functionName: "withdraw",
        args: [parseEther(amount || "0")],
      });
      await waitForSuccess(hash);
      await load();
      wallet.setMessage("WBNB unwrapped to BNB.");
    } catch (error) {
      wallet.setMessage(error instanceof Error ? error.message : "Unwrap failed.");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="wallet-strip">
      <strong className="wallet-strip-title">Pocket check</strong>
      <Metric label="BNB" value={nativeBalance == null ? "Loading" : formatNative(nativeBalance)} />
      <Metric label="WBNB" value={wbnbBalance == null ? "Loading" : formatWei(wbnbBalance)} />
      <label className="wallet-amount">Amount<input aria-label="BNB or WBNB amount" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
      <button disabled={busy !== ""} onClick={() => void wrap()}><ArrowDownUp size={16} />Wrap BNB</button>
      <button disabled={busy !== ""} onClick={() => void unwrap()}><ArrowDownUp size={16} />Unwrap</button>
      <button className="ghost" disabled={busy !== ""} onClick={() => void load()} title="Refresh balances"><RefreshCw size={16} />Recount</button>
    </section>
  );
}

function HomePage() {
  const [rugs, setRugs] = useState<IndexedRug[]>([]);
  const [loading, setLoading] = useState(true);
  const [sparklines, setSparklines] = useState<Record<string, string[]>>({});

  useEffect(() => {
    void fetch(`${API_BASE}/api/rugs?limit=24`)
      .then((r) => (r.ok ? r.json() : { rugs: [] }))
      .then((data) => setRugs(data.rugs ?? []))
      .catch(() => setRugs([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const addresses = rugs
      .filter((rug) => Number(rug.chain_id) === CHAIN_ID)
      .slice(0, 24)
      .map((rug) => rug.rug_address);
    if (addresses.length === 0) {
      setSparklines({});
      return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({ chainId: String(CHAIN_ID), rugs: addresses.join(",") });
    void fetch(`${API_BASE}/api/market/sparklines?${params}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : { sparklines: {} })
      .then((data) => setSparklines(data.sparklines ?? {}))
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setSparklines({});
      });
    return () => controller.abort();
  }, [rugs]);

  const featured = rugs[0] ?? null;
  const featuredHref = featured ? `/rug/${featured.chain_id}/${featured.rug_address}` : "/create";
  const featuredLabel = featured?.status === "Opening" ? "Featured Opening" : "Featured Rug";

  return (
    <main className="home-page">
      <section className="community-hero" aria-labelledby="community-title">
        <React.Suspense fallback={<div className="rug-stage" aria-hidden="true" />}>
          <RugStage />
        </React.Suspense>
        <div className="stage-title-card">
          <span className="stage-kicker">BNB Chain public notice</span>
          <h1 id="community-title">WE PUT THE RUG<br />IN COMMUNITY.</h1>
        </div>
        <aside className="selected-rug-board" aria-label={featuredLabel}>
          <span className="board-label">{featuredLabel}</span>
          <strong>{featured?.name || (loading ? "Finding a bad idea..." : "No Rug Yet")}</strong>
          <b>{featured?.symbol || "???"}</b>
          <span className="state" data-status={featured?.status ?? "Opening"}>{featured?.status ?? "Waiting"}</span>
          <Metric label="Creator stake" value={featured ? formatWei(featured.creator_stake) : "-"} />
          <Metric label="Opening total" value={featured ? formatWei(featured.total_contributed) : "-"} />
        </aside>
        <div className="stage-actions">
          <a className="primary" href={featuredHref}>
            {featured ? <ClipboardList size={19} /> : <Plus size={19} />}
            {featured ? "Inspect Rug" : "Host First Rug"}
          </a>
          <a className="secondary" href="/create"><Plus size={19} />Create a Rug</a>
        </div>
      </section>

      <section className="stage-summary-band" aria-label="Settlement rules">
        <strong>One disclosed founder sell.</strong>
        <span>No pool-reserve withdrawal.</span>
        <span>0.30% total trading fee.</span>
        <span>Every settlement stays on-chain.</span>
      </section>

      <section className="testnet-evidence-callout" aria-labelledby="testnet-evidence-title">
        <div className="testnet-evidence-copy">
          <span className="testnet-evidence-stamp"><FlaskConical size={16} />BSC TESTNET ONLY</span>
          <h2 id="testnet-evidence-title">Inspect two complete lifecycle paths.</h2>
          <p>
            Read the contracts, transaction receipts, and decoded events for a failed opening refund and
            post-Rug trading. This is testnet evidence—not mainnet activity, an audit, or a safety guarantee.
          </p>
        </div>
        <div className="testnet-evidence-paths" aria-label="Documented testnet paths">
          <span><strong>Failed</strong> contribution returned after the opening misses launch conditions.</span>
          <span><strong>Rugged</strong> founder action settles once; pool trading remains available afterward.</span>
        </div>
        <div className="testnet-evidence-actions">
          <a className="primary" href="/testnet-lifecycle"><ClipboardList size={18} />Inspect TESTNET evidence</a>
          <a className="secondary" href="/docs/risk"><ShieldAlert size={18} />Read risk disclosures</a>
          <small>Historical receipts are incomplete. Exact-match checks are not an audit.</small>
        </div>
      </section>

      <section className="notice-board page-board" id="rugs">
        <header className="board-heading">
          <div>
            <span className="board-label">Public noticeboard</span>
            <h2>Next Bad Ideas</h2>
          </div>
          <p>Chain state handles the money. This board only helps you find the meeting.</p>
        </header>
        {loading ? <LoadingPanel /> : null}
        {!loading && rugs.length === 0 ? (
          <div className="empty-row">
            <strong>Nobody brought a rug.</strong>
            <span>Suspiciously healthy behavior. You can ruin the silence.</span>
            <a className="secondary" href="/create"><Plus size={17} />Host the first one</a>
          </div>
        ) : null}
        <div className="rug-table" role="list">
          {rugs.map((rug, index) => (
            <a className="rug-row" href={`/rug/${rug.chain_id}/${rug.rug_address}`} key={`${rug.chain_id}-${rug.rug_address}`} role="listitem">
              <span className="row-number">{String(index + 1).padStart(2, "0")}</span>
              <span className="rug-identity">
                <strong>{rug.name || "Unnamed Bad Idea"}</strong>
                <small>{rug.symbol || "???"}</small>
                <MiniMarketChart prices={sparklines[rug.rug_address.toLowerCase()] ?? []} status={rug.status} />
              </span>
              <span className="state" data-status={rug.status}>{rug.status}</span>
              <Metric label="Opening" value={formatWei(rug.total_contributed)} />
              <Metric label="Founder left" value={formatToken(rug.founder_remaining)} />
              <span className="inspect-link">Inspect <Ticket size={16} /></span>
            </a>
          ))}
        </div>
      </section>

      <section className="plain-disclosure">
        <AlertTriangle size={21} />
        <strong>Founder may sell once.</strong>
        <span>Pool reserves cannot be withdrawn.</span>
        <span>Total loss remains technically possible.</span>
      </section>
    </main>
  );
}

function CreatePage({ wallet }: { wallet: WalletState }) {
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [stake, setStake] = useState("");
  const [metadataURI, setMetadataURI] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [acceptedRisk, setAcceptedRisk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [factoryInfo, setFactoryInfo] = useState<{
    fee: bigint;
    minStake: bigint;
    paused: boolean;
    wbnb: Address;
    founderBps: number;
    swapFeeBps: number;
    protocolFeeBps: number;
    minLaunchBps: number;
    openingCapBps: number;
    openingDuration: number;
    founderUnlockDelay: number;
  } | null>(null);
  const [uploadsProtected, setUploadsProtected] = useState<boolean | null>(null);
  const [lastRug, setLastRug] = useState<Address | null>(null);

  useEffect(() => {
    void Promise.all([
      publicClient.readContract({ address: FACTORY_ADDRESS, abi: rugFactoryAbi, functionName: "creationFee" }),
      publicClient.readContract({ address: FACTORY_ADDRESS, abi: rugFactoryAbi, functionName: "minCreatorStake" }),
      publicClient.readContract({ address: FACTORY_ADDRESS, abi: rugFactoryAbi, functionName: "createPaused" }),
      publicClient.readContract({ address: FACTORY_ADDRESS, abi: rugFactoryAbi, functionName: "WBNB" }),
      publicClient.readContract({ address: FACTORY_ADDRESS, abi: rugFactoryAbi, functionName: "founderBps" }),
      publicClient.readContract({ address: FACTORY_ADDRESS, abi: rugFactoryAbi, functionName: "swapFeeBps" }),
      publicClient.readContract({ address: FACTORY_ADDRESS, abi: rugFactoryAbi, functionName: "protocolFeeBps" }),
      publicClient.readContract({ address: FACTORY_ADDRESS, abi: rugFactoryAbi, functionName: "minLaunchBps" }),
      publicClient.readContract({ address: FACTORY_ADDRESS, abi: rugFactoryAbi, functionName: "openingCapBps" }),
      publicClient.readContract({ address: FACTORY_ADDRESS, abi: rugFactoryAbi, functionName: "openingDuration" }),
      publicClient.readContract({ address: FACTORY_ADDRESS, abi: rugFactoryAbi, functionName: "founderUnlockDelay" }),
    ]).then(([
      fee,
      minStake,
      paused,
      wbnb,
      founderBps,
      swapFeeBps,
      protocolFeeBps,
      minLaunchBps,
      openingCapBps,
      openingDuration,
      founderUnlockDelay,
    ]) => setFactoryInfo({
      fee,
      minStake,
      paused,
      wbnb,
      founderBps,
      swapFeeBps,
      protocolFeeBps,
      minLaunchBps,
      openingCapBps,
      openingDuration,
      founderUnlockDelay,
    })).catch(() => undefined);
  }, []);

  useEffect(() => {
    void fetch(`${API_BASE}/api/config`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Config returned ${response.status}`);
        return response.json() as Promise<ApiConfig>;
      })
      .then((config) => setUploadsProtected(config.uploadsProtected))
      .catch(() => setUploadsProtected(false));
  }, []);

  async function createRug() {
    const creatorStake = parseAmountOrZero(stake);
    if (!name.trim() || name.length > 64) {
      wallet.setMessage("Rug name must be 1 to 64 characters.");
      return;
    }
    if (!/^[A-Z0-9]{1,12}$/.test(symbol)) {
      wallet.setMessage("Ticker must be 1 to 12 uppercase letters or numbers.");
      return;
    }
    if (!description.trim() || description.length > 2_000 || image.length > 2_048) {
      wallet.setMessage("Confession must be 1 to 2,000 characters and the image URL no longer than 2,048.");
      return;
    }
    if (!factoryInfo || creatorStake < factoryInfo.minStake) {
      wallet.setMessage(`Creator stake must be at least ${factoryInfo ? formatEther(factoryInfo.minStake) : "the Factory minimum"} WBNB.`);
      return;
    }
    if (!factoryInfo || factoryInfo.paused) {
      wallet.setMessage(factoryInfo?.paused ? "Rug creation is paused." : "Factory configuration is still loading.");
      return;
    }
    if (imageFile && (imageFile.size > 2 * 1024 * 1024 || !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(imageFile.type))) {
      wallet.setMessage("Image must be PNG, JPEG, WebP, or GIF and no larger than 2 MB.");
      return;
    }
    if (!uploadsProtected || !TURNSTILE_SITE_KEY) {
      wallet.setMessage("Rug creation is disabled until matching Turnstile keys are configured.");
      return;
    }
    const session = await wallet.connectForTransaction();
    if (!session) return;
    const { account, walletClient } = session;
    if (!acceptedRisk) {
      wallet.setMessage("Risk disclosure must be accepted before creation.");
      return;
    }
    if (!turnstileToken) {
      wallet.setMessage("Turnstile check must complete before upload.");
      return;
    }
    setBusy(true);
    try {
      const creationFee = factoryInfo?.fee ?? 0n;
      const totalApproval = creatorStake + creationFee;
      wallet.setMessage("Finalizing metadata...");
      const metadata = {
        name: name.trim(),
        symbol: symbol.trim(),
        description: description.trim(),
        image: image.trim(),
        external_url: `${window.location.origin}/create`,
        attributes: [
          { trait_type: "Disclosure", value: "Transparent Rug" },
          { trait_type: "Founder Sell Mode", value: "One-shot" },
          { trait_type: "Founder Allocation", value: formatBps(factoryInfo.founderBps) },
          { trait_type: "Total Trading Fee", value: formatBps(factoryInfo.swapFeeBps + factoryInfo.protocolFeeBps) },
          { trait_type: "Protocol Trading Fee", value: formatBps(factoryInfo.protocolFeeBps) },
        ],
      };
      const finalizedMetadata = await finalizeUploadBundle(metadata, imageFile, turnstileToken);
      const finalMetadataURI = finalizedMetadata.uri;
      const metadataHash = finalizedMetadata.hash;
      setMetadataURI(finalMetadataURI);
      const wbnb = factoryInfo?.wbnb ?? WBNB_ADDRESS;

      const allowance = await publicClient.readContract({
        address: wbnb,
        abi: erc20Abi,
        functionName: "allowance",
        args: [account, FACTORY_ADDRESS],
      });
      if (allowance < totalApproval) {
        wallet.setMessage("Approving WBNB for factory...");
        const approveHash = await walletClient.writeContract({
          address: wbnb,
          abi: erc20Abi,
          functionName: "approve",
          args: [FACTORY_ADDRESS, totalApproval],
        });
        await waitForSuccess(approveHash);
      }

      wallet.setMessage("Creating Rug on BNB Smart Chain...");
      const hash = await walletClient.writeContract({
        address: FACTORY_ADDRESS,
        abi: rugFactoryAbi,
        functionName: "createRug",
        args: [{
          name: name.trim(),
          symbol: symbol.trim(),
          metadataURI: finalMetadataURI,
          metadataHash,
          creatorStake,
        }],
      });
      const receipt = await waitForSuccess(hash);
      const created = await findCreatedRug(receipt.logs.map((log) => ({ topics: [...log.topics], data: log.data })));
      if (created) {
        await registerRug(created, hash).catch(() => undefined);
      }
      setLastRug(created);
      wallet.setMessage(created ? `Rug created: ${created}` : `Create transaction mined: ${hash}`);
    } catch (error) {
      wallet.setMessage(error instanceof Error ? error.message : "Create failed.");
    } finally {
      if (TURNSTILE_SITE_KEY) {
        setTurnstileToken("");
        window.turnstile?.reset();
      }
      setBusy(false);
    }
  }

  return (
    <main className="page create-page">
      <section className="page-intro">
        <span className="eyebrow">Host application · BNB Smart Chain</span>
        <h1>HOST YOUR OWN<br />BAD INCENTIVE.</h1>
        <p>Bring a name, an image, and your own WBNB. The founder exit is disclosed before anyone enters the room.</p>
      </section>
      <div className="create-layout">
        <section>
          <div className="factory-strip">
            <Metric label="Factory" value={short(FACTORY_ADDRESS)} />
            <Metric label="Fee" value={factoryInfo ? formatEther(factoryInfo.fee) + " WBNB" : "Loading"} />
            <Metric label="Minimum stake" value={factoryInfo ? formatEther(factoryInfo.minStake) + " WBNB" : "Loading"} />
            <Metric label="Trading fee" value={factoryInfo ? formatBps(factoryInfo.swapFeeBps + factoryInfo.protocolFeeBps) : "Loading"} />
            <Metric label="Door" value={factoryInfo?.paused ? "Closed" : "Open"} />
            <Metric label="Upload gate" value={uploadsProtected === null ? "Checking" : uploadsProtected && TURNSTILE_SITE_KEY ? "Ready" : "Closed"} />
          </div>
          <form className="panel host-form" onSubmit={(event) => event.preventDefault()}>
            <fieldset>
              <legend>1. Name the bad idea</legend>
              <div className="field-pair">
                <label>Rug name<input required maxLength={64} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Definitely Not A Retirement Plan" /></label>
                <label>Ticker<input required value={symbol} maxLength={12} onChange={(event) => setSymbol(event.target.value.toUpperCase())} placeholder="e.g. OOPS" /></label>
              </div>
              <label>Confession<textarea required maxLength={2000} rows={4} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Explain the bad idea in your own words. Empty slogans do not count." /></label>
            </fieldset>
            <fieldset>
              <legend>2. Show us the rug</legend>
              <label>Image URL<input maxLength={2048} value={image} onChange={(event) => setImage(event.target.value)} placeholder="https://... or upload a file below" /></label>
              <label className="file-field">Or bring a file<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => setImageFile(event.target.files?.[0] ?? null)} /></label>
            </fieldset>
            <fieldset>
              <legend>3. Put your own money down</legend>
              <label>Creator stake (WBNB)<input required inputMode="decimal" value={stake} onChange={(event) => setStake(event.target.value)} placeholder="0.00" /></label>
              <label>Metadata receipt<input value={metadataURI} placeholder="Generated after upload" readOnly /></label>
            </fieldset>
            {uploadsProtected && TURNSTILE_SITE_KEY ? <TurnstileBox siteKey={TURNSTILE_SITE_KEY} onToken={setTurnstileToken} /> : (
              <div className="form-warning">Creation is temporarily closed until the anti-spam keys agree with each other.</div>
            )}
            {factoryInfo ? (
              <div className="form-warning">
                {formatBps(factoryInfo.founderBps)} founder allocation. {formatDuration(factoryInfo.openingDuration)} Opening. Launch needs {formatBps(factoryInfo.minLaunchBps)} of the creator stake and accepts at most {formatBps(factoryInfo.openingCapBps)}. The founder lever unlocks {formatDuration(factoryInfo.founderUnlockDelay)} after Opening ends.
              </div>
            ) : null}
            <label className="check risk-check">
              <input type="checkbox" checked={acceptedRisk} onChange={(event) => setAcceptedRisk(event.target.checked)} />
              <span>I understand the founder allocation may be sold in one public transaction, trading charges {factoryInfo ? formatBps(factoryInfo.swapFeeBps + factoryInfo.protocolFeeBps) : "a disclosed fee"}, and I will not later describe either one as a mysterious carpet malfunction.</span>
            </label>
            <button className="submit-rug" type="button" onClick={createRug} disabled={busy || !factoryInfo || factoryInfo.paused || !uploadsProtected || !TURNSTILE_SITE_KEY}>
              {busy ? <Loader2 className="spin" size={18} /> : <FlaskConical size={18} />}
              Put It On The Floor
            </button>
            {lastRug ? <a className="inline-link" href={`/rug/${CHAIN_ID}/${lastRug}`}>Inspect the rug you just made</a> : null}
          </form>
        </section>
        <aside className="create-aside">
          <section className="rug-preview">
            <span className="board-label">Tonight's poster</span>
            <img src={image || "/assets/rug-texture.jpg"} alt="Rug preview" onError={(event) => { event.currentTarget.src = "/assets/rug-texture.jpg"; }} />
            <strong>{name || "Unnamed Rug"}</strong>
            <b>{symbol || "???"}</b>
            <p>{description}</p>
          </section>
          <Disclosure />
        </aside>
      </div>
    </main>
  );
}

function RugPage({ wallet }: { wallet: WalletState }) {
  const [, , chainIdPart, rugPart] = window.location.pathname.split("/");
  const requestedChainId = Number(chainIdPart) || CHAIN_ID;
  const isUnsupportedChain = requestedChainId !== CHAIN_ID;
  const rugAddress = isAddress(rugPart ?? "") ? (rugPart as Address) : ZERO;
  const [state, setState] = useState<RugState | null>(null);
  const [events, setEvents] = useState<IndexedEvent[]>([]);
  const [metadata, setMetadata] = useState<RugMetadata | null>(null);
  const [metadataHashStatus, setMetadataHashStatus] = useState("Not loaded");
  const [indexedRug, setIndexedRug] = useState<IndexedRug | null>(null);
  const [viewerPosition, setViewerPosition] = useState<ViewerPosition | null>(null);
  const [tokenBalance, setTokenBalance] = useState<bigint | null>(null);
  const [amount, setAmount] = useState("");
  const [tradeSide, setTradeSide] = useState<"buy" | "sell">("buy");
  const [slippageBps, setSlippageBps] = useState(300);
  const [busy, setBusy] = useState("");
  const [actionView, setActionView] = useState<"opening" | "claims" | "trade">("opening");
  const [market, setMarket] = useState<MarketResponse | null>(null);
  const [marketLoading, setMarketLoading] = useState(true);
  const [chainLoadError, setChainLoadError] = useState("");
  const desktopDetailsOpen = useMediaQuery("(min-width: 821px)");

  const load = useCallback(async () => {
    if (rugAddress === ZERO) return;
    const [
      status,
      creator,
      token,
      pool,
      creatorStake,
      minLaunchAmount,
      openingCap,
      openingStart,
      openingEnd,
      founderUnlockTime,
      swapFeeBps,
      protocolFeeBps,
      totalContributed,
      acceptedContribution,
      openingTokenAllocation,
      poolTokenReserve,
      poolQuoteReserve,
      founderRemaining,
    ] = await Promise.all([
      publicClient.readContract({ address: rugAddress, abi: rugInstanceAbi, functionName: "status" }),
      publicClient.readContract({ address: rugAddress, abi: rugInstanceAbi, functionName: "creator" }),
      publicClient.readContract({ address: rugAddress, abi: rugInstanceAbi, functionName: "token" }),
      publicClient.readContract({ address: rugAddress, abi: rugInstanceAbi, functionName: "pool" }),
      publicClient.readContract({ address: rugAddress, abi: rugInstanceAbi, functionName: "creatorStake" }),
      publicClient.readContract({ address: rugAddress, abi: rugInstanceAbi, functionName: "minLaunchAmount" }),
      publicClient.readContract({ address: rugAddress, abi: rugInstanceAbi, functionName: "openingCap" }),
      publicClient.readContract({ address: rugAddress, abi: rugInstanceAbi, functionName: "openingStart" }),
      publicClient.readContract({ address: rugAddress, abi: rugInstanceAbi, functionName: "openingEnd" }),
      publicClient.readContract({ address: rugAddress, abi: rugInstanceAbi, functionName: "founderUnlockTime" }),
      publicClient.readContract({ address: rugAddress, abi: rugInstanceAbi, functionName: "swapFeeBps" }),
      publicClient.readContract({ address: rugAddress, abi: rugInstanceAbi, functionName: "protocolFeeBps" }),
      publicClient.readContract({ address: rugAddress, abi: rugInstanceAbi, functionName: "totalContributed" }),
      publicClient.readContract({ address: rugAddress, abi: rugInstanceAbi, functionName: "acceptedContribution" }),
      publicClient.readContract({ address: rugAddress, abi: rugInstanceAbi, functionName: "openingTokenAllocation" }),
      publicClient.readContract({ address: rugAddress, abi: rugInstanceAbi, functionName: "poolTokenReserve" }),
      publicClient.readContract({ address: rugAddress, abi: rugInstanceAbi, functionName: "poolQuoteReserve" }),
      publicClient.readContract({ address: rugAddress, abi: rugInstanceAbi, functionName: "founderRemaining" }),
    ]);
    let currentPoolTokenReserve = poolTokenReserve;
    let currentPoolQuoteReserve = poolQuoteReserve;
    if (pool !== ZERO) {
      const reserves = await publicClient.readContract({
        address: pool,
        abi: rugPoolAbi,
        functionName: "getReserves",
      });
      currentPoolTokenReserve = reserves[0];
      currentPoolQuoteReserve = reserves[1];
    }
    setState({
      status: statusLabels[Number(status)] ?? "Opening",
      creator,
      token,
      pool,
      creatorStake,
      minLaunchAmount,
      openingCap,
      openingStart,
      openingEnd,
      founderUnlockTime,
      swapFeeBps,
      protocolFeeBps,
      totalContributed,
      acceptedContribution,
      openingTokenAllocation,
      poolTokenReserve: currentPoolTokenReserve,
      poolQuoteReserve: currentPoolQuoteReserve,
      founderRemaining,
    });
  }, [rugAddress]);

  const loadChainState = useCallback(async () => {
    setChainLoadError("");
    try {
      await load();
    } catch {
      setChainLoadError("This address does not expose the complete v0.4 RugInstance interface. Transaction controls are hidden because the economics cannot be verified by this UI.");
    }
  }, [load]);

  useEffect(() => {
    void loadChainState();
  }, [loadChainState]);

  const loadMarket = useCallback(async () => {
    if (rugAddress === ZERO) {
      setMarket(null);
      setMarketLoading(false);
      return;
    }
    setMarketLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/rugs/${requestedChainId}/${rugAddress}/market?limit=500`);
      if (!response.ok) throw new Error("Market cache unavailable");
      setMarket(await response.json() as MarketResponse);
    } catch {
      setMarket(null);
    } finally {
      setMarketLoading(false);
    }
  }, [requestedChainId, rugAddress]);

  useEffect(() => {
    void loadMarket();
  }, [loadMarket]);

  useEffect(() => {
    if (!state) return;
    if (state.status === "Opening") setActionView("opening");
    else if (state.status === "Failed") setActionView("claims");
    else setActionView("trade");
  }, [rugAddress, state?.status]);

  useEffect(() => {
    if (rugAddress === ZERO) return;
    setIndexedRug(null);
    setMetadata(null);
    setMetadataHashStatus("Loading");
    setEvents([]);
    void fetch(`${API_BASE}/api/rugs/${requestedChainId}/${rugAddress}`)
      .then((r) => (r.ok ? r.json() : { rug: null }))
      .then(async (data) => {
        const rug = data.rug as IndexedRug | null;
        setIndexedRug(rug);
        if (!rug?.metadata_uri) {
          setMetadataHashStatus("No metadata URI");
          return;
        }
        const response = await fetch(resolveR2Uri(rug.metadata_uri));
        if (!response.ok) {
          setMetadataHashStatus("Unavailable");
          return;
        }
        const loadedMetadata = await response.json() as RugMetadata;
        setMetadata(loadedMetadata);
        if (!rug.metadata_hash) {
          setMetadataHashStatus("No indexed hash");
          return;
        }
        const loadedHash = hashCanonical(loadedMetadata);
        setMetadataHashStatus(loadedHash.toLowerCase() === rug.metadata_hash.toLowerCase() ? "Verified" : "Mismatch");
      })
      .catch(() => {
        setIndexedRug(null);
        setMetadata(null);
        setMetadataHashStatus("Unavailable");
      });
    void fetch(`${API_BASE}/api/rugs/${requestedChainId}/${rugAddress}/events`)
      .then((r) => (r.ok ? r.json() : { events: [] }))
      .then((data) => setEvents(data.events ?? []))
      .catch(() => setEvents([]));
  }, [requestedChainId, rugAddress]);

  const loadViewerPosition = useCallback(async () => {
    if (rugAddress === ZERO || !wallet.account) {
      setViewerPosition(null);
      return;
    }
    const [contribution, claimed] = await Promise.all([
      publicClient.readContract({ address: rugAddress, abi: rugInstanceAbi, functionName: "contributionOf", args: [wallet.account] }),
      publicClient.readContract({ address: rugAddress, abi: rugInstanceAbi, functionName: "claimed", args: [wallet.account] }),
    ]);
    setViewerPosition({ contribution, claimed });
  }, [rugAddress, wallet.account]);

  useEffect(() => {
    void loadViewerPosition().catch(() => setViewerPosition(null));
  }, [loadViewerPosition]);

  const loadTokenBalance = useCallback(async () => {
    if (!wallet.account || !state || state.token === ZERO) {
      setTokenBalance(null);
      return;
    }
    const balance = await publicClient.readContract({
      address: state.token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [wallet.account],
    });
    setTokenBalance(balance);
  }, [state, wallet.account]);

  useEffect(() => {
    void loadTokenBalance().catch(() => setTokenBalance(null));
  }, [loadTokenBalance]);

  async function withWallet(
    action: (account: Address, txClient: NonNullable<WalletState["walletClient"]>) => Promise<void>,
    label: string,
  ) {
    const session = await wallet.connectForTransaction();
    if (!session) return;
    setBusy(label);
    try {
      await action(session.account, session.walletClient);
      await load();
      await loadViewerPosition();
      await loadTokenBalance();
      await loadMarket();
    } catch (error) {
      wallet.setMessage(error instanceof Error ? error.message : `${label} failed.`);
    } finally {
      setBusy("");
    }
  }

  async function approveWbnb(
    spender: Address,
    spend: bigint,
    account: Address,
    txClient: NonNullable<WalletState["walletClient"]>,
  ) {
    const allowance = await publicClient.readContract({
      address: WBNB_ADDRESS,
      abi: erc20Abi,
      functionName: "allowance",
      args: [account, spender],
    });
    if (allowance >= spend) return;
    const hash = await txClient.writeContract({
      address: WBNB_ADDRESS,
      abi: erc20Abi,
      functionName: "approve",
      args: [spender, spend],
    });
    await waitForSuccess(hash);
  }

  const deadline = () => BigInt(Math.floor(Date.now() / 1000) + 20 * 60);
  const rugQuote = state ? getSellQuote(state.founderRemaining, state.poolTokenReserve, state.poolQuoteReserve, state.swapFeeBps, state.protocolFeeBps) : zeroSwapQuote;
  const rugQuoteEstimate = rugQuote.amountOut;
  const openingClaimEstimate = state && viewerPosition ? getOpeningClaimEstimate(viewerPosition.contribution, state) : { tokenAmount: 0n, refundAmount: 0n };
  const failedRefundEstimate = state?.status === "Failed" && viewerPosition ? viewerPosition.contribution : 0n;
  const amountValue = parseAmountOrZero(amount);
  const buyQuote = state ? getBuyQuote(amountValue, state.poolQuoteReserve, state.poolTokenReserve, state.swapFeeBps, state.protocolFeeBps) : zeroSwapQuote;
  const sellQuote = state ? getSellQuote(amountValue, state.poolTokenReserve, state.poolQuoteReserve, state.swapFeeBps, state.protocolFeeBps) : zeroSwapQuote;
  const tradeQuote = tradeSide === "buy" ? buyQuote : sellQuote;
  const tradeEstimate = tradeQuote.amountOut;
  const tradeMinimumOut = minimumAfterSlippage(tradeEstimate, slippageBps);
  const rugMinimumOut = minimumAfterSlippage(rugQuoteEstimate, slippageBps);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const isOpeningWindow = !!state && state.status === "Opening" && nowSeconds >= Number(state.openingStart) && nowSeconds < Number(state.openingEnd);
  const canContribute = isOpeningWindow && amountValue > 0n && !isUnsupportedChain;
  const canFinalize = !!state && state.status === "Opening" && nowSeconds >= Number(state.openingEnd) && !isUnsupportedChain;
  const hasViewerContribution = (viewerPosition?.contribution ?? 0n) > 0n;
  const canClaimOpening = !!state && (state.status === "Active" || state.status === "Rugged") && hasViewerContribution && !viewerPosition?.claimed && !isUnsupportedChain;
  const canClaimFailedRefund = !!state && state.status === "Failed" && hasViewerContribution && !viewerPosition?.claimed && !isUnsupportedChain;
  const canWithdrawCreatorStake = !!state && state.status === "Failed" && wallet.account?.toLowerCase() === state.creator.toLowerCase() && !isUnsupportedChain;
  const canSwap = !!state && state.pool !== ZERO && state.token !== ZERO && (state.status === "Active" || state.status === "Rugged") && amountValue > 0n && tradeMinimumOut > 0n && !isUnsupportedChain;
  const canTrade = canSwap && (tradeSide === "buy" || (tokenBalance !== null && tokenBalance >= amountValue));
  const canRug = !!state && state.status === "Active" && wallet.account?.toLowerCase() === state.creator.toLowerCase() && state.founderRemaining > 0n && rugMinimumOut > 0n && nowSeconds >= Number(state.founderUnlockTime) && !isUnsupportedChain;
  const openingPercent = state && state.openingCap > 0n
    ? Math.min(100, Number(state.totalContributed * 10_000n / state.openingCap) / 100)
    : 0;

  useEffect(() => {
    const rugName = metadata?.name ?? indexedRug?.name;
    if (rugName) document.title = `${rugName} | Rugspull`;
  }, [indexedRug?.name, metadata?.name]);

  useEffect(() => {
    if (!indexedRug?.factory_address) return;
    const isCurrentFactory = indexedRug.factory_address.toLowerCase() === FACTORY_ADDRESS.toLowerCase();
    setMeta("meta[name='robots']", "content", isCurrentFactory ? "index, follow" : "noindex, nofollow");
  }, [indexedRug?.factory_address]);

  if (rugAddress === ZERO) {
    return (
      <main className="page">
        <section className="page-intro">
          <span className="eyebrow">Empty stage</span>
          <h1>BRING A REAL<br />RUG ADDRESS.</h1>
        </section>
        <section className="panel empty empty-stage">
          <img src="/assets/speculator-group.png" alt="Three confused speculators" />
          <div>
            <h2>Nobody knows what to stand on.</h2>
            <p>Open a concrete URL like `/rug/56/0x...`. Imaginary addresses do not get a folding table.</p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="page rug-page">
      <section className="toolbar rug-heading">
        <div>
          <span className="eyebrow">Selected Rug · BNB Smart Chain</span>
          <h1>{metadata?.name ?? indexedRug?.name ?? "RugInstance"}</h1>
          <p>{metadata?.symbol ?? indexedRug?.symbol ?? "???"} · Chain {requestedChainId} · <code>{short(rugAddress)}</code></p>
        </div>
        <div className="toolbar-actions">
          {state ? <a className="primary" href="#rug-actions"><Hand size={16} />Go to actions</a> : null}
          <button className="ghost" onClick={() => void Promise.all([loadChainState(), loadMarket()])} title="Refresh chain state and market cache"><RefreshCw size={16} />Ask the chain again</button>
        </div>
      </section>
      {!state ? chainLoadError ? (
        <section className="panel warning incompatible-rug">
          <h2>THIS RUG SPEAKS AN OLDER DIALECT.</h2>
          <p>{chainLoadError}</p>
          <a className="secondary" href={`${bscMainnet.blockExplorers.default.url}/address/${rugAddress}`} target="_blank" rel="noreferrer">Inspect the contract receipt</a>
        </section>
      ) : <LoadingPanel /> : (
        <>
          {isUnsupportedChain ? (
            <section className="panel warning">
              <h2>Wrong Community Hall</h2>
              <p>This frontend is configured for BNB Smart Chain {CHAIN_ID}. Transaction buttons stay disabled on chain {requestedChainId}.</p>
            </section>
          ) : null}
          {metadata || indexedRug ? (
            <section className="metadata-band">
              <img
                src={metadata?.image ? resolveR2Uri(metadata.image) : "/assets/rug-texture.jpg"}
                alt={metadata?.name ?? indexedRug?.name ?? "Rug metadata"}
                onError={(event) => { event.currentTarget.src = "/assets/rug-texture.jpg"; }}
              />
              <div>
                <span className="board-label">Tonight's poster</span>
                <h2>{metadata?.name ?? indexedRug?.name}</h2>
                <p>{metadata?.description ?? "The poster came from the cache. Money facts still come from the chain."}</p>
                <details className="metadata-technical">
                  <summary>Metadata receipt · {metadataHashStatus}<ChevronDown size={16} /></summary>
                  <div>
                    {indexedRug?.metadata_hash ? <code>{indexedRug.metadata_hash}</code> : <span>No indexed hash</span>}
                    {indexedRug?.metadata_uri ? <code>{indexedRug.metadata_uri}</code> : null}
                  </div>
                </details>
              </div>
            </section>
          ) : null}

          <section className="rug-glance" aria-label="Rug at a glance">
            <div><span>Status</span><strong className="state" data-status={state.status}>{state.status}</strong></div>
            <div><span>Rug laid</span><strong>{openingPercent.toFixed(0)}%</strong></div>
            <div><span>Opening total</span><strong>{formatWei(state.totalContributed)}</strong></div>
          </section>

          <MarketBoard market={market} loading={marketLoading} />

          <details className="mobile-collapsible summary-details" open={desktopDetailsOpen || undefined}>
            <summary><span>Chain facts and opening numbers</span><ChevronDown size={18} /></summary>
            <section className="rug-summary-grid collapsible-body">
              <div className="panel status-board">
                <div className="panel-heading">
                  <h2>Current Situation</h2>
                  <span className="state" data-status={state.status}>{state.status}</span>
                </div>
                <p className="status-copy">{statusSentence(state.status)}</p>
                <Metric label="Creator" value={short(state.creator)} />
                <Metric label="Token" value={shortOrEmpty(state.token)} />
                <Metric label="Pool" value={shortOrEmpty(state.pool)} />
                <Countdown label="Opening ends" target={state.openingEnd} />
              </div>
              <div className="panel opening-board">
                <div className="panel-heading"><h2>How Much Rug Is Laid</h2><strong>{openingPercent.toFixed(0)}%</strong></div>
                <progress max={100} value={openingPercent}>{openingPercent}%</progress>
                <Metric label="Creator stake" value={formatWei(state.creatorStake)} />
                <Metric label="Minimum launch" value={formatWei(state.minLaunchAmount)} />
                <Metric label="Opening cap" value={formatWei(state.openingCap)} />
                <Metric label="Total contributed" value={formatWei(state.totalContributed)} />
                <Metric label="Accepted contribution" value={formatWei(state.acceptedContribution)} />
              </div>
            </section>
          </details>

          <section className="action-workbench" id="rug-actions">
            <div className="action-main">
              <div className="tabs action-tabs" role="tablist" aria-label="Rug actions">
                <button type="button" role="tab" aria-selected={actionView === "opening"} onClick={() => setActionView("opening")}><Hand size={17} />Opening</button>
                <button type="button" role="tab" aria-selected={actionView === "claims"} onClick={() => setActionView("claims")}><Ticket size={17} />Claims</button>
                <button type="button" role="tab" aria-selected={actionView === "trade"} onClick={() => setActionView("trade")}><ArrowDownUp size={17} />Trade</button>
              </div>

              {actionView === "opening" ? (
                <div className="panel trade action-panel">
                  <div className="panel-heading"><h2>Stand On This Rug</h2><span>Opening batch</span></div>
                  <p>Contributions share one batch price. Nobody wins by arriving one block earlier.</p>
                  <label>WBNB to contribute<input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.0 WBNB" /></label>
                  <div className="action-buttons">
                    <button disabled={busy !== "" || !canContribute} onClick={() => withWallet(async (account, txClient) => {
                      const spend = parseEther(amount);
                      await approveWbnb(rugAddress, spend, account, txClient);
                      const hash = await txClient.writeContract({
                        address: rugAddress,
                        abi: rugInstanceAbi,
                        functionName: "contribute",
                        args: [spend],
                      });
                      await waitForSuccess(hash);
                    }, "contribute")}>Put WBNB On The Rug</button>
                    <button className="ghost" disabled={busy !== "" || !canFinalize} onClick={() => withWallet(async (_account, txClient) => {
                      const hash = await txClient.writeContract({ address: rugAddress, abi: rugInstanceAbi, functionName: "finalize" });
                      await waitForSuccess(hash);
                    }, "finalize")}>End Opening And Count</button>
                  </div>
                </div>
              ) : null}

              {actionView === "claims" ? (
                <div className="panel action-panel">
                  <div className="panel-heading"><h2>Pick Up What Fell Out</h2><span>Claims & refunds</span></div>
                  {wallet.account ? (
                    <div className="claim-grid">
                      <Metric label="My contribution" value={formatWei(viewerPosition?.contribution ?? 0n)} />
                      <Metric label="Already claimed" value={viewerPosition?.claimed ? "Yes" : "No"} />
                      <Metric label="Opening token claim" value={formatToken(openingClaimEstimate.tokenAmount)} />
                      <Metric label="Opening refund" value={formatWei(openingClaimEstimate.refundAmount)} />
                      <Metric label="Failed refund" value={formatWei(failedRefundEstimate)} />
                    </div>
                  ) : <p>Connect a wallet so the chain can tell us which mess belongs to you.</p>}
                  <div className="action-buttons">
                    <button disabled={busy !== "" || !canClaimOpening} onClick={() => withWallet(async (_account, txClient) => {
                      const hash = await txClient.writeContract({ address: rugAddress, abi: rugInstanceAbi, functionName: "claimOpening" });
                      await waitForSuccess(hash);
                    }, "claim")}>Pick Up Tokens + Refund</button>
                    <button disabled={busy !== "" || !canClaimFailedRefund} onClick={() => withWallet(async (_account, txClient) => {
                      const hash = await txClient.writeContract({ address: rugAddress, abi: rugInstanceAbi, functionName: "claimFailedRefund" });
                      await waitForSuccess(hash);
                    }, "refund")}>Take Failed WBNB Home</button>
                    <button className="ghost" disabled={busy !== "" || !canWithdrawCreatorStake} onClick={() => withWallet(async (_account, txClient) => {
                      const hash = await txClient.writeContract({ address: rugAddress, abi: rugInstanceAbi, functionName: "withdrawCreatorStakeAfterFailure" });
                      await waitForSuccess(hash);
                    }, "withdraw stake")}>Creator: Take Failed Stake Home</button>
                  </div>
                </div>
              ) : null}

              {actionView === "trade" ? (
                <div className="panel trade action-panel">
                  <div className="panel-heading"><h2><CircleDollarSign size={18} />Swap Booth</h2><span>Canonical pool</span></div>
                  <div className="tabs trade-side-tabs" role="tablist" aria-label="Trade direction">
                    <button type="button" role="tab" aria-selected={tradeSide === "buy"} onClick={() => setTradeSide("buy")}>Buy</button>
                    <button type="button" role="tab" aria-selected={tradeSide === "sell"} onClick={() => setTradeSide("sell")}>Sell</button>
                  </div>
                  <div className="claim-grid">
                    <Metric label="My token balance" value={tokenBalance == null ? "Connect wallet" : formatToken(tokenBalance)} />
                    <Metric label="Estimated output" value={tradeSide === "buy" ? formatToken(tradeEstimate) : formatWei(tradeEstimate)} />
                    <Metric label="Minimum received" value={tradeSide === "buy" ? formatToken(tradeMinimumOut) : formatWei(tradeMinimumOut)} />
                    <Metric label="Trading fee rate" value={`${formatBps(state.swapFeeBps + state.protocolFeeBps)} total`} />
                    <Metric label="Protocol fee" value={formatWei(tradeQuote.protocolFeeQuote)} />
                  </div>
                  <div className="field-pair">
                    <label>{tradeSide === "buy" ? "WBNB to spend" : "Tokens to sell"}<input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
                    <label>Slippage tolerance<select value={slippageBps} onChange={(event) => setSlippageBps(Number(event.target.value))}>
                      <option value={100}>1%</option>
                      <option value={300}>3%</option>
                      <option value={500}>5%</option>
                    </select></label>
                  </div>
                  <div className="action-buttons">
                    {tradeSide === "buy" ? (
                      <button disabled={busy !== "" || !canTrade} onClick={() => withWallet(async (account, txClient) => {
                        const spend = parseEther(amount);
                        await approveWbnb(state.pool, spend, account, txClient);
                        const hash = await txClient.writeContract({
                          address: state.pool,
                          abi: rugPoolAbi,
                          functionName: "buyExactQuoteForTokens",
                          args: [spend, tradeMinimumOut, account, deadline()],
                        });
                        await waitForSuccess(hash);
                      }, "buy")}>Buy This Rug</button>
                    ) : (
                      <button disabled={busy !== "" || !canTrade} onClick={() => withWallet(async (account, txClient) => {
                        const spend = parseEther(amount);
                        const allowance = await publicClient.readContract({
                          address: state.token,
                          abi: erc20Abi,
                          functionName: "allowance",
                          args: [account, state.pool],
                        });
                        if (allowance < spend) {
                          const approveHash = await txClient.writeContract({
                            address: state.token,
                            abi: erc20Abi,
                            functionName: "approve",
                            args: [state.pool, spend],
                          });
                          await waitForSuccess(approveHash);
                        }
                        const hash = await txClient.writeContract({
                          address: state.pool,
                          abi: rugPoolAbi,
                          functionName: "sellExactTokensForQuote",
                          args: [spend, tradeMinimumOut, account, deadline()],
                        });
                        await waitForSuccess(hash);
                      }, "sell")}>Sell This Rug</button>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <details className="mobile-collapsible founder-details" open={desktopDetailsOpen || undefined}>
              <summary><span>Founder lever and pool reserves</span><ChevronDown size={18} /></summary>
              <aside className="panel danger founder-booth collapsible-body">
                <img src="/assets/founder-lever.png" alt="Founder holding the one-shot lever" />
                <div className="panel-heading"><h2><AlertTriangle size={18} />Founder, Later</h2><span>Creator only</span></div>
                <Metric label="Founder remaining" value={formatToken(state.founderRemaining)} />
                <Metric label="Estimated output" value={formatWei(rugQuoteEstimate)} />
                <Metric label="Trading fee rate" value={`${formatBps(state.swapFeeBps + state.protocolFeeBps)} total`} />
                <Metric label="Protocol fee" value={formatWei(rugQuote.protocolFeeQuote)} />
                <Metric label="Minimum received" value={formatWei(rugMinimumOut)} />
                <Metric label="Pool WBNB" value={formatWei(state.poolQuoteReserve)} />
                <Metric label="Pool token" value={formatToken(state.poolTokenReserve)} />
                <Countdown label="Founder unlock" target={state.founderUnlockTime} />
                <label>Slippage tolerance<select value={slippageBps} onChange={(event) => setSlippageBps(Number(event.target.value))}>
                  <option value={100}>1%</option>
                  <option value={300}>3%</option>
                  <option value={500}>5%</option>
                </select></label>
                <button className="danger-button" disabled={busy !== "" || !canRug} onClick={() => withWallet(async (_account, txClient) => {
                  const hash = await txClient.writeContract({
                    address: rugAddress,
                    abi: rugInstanceAbi,
                    functionName: "rug",
                    args: [rugMinimumOut, deadline()],
                  });
                  await waitForSuccess(hash);
                }, "rug")}>Pull The Whole Thing</button>
                <p className="helper-copy">One transaction. No partial founder sells. Everyone can watch.</p>
              </aside>
            </details>
          </section>

          <details className="mobile-collapsible receipts-details" open={desktopDetailsOpen || undefined}>
            <summary><span>Public receipts · {events.length}</span><ChevronDown size={18} /></summary>
            <section className="panel event-board collapsible-body">
              <div className="panel-heading"><h2><ClipboardList size={18} />Public Receipts</h2><span>Cached discovery data</span></div>
              {events.length === 0 ? <p>No receipts pinned here yet. Chain state above remains the financial truth.</p> : (
                <div className="event-list">
                  {events.map((event) => (
                    <a
                      className="event-row"
                      href={`${bscMainnet.blockExplorers.default.url}/tx/${event.tx_hash}`}
                      key={`${event.tx_hash}-${event.log_index}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <strong>{event.event_name}</strong>
                      <span>Block {event.block_number}</span>
                      <code>{short(event.tx_hash)}</code>
                    </a>
                  ))}
                </div>
              )}
            </section>
          </details>
          {busy ? <div className="toast">Wallet is signing: {busy}</div> : null}
          <Disclosure />
        </>
      )}
    </main>
  );
}

type RugState = {
  status: Status;
  creator: Address;
  token: Address;
  pool: Address;
  creatorStake: bigint;
  minLaunchAmount: bigint;
  openingCap: bigint;
  openingStart: number;
  openingEnd: number;
  founderUnlockTime: number;
  swapFeeBps: number;
  protocolFeeBps: number;
  totalContributed: bigint;
  acceptedContribution: bigint;
  openingTokenAllocation: bigint;
  poolTokenReserve: bigint;
  poolQuoteReserve: bigint;
  founderRemaining: bigint;
};

function AccountPage({ wallet }: { wallet: WalletState }) {
  const address = wallet.account ?? window.location.pathname.split("/").pop();
  const account = address && isAddress(address) ? address as Address : null;
  const normalized = account ? account.toLowerCase() : "";
  const [createdRugs, setCreatedRugs] = useState<IndexedRug[]>([]);
  const [positions, setPositions] = useState<AccountPosition[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!account) {
      setCreatedRugs([]);
      setPositions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    void fetch(`${API_BASE}/api/rugs?limit=100`)
      .then((r) => (r.ok ? r.json() : { rugs: [] }))
      .then(async (data) => {
        const indexed = (data.rugs ?? []) as IndexedRug[];
        setCreatedRugs(indexed.filter((rug) => rug.creator?.toLowerCase() === normalized));
        const reads = await Promise.all(indexed.map(async (rug) => {
          try {
            const [contribution, claimed] = await Promise.all([
              publicClient.readContract({ address: rug.rug_address, abi: rugInstanceAbi, functionName: "contributionOf", args: [account] }),
              publicClient.readContract({ address: rug.rug_address, abi: rugInstanceAbi, functionName: "claimed", args: [account] }),
            ]);
            return contribution > 0n ? { rug, contribution, claimed } : null;
          } catch {
            return null;
          }
        }));
        setPositions(reads.filter((position): position is AccountPosition => position !== null));
      })
      .catch(() => {
        setCreatedRugs([]);
        setPositions([]);
      })
      .finally(() => setLoading(false));
  }, [account, normalized]);

  return (
    <main className="page account-page">
      <section className="toolbar">
        <div>
          <span className="eyebrow">Reserved folding chair</span>
          <h1>YOUR SEAT IN<br />THE BAD IDEA.</h1>
          <p>Positions and claims come from chain state. The noticeboard only remembers where the meeting was.</p>
        </div>
        {!wallet.account ? <button className="ghost" onClick={wallet.connect}><Wallet size={16} />Find my chair</button> : null}
      </section>
      <section className="panel account-summary">
        <Metric label="Address" value={account ? short(account) : "Not connected"} />
        <Metric label="Opening positions" value={loading ? "Loading" : String(positions.length)} />
        <Metric label="Rugs I brought" value={loading ? "Loading" : String(createdRugs.length)} />
      </section>
      {loading ? <LoadingPanel /> : null}
      {!loading && positions.length === 0 ? (
        <section className="panel empty">
          <h2>No Rug Under Your Feet</h2>
          <p>No indexed Opening contributions were found for this address.</p>
        </section>
      ) : null}
      {positions.length > 0 ? (
        <>
          <h2 className="section-title">Rugs I Stood On</h2>
          <section className="grid">
            {positions.map(({ rug, contribution, claimed }) => (
              <a className="rug-card" href={`/rug/${rug.chain_id}/${rug.rug_address}`} key={`position-${rug.chain_id}-${rug.rug_address}`}>
                <div className="card-head">
                  <strong>{rug.name}</strong>
                  <span data-status={rug.status}>{rug.status}</span>
                </div>
                <div className="ticker">{rug.symbol}</div>
                <div className="metrics">
                  <Metric label="My contribution" value={formatWei(contribution)} />
                  <Metric label="Claimed" value={claimed ? "Yes" : "No"} />
                  <Metric label="Total opening" value={formatWei(rug.total_contributed)} />
                </div>
              </a>
            ))}
          </section>
        </>
      ) : null}
      {!loading && createdRugs.length === 0 ? (
        <section className="panel empty">
          <h2>You Did Not Bring A Rug</h2>
          <p>No indexed Rugs list this address as creator.</p>
          <a className="primary" href="/create"><Plus size={18} />Bring one now</a>
        </section>
      ) : null}
      {createdRugs.length > 0 ? <h2 className="section-title">Rugs I Brought</h2> : null}
      <section className="grid">
        {createdRugs.map((rug) => (
          <a className="rug-card" href={`/rug/${rug.chain_id}/${rug.rug_address}`} key={`${rug.chain_id}-${rug.rug_address}`}>
            <div className="card-head">
              <strong>{rug.name}</strong>
              <span data-status={rug.status}>{rug.status}</span>
            </div>
            <div className="ticker">{rug.symbol}</div>
            <div className="metrics">
              <Metric label="Creator stake" value={formatWei(rug.creator_stake)} />
              <Metric label="Total opening" value={formatWei(rug.total_contributed)} />
              <Metric label="Founder remaining" value={formatToken(rug.founder_remaining)} />
            </div>
          </a>
        ))}
      </section>
    </main>
  );
}

function OpsPage() {
  const [config, setConfig] = useState<ApiConfig | null>(null);
  const [status, setStatus] = useState<IndexerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const [configResponse, statusResponse] = await Promise.all([
        fetch(`${API_BASE}/api/config`),
        fetch(`${API_BASE}/api/indexer/status`),
      ]);
      if (!configResponse.ok) throw new Error(`Config returned ${configResponse.status}`);
      if (!statusResponse.ok) throw new Error(`Indexer status returned ${statusResponse.status}`);
      setConfig(await configResponse.json() as ApiConfig);
      setStatus(await statusResponse.json() as IndexerStatus);
    } catch (error) {
      setConfig(null);
      setStatus(null);
      setMessage(error instanceof Error ? error.message : "Failed to load ops status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const syncRows = status?.sync ?? [];
  const sources = status?.factories ?? [];
  const warnings = status?.warnings ?? [];

  return (
    <main className="page ops-page">
      <section className="toolbar">
        <div>
          <span className="eyebrow">Staff only · no money handled here</span>
          <h1>BACKSTAGE<br />WIRING.</h1>
          <p>Read-only deployment and indexer health for the rebuildable discovery layer.</p>
        </div>
        <button className="ghost" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}Rattle the cables
        </button>
      </section>
      {message ? <section className="panel warning"><h2>Unavailable</h2><p>{message}</p></section> : null}
      {loading ? <LoadingPanel /> : null}
      {config && status ? (
        <>
          <section className="grid">
            <div className="panel">
              <h2>API Config</h2>
              <Metric label="Chain" value={String(config.chainId)} />
              <Metric label="Primary factory" value={config.factory ? short(config.factory) : "Not configured"} />
              <Metric label="Factory sources" value={String(config.factories.length)} />
              <Metric label="Financial truth" value={config.financialTruth} />
              <Metric label="Upload protection" value={config.uploadsProtected ? "Turnstile active" : config.uploadsEnabled ? "Test bypass" : "Uploads disabled"} />
            </div>
            <div className="panel">
              <h2>Indexer</h2>
              <Metric label="Chain" value={String(status.chainId)} />
              <Metric label="Latest block" value={status.latestBlock == null ? "Unavailable" : status.latestBlock.toLocaleString()} />
              <Metric label="Synced contracts" value={String(syncRows.length)} />
              <Metric label="Warnings" value={String(warnings.length)} />
            </div>
          </section>
          {warnings.length > 0 ? (
            <section className="panel warning">
              <h2>Warnings</h2>
              <div className="ops-list">
                {warnings.map((warning) => <code key={warning}>{warning}</code>)}
              </div>
            </section>
          ) : null}
          {!config.uploadsProtected ? (
            <section className="panel warning">
              <h2>Metadata Uploads Are Disabled</h2>
              <p>The API fails closed until matching Turnstile site and secret keys are configured.</p>
            </section>
          ) : null}
          <section className="panel">
            <h2>Factory Sources</h2>
            {sources.length === 0 ? <p>No factory sources are configured.</p> : (
              <div className="ops-list">
                {sources.map((source) => (
                  <div className="ops-row" key={`${source.address}-${source.fromBlock}`}>
                    <code>{source.address}</code>
                    <span>from block {source.fromBlock.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className="panel">
            <h2>Sync State</h2>
            {syncRows.length === 0 ? <p>No sync state has been written yet. Run the indexer after deployment.</p> : (
              <div className="ops-list">
                {syncRows.map((row) => (
                  <div className="ops-row" key={row.contract_address}>
                    <code>{row.contract_address}</code>
                    <span>next block {row.last_scanned_block.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}

function RiskPage() {
  return (
    <main className="page risk-page">
      <section className="page-intro">
        <span className="eyebrow">Mandatory awkward conversation</span>
        <h1>READ THIS BEFORE<br />ACTING SURPRISED.</h1>
        <p>Rugspull removes hidden founder privileges. It does not remove greed, bad timing, MEV, volatility, or your ability to click a terrible button.</p>
      </section>
      <Disclosure />
      <section className="risk-noticeboard">
        <article>
          <span>01</span>
          <h2>Opening is a batch</h2>
          <p>Contributors in the Opening share the same allocation formula. The transaction order does not create an earlier batch price.</p>
        </article>
        <article>
          <span>02</span>
          <h2>The founder pull is real</h2>
          <p>After unlock, the creator can sell the entire founder allocation once into the canonical pool. No partial founder sell exists.</p>
        </article>
        <article>
          <span>03</span>
          <h2>The pool keeps trading</h2>
          <p>The internal pool has no reserve-withdraw function. Rugged does not mean prices become sensible or losses become refundable.</p>
        </article>
        <article>
          <span>04</span>
          <h2>The browser signs nothing for you</h2>
          <p>Your wallet signs create, contribute, claim, buy, sell, and rug transactions directly. The Worker never moves funds for you.</p>
        </article>
        <article>
          <span>05</span>
          <h2>The booth takes a fee</h2>
          <p>Every canonical-pool trade charges 0.30% total. The pool retains 0.25%; the protocol treasury receives 0.05% in WBNB. Tiny trades may round the protocol portion down to zero.</p>
        </article>
      </section>
    </main>
  );
}

const FACT_PAGES = {
  "/how-it-works": {
    eyebrow: "Mechanism notice",
    title: "THE RUG FILES PAPERWORK.",
    intro: "Rugspull turns a familiar founder exit into a disclosed, inspectable sequence. The joke is optional; the rules are not.",
    sections: [
      ["01 · Opening", "The creator stakes at least 0.1 WBNB. A 24-hour Opening accepts a unified batch of contributions, with a 30% minimum and 50% cap relative to creator stake."],
      ["02 · Lock", "If the Opening succeeds, the token and internal WBNB RugPool are initialized. The 45% Founder Allocation remains in RugInstance through the Opening and a further 48-hour lock."],
      ["03 · One-shot exit", "After unlock, the creator may call rug() once to sell the entire protocol-held Founder Allocation into the canonical pool. Partial founder sells do not exist."],
      ["04 · After Rugged", "The canonical pool has no reserve-withdraw function and keeps trading. Rugged does not create a refund right, price floor, or safety guarantee."],
    ],
  },
  "/contracts": {
    eyebrow: "Verification counter",
    title: "CHECK THE ADDRESS.",
    intro: "The production Factory is immutable v0.4 on BNB Smart Chain. Exact-match source verification is evidence for inspection, not an independent audit.",
    sections: [
      ["Factory", "0xDFF540baBCa2ee8A2A8Ff26359Ecc9c5921D8A63"],
      ["Chain and quote", "BNB Smart Chain mainnet · chain id 56 · WBNB 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c"],
      ["Deployment", "Block 109991561 · tx 0x95426057625753b19dfbe3754c5e79bdff771e69159cf69a67977b24cd464cc6"],
      ["Inspect", "BscScan and the public repository are linked below. Read the constructor profile and deployed bytecode before treating any social post as evidence."],
    ],
  },
  "/fees": {
    eyebrow: "Public fee notice",
    title: "THE BOOTH TAKES A FEE.",
    intro: "Fees are fixed by the deployed Factory. Tiny trades can round the protocol portion down; no fee page changes settlement.",
    sections: [
      ["Create", "0.003 WBNB is charged when a Rug is created. The creator stake minimum is 0.1 WBNB. A failed launch does not refund the creation fee."],
      ["Canonical trade", "Nominal total is 0.30%: 0.25% remains in RugPool and 0.05% WBNB goes to the immutable protocol treasury."],
      ["Worked example", "On a 1.000 WBNB quoted trade, the nominal split is 0.0025 WBNB retained by the pool and 0.0005 WBNB to the treasury, subject to contract rounding."],
      ["Not a promise", "Fees do not reduce volatility, slippage, MEV, alternative-pool risk, or the possibility of total loss."],
    ],
  },
  "/transparency": {
    eyebrow: "Public records desk",
    title: "WHAT WE KNOW. WHAT WE DON'T.",
    intro: "The chain is financial truth. D1 and the Worker are rebuildable discovery and metadata layers, not settlement authorities.",
    sections: [
      ["Verified", "Mainnet Factory source is exact-match verified on BscScan and Sourcify. Mainnet fork E2E and two-RPC deployment reads are recorded in the repository."],
      ["Current public state", "The production deployment is live, but the indexed mainnet Rug list currently has no public lifecycle sample. We will not manufacture volume, contributors, holders, or testimonials."],
      ["Still open", "Independent audit, private RPC endpoints with SLA, legal and jurisdiction review, and content moderation / abuse response remain open gates."],
      ["Operations", "Financial actions are signed by user wallets. The Worker never buys, sells, rugs, claims, or refunds on behalf of users."],
    ],
  },
  "/security-model": {
    eyebrow: "Security claims register",
    title: "WHAT THE TESTS PROVE.",
    intro: "Rugspull treats economic rules as consensus-critical. These are tested properties and explicit trust boundaries—not a safety badge, guarantee, or substitute for independent audit.",
    sections: [
      ["Asset conservation", "Unit, fuzz, invariant, and scenario tests cover token conservation and WBNB conservation across Opening, Failed, Active, and Rugged lifecycle paths."],
      ["One action means one", "Tests reject double claim and double rug paths. Creator cancellation is unavailable after Opening starts, and Failed contributors claim their own recorded contribution."],
      ["Founder Token custody", "The 45% Founder Allocation stays in RugInstance. It is not sent to the creator wallet and has one contract-defined exit: a single full sale through rug() after unlock."],
      ["Canonical pool boundary", "RugPool is a non-upgradeable internal constant-product pool. Its recorded reserves are tested against actual balances, and no reserve-withdraw function or LP token exists."],
      ["Settlement boundary", "Create, contribute, claim, buy, sell, and rug transactions are signed by user wallets. The Worker, D1 cache, metadata, and AI copy cannot authorize or settle financial actions."],
      ["What remains unresolved", "Independent audit, two production RPC providers with SLA, legal and jurisdiction review, multisig custody, and staffed incident response remain open. MEV, slippage, alternative pools, key compromise, and total loss remain possible."],
    ],
  },
  "/api-reference": {
    eyebrow: "Developer reference · GET only",
    title: "READ THE CACHE. VERIFY THE CHAIN.",
    intro: "Nine public GET endpoints expose rebuildable discovery, indexed events, market observations, and immutable public objects. They do not settle transactions, move funds, sign wallet messages, or replace BNB Smart Chain as financial truth.",
    sections: [
      ["Service · 3 endpoints", "GET /api/health reports process liveness only. GET /api/config exposes public chain and Factory configuration. GET /api/indexer/status reports checkpoints, stale thresholds, and warnings. None proves complete history, RPC health, price accuracy, or an uptime SLA."],
      ["Rug discovery · 3 endpoints", "GET /api/rugs lists current-Factory cache rows. GET /api/rugs/{chainId}/{rugAddress} returns one indexed Rug. GET /api/rugs/{chainId}/{rugAddress}/events returns ordered cached events. Verify addresses, state, balances, and matching event history on BNB Smart Chain."],
      ["Market observations · 2 endpoints", "GET /api/rugs/{chainId}/{rugAddress}/market returns event-derived points and a Rug marker. GET /api/market/sparklines returns bounded recent price samples. These observations are not a price oracle, execution quote, liquidity guarantee, or investment signal."],
      ["Public objects · 1 endpoint", "GET /api/r2/{key} returns a public immutable metadata or image object only when its key passes the public-key policy. Content availability does not authenticate a Creator, prove rights ownership, or certify a Rug."],
      ["No execution surface", "The Read API exposes no buy, sell, rug, claim, refund, contribute, create, approval, signature, or transaction-proxy operation. Wallets call deployed contracts directly. The Worker and D1 remain rebuildable index and metadata layers."],
      ["Machine-readable resources", "OpenAPI 3.1, a GET-only Postman Collection, APIs.json, API Onboarding, and an RFC 9727 API Catalog are public discovery aids. Their publication does not prove third-party integration, review, partnership, recommendation, endorsement, indexing, or use."],
      ["Operational boundary", "No numeric rate limit or uptime SLA is offered. Independent audit remains pending, total loss remains possible, and organized new mainnet activity remains NO-GO while the published activation gates are unresolved."],
    ],
  },
  "/rugpool-vs-pancakeswap": {
    eyebrow: "Canonical pool field guide",
    title: "RUGPOOL IS NOT PANCAKESWAP.",
    intro: "Both can use constant-product arithmetic, but the deployed contracts, routing, liquidity model, events, and trust boundaries are different. A familiar formula does not make two pools interchangeable.",
    sections: [
      ["Different contracts", "RugPool is created for each successful Rug and is the protocol's internal canonical WBNB market. It is not a PancakeSwap pair, does not use a PancakeSwap router for canonical trades, and must not be labeled with PancakeSwap contracts or badges."],
      ["No LP token", "RugPool issues no LP token and exposes no remove-liquidity, reserve-withdraw, skim, or sync function. Its stored token and WBNB reserves are updated by its own canonical swap functions and should be reconciled against actual balances."],
      ["Direct canonical routing", "The official interface reads RugPool reserves and wallets call RugPool directly for canonical buys and sells. Rugspull v0.4 does not automatically migrate liquidity to PancakeSwap or treat an external pair as canonical."],
      ["Different display rules", "Integrators should reconstruct canonical activity from Rugspull Factory, RugInstance, and RugPool events. Do not infer a PancakeSwap LP owner, lock status, router route, pair ABI, or fee schedule merely because the pool uses x times y equals k."],
      ["Alternative pools remain possible", "RugToken is an ordinary ERC-20, so third parties can create external pools. Rugspull cannot prevent those pools, make their prices canonical, identify every related wallet, or guarantee that aggregators will distinguish them correctly."],
      ["No-reserve-withdraw is not safety", "The canonical reserve boundary does not remove the disclosed full Founder Allocation sale, slippage, MEV, alternative-pool risk, key compromise, volatility, or total loss. Independent audit and organized mainnet activation remain pending."],
    ],
  },
  "/failed-opening-refund-guide": {
    eyebrow: "Failed Opening · claim guide",
    title: "REFUNDS DO NOT WALK HOME ALONE.",
    intro: "When an Opening misses its minimum, any wallet may finalize the Rug as Failed. No RugToken or RugPool is created, but each contributor must claim their own recorded WBNB and the Creator must withdraw the stake separately.",
    sections: [
      ["01 · Verify Failed", "Wait until the 24-hour Opening has ended and verify the RugInstance status on BNB Smart Chain. If it is still Opening, any wallet may call finalize(); a launch becomes Failed only when total contribution is below the immutable minimum."],
      ["02 · No Token or Pool", "Failed finalization emits LaunchFailed and creates no RugToken or RugPool. Do not follow token-claim, swap, liquidity, or Founder Allocation instructions for a Failed Rug."],
      ["03 · Contributor action", "Each contributor calls claimFailedRefund() from the same wallet that contributed. The contract returns that wallet's full recorded WBNB contribution, marks the wallet claimed first, and rejects a second claim."],
      ["04 · Creator action", "The Creator separately calls withdrawCreatorStakeAfterFailure(). Only the recorded Creator can withdraw the Creator stake, and the one-shot creatorStakeWithdrawn flag prevents a second withdrawal."],
      ["05 · What is not refunded", "The 0.003 WBNB creation fee was paid to the protocol treasury when the Rug was created and is not part of a Failed refund. Contributor gas costs and Creator transaction gas are also not contract refunds."],
      ["06 · Evidence before settled", "Track eligible, claimed, and outstanding contributor refunds separately from eligible, withdrawn, and outstanding Creator stake. Do not write settled until every eligible contributor claim and the Creator withdrawal are evidenced."],
      ["07 · Wallet and support boundary", "The Worker, D1, support inbox, Telegram, and project operators cannot claim or refund on a user's behalf. Use the canonical RugInstance address, sign directly in the wallet, reject support DMs, and never share a seed phrase or private key."],
      ["TESTNET evidence boundary", "The public lifecycle archive includes one controlled BSC Testnet Failed path with a claimed contributor refund and withdrawn Creator stake. It demonstrates the mechanism, not mainnet adoption, an audit, guaranteed support, or future transaction success."],
    ],
  },
  "/what-if-founder-never-rugs": {
    eyebrow: "Still Waiting · mechanism guide",
    title: "UNLOCK IS NOT A DEADLINE.",
    intro: "Founder unlock marks the earliest time the recorded Creator may choose the one-shot Founder Allocation sale. It does not schedule, require, predict, or promise that the transaction will ever happen.",
    sections: [
      ["Permission, not automation", "After the immutable founderUnlockTime, only the recorded Creator may call rug(). No keeper, Worker, Factory owner, project operator, community vote, or countdown automatically executes it."],
      ["Status stays Active", "If the Creator does nothing, the Rug remains Active. There is no contract deadline that changes Active to Rugged, Failed, cancelled, expired, or refundable merely because time passes."],
      ["Founder Allocation stays held", "The full remaining Founder Allocation stays inside RugInstance rather than the Creator wallet. Ordinary Creator-wallet tokens are outside that special custody rule, and related-wallet behavior cannot be ruled out."],
      ["Trading and claims continue", "The internal canonical RugPool can continue trading while the Rug is Active, and contributors who have not yet called claimOpening() retain that contract path. Continued availability is not a price floor, liquidity guarantee, or uptime SLA."],
      ["No forced recovery path", "The contract cannot distinguish deliberate waiting from a lost or inaccessible Creator key. It exposes no alternate caller, admin recovery, partial Founder sale, cancellation, or reserve withdrawal to resolve a permanently inactive Creator."],
      ["Report a cutoff, not a forecast", "A Still Waiting record names a UTC time and block cutoff, verifies Active status and founderRemaining, and states that no RugPulled event was observed by that cutoff. It must not become a deadline, ultimatum, probability claim, or promise about future conduct."],
      ["Do not pressure the Creator", "Rugged is not a growth KPI. Rugspull does not reward, reimburse, threaten, countdown, or ask a Creator to execute rug() for content. Waiting and execution are both reported only after the corresponding chain evidence exists."],
      ["Risk remains", "While waiting, users still face Founder timing, ordinary token sales, related wallets, MEV, slippage, alternative pools, key compromise, volatility, and total loss. Independent audit and organized mainnet activation remain pending."],
    ],
  },
  "/why-trading-continues-after-rugged": {
    eyebrow: "Rugged · post-sale mechanics",
    title: "RUGGED DOES NOT PAUSE THE POOL.",
    intro: "Rugged records the disclosed one-shot Founder Allocation sale. It does not withdraw canonical reserves, disable RugPool, guarantee an exit, or make the remaining market healthy.",
    sections: [
      ["The Founder action is a swap", "rug() sends the full remaining protocol-held Founder Allocation into the canonical RugPool and sends the resulting WBNB output to the recorded Creator after fees. The pool ends with more RugToken and less WBNB; its reserves are updated rather than removed."],
      ["Status and pool execution are separate", "RugInstance changes from Active to Rugged after the one-shot sale. RugPool's canonical buy and sell functions are not paused by that status change, and RugPool has no owner-controlled pause, LP redemption, or reserve-withdraw path."],
      ["Price impact can be severe", "Selling the entire Founder Allocation in one transaction moves the constant-product reserves sharply. Continued quotes may reflect far less WBNB depth and a much lower token price. Rugged is a lifecycle fact, not a promise that prices remain meaningful."],
      ["Opening claims still exist", "A contributor who has not yet called claimOpening() may still claim after Rugged. That claim path distributes the contributor's recorded Opening entitlement; it is not a refund for the Founder sale and does not reverse the changed pool reserves."],
      ["Tradable does not mean sellable at a useful price", "A callable swap function does not guarantee enough WBNB depth, a buyer, acceptable slippage, MEV protection, frontend or RPC uptime, transaction success, or recovery of contributed funds. Minimum-output and deadline checks can revert rather than create liquidity."],
      ["Alternative pools are separate", "RugToken is an ordinary ERC-20, so third parties can create external pools. Their reserves, prices, routes, operators, and risks are not canonical RugPool state and must not be combined into a single liquidity or safety claim."],
      ["TESTNET evidence, not adoption", "The published controlled BSC Testnet lifecycle includes a Rugged path, a later canonical buy, and reserve-to-balance reconciliation. It demonstrates contract behavior only—not mainnet activity, users, volume, liquidity quality, an audit, or third-party validation."],
      ["Risk remains after Rugged", "MEV, slippage, alternative pools, related wallets, key compromise, volatility, thin WBNB reserves, frontend failure, and total loss remain possible. Independent audit and organized mainnet activation remain pending."],
    ],
  },
  "/24-hour-opening-explained": {
    eyebrow: "Opening · batch mechanics",
    title: "ONE WINDOW. ONE BATCH. MANY RISKS.",
    intro: "The production Opening records WBNB contributions for 24 hours before one deterministic success-or-failure calculation. It changes allocation timing; it does not make participation fair, safe, private, or profitable.",
    sections: [
      ["The window is 86,400 seconds", "Each Rug records openingStart and openingEnd from the Factory's immutable 24-hour duration. Contributions must be included before openingEnd. Once Opening starts, the Creator cannot cancel it or shorten, extend, or rewrite the Rug's economics."],
      ["No instant trade occurs", "contribute(amount) transfers WBNB into RugInstance and records the sender's cumulative contribution. It does not immediately mint a user balance, move along a bonding curve, create RugPool, or establish a tradable spot price. A non-Creator wallet may contribute more than once."],
      ["Ending is not automatic", "After openingEnd, any address may call finalize(). Until a successful finalize transaction is included, the contract can still report Opening even though new contributions revert. No Worker, keeper, administrator, or timer performs settlement off-chain."],
      ["The minimum and cap come from Creator stake", "For the deployed Factory, launch requires total user contributions of at least 30% of Creator stake. If that threshold is met, accepted contribution Q is the smaller of total contribution U and a 50%-of-stake cap. The Creator stake plus Q initializes canonical WBNB reserves."],
      ["One formula applies to the batch", "On success, every contributor's token claim is proportional to their recorded contribution divided by total contribution, subject to integer rounding. If U exceeds the cap, the excess WBNB refund is proportional by the same contribution share. Earlier transactions do not receive an earlier batch price."],
      ["What the batch reduces", "The design separates contribution collection from the first canonical spot trade and removes an in-window bonding-curve race for progressively changing prices. It also publishes one cutoff, one total, one accepted amount, and reconstructible claim inputs."],
      ["What the batch does not solve", "The window does not prevent whale concentration, multiple or related wallets, last-block inclusion competition, congestion, censorship, failed transactions, malicious metadata, alternative pools, MEV after activation, Founder selling, volatility, or total loss."],
      ["Claims and refunds require transactions", "A successful Opening requires each contributor to call claimOpening() for tokens and any excess refund. A Failed Opening requires claimFailedRefund(), while the Creator separately withdraws the stake. Finalization does not push every entitlement automatically."],
      ["Evidence boundary", "Controlled BSC Testnet paths demonstrate Failed and successful finalization mechanics with shortened 90-second windows. Those demo timings are not production rules, and the evidence is not mainnet adoption, an independent audit, a fairness certification, or a safety guarantee. Organized mainnet activation remains pending."],
    ],
  },
  "/creator-stake-risk-explained": {
    eyebrow: "Creator stake · loss path",
    title: "STAKE IS AT RISK. FEES ARE SPENT.",
    intro: "Creator stake is protocol input, not protected principal. A Failed Opening exposes a withdrawal path for stake; a successful Opening puts it into RugPool without giving the Creator an LP token, reserve claim, or guaranteed recovery.",
    sections: [
      ["Two WBNB amounts leave at creation", "The deployed Factory requires at least 0.1 WBNB of Creator stake and separately charges a 0.003 WBNB creation fee. createRug() transfers both from the Creator; the fee goes immediately to the protocol treasury while the stake moves to the new RugInstance."],
      ["The creation fee is not stake", "The creation fee is not added to RugPool, counted toward Opening minimums, or returned when an Opening fails. Gas is also external to contract accounting. A recovered stake therefore does not mean the Creator's total creation cost was refunded."],
      ["During Opening, stake is held", "RugInstance holds the stake while user contributions are recorded. The recorded Creator address cannot contribute through contribute(), cannot cancel after Opening starts, and cannot withdraw stake while status remains Opening."],
      ["Failed exposes one separate withdrawal", "If total user contribution is below the immutable minimum after the window, finalize() sets Failed. Only the recorded Creator may then call withdrawCreatorStakeAfterFailure(), once. The transaction is not automatic, does not refund the creation fee or gas, and is separate from contributor refunds."],
      ["Success moves stake into RugPool", "If Opening succeeds, canonical WBNB reserve Y equals Creator stake C plus accepted contribution Q. That WBNB enters RugPool with the calculated token reserve. RugPool issues no LP token and exposes no remove-liquidity or reserve-withdraw function, so the Creator cannot redeem C as principal."],
      ["Founder Allocation is a different asset", "The 45% Founder Allocation remains as RugToken inside RugInstance until the optional one-shot rug(). It is not a receipt for the deposited stake. rug() sells the entire remaining Founder Allocation into then-current reserves and sends the resulting WBNB output after fees."],
      ["Sale output can be below stake", "Earlier holder sales, thin WBNB reserves, price movement, MEV, slippage protection, fees, timing, and the full-allocation price impact can reduce Founder sale output or cause the transaction to revert. There is no contract promise that quoteOut equals or exceeds Creator stake."],
      ["PnL is not a protocol guarantee", "For the disclosed Founder path, quoteOut minus Creator stake is only a simplified comparison. A complete wallet result would also account for the non-refundable creation fee, gas, and any unrelated wallet activity. The protocol does not calculate, insure, reimburse, or promise Creator profit."],
      ["No recruitment or safety claim", "Controlled BSC Testnet evidence demonstrates Failed stake withdrawal and a separate Rugged path. It is not mainnet Creator performance, financial advice, an audit, adoption, or an invitation to create a Rug. Organized mainnet Creator activity remains NO-GO while published activation gates are unresolved."],
    ],
  },
  "/why-founder-cannot-sell-in-parts": {
    eyebrow: "Founder Allocation · one-shot rule",
    title: "ONE EXIT. THE WHOLE ALLOCATION.",
    intro: "The protocol-held Founder Allocation has no partial-sale control. After unlock, the recorded Creator can either submit one transaction for all remaining Founder Tokens or leave the allocation in RugInstance.",
    sections: [
      ["rug() has no amount input", "The Creator supplies only minQuoteOut and deadline. RugInstance reads founderRemaining as the sale amount; there is no parameter for 1%, a tranche, a schedule, or a chosen token quantity."],
      ["The full state change is atomic", "In the same transaction, founderRemaining is set to zero, status changes from Active to Rugged, the full amount moves to RugPool, and RugPool executes the Founder sell. If the swap, transfer, slippage check, or deadline check reverts, the EVM rolls the whole transaction back."],
      ["No partial fill on slippage", "minQuoteOut and deadline can protect the submitted transaction from an unacceptable or stale result, but they do not ask RugPool to sell a smaller quantity. The outcome is one full Founder sale or no state change from that attempt."],
      ["A second protocol sale is rejected", "After a successful call, founderRemaining is zero and RugInstance status is Rugged. rug() requires Active status, so another call cannot sell a second Founder tranche. Project tests explicitly cover the one-shot rejection."],
      ["The rule makes one event inspectable", "A successful transaction emits RugPulled with the full Founder token amount and WBNB output. Reviewers can compare founderRemaining, status, transfers, fees, and pool reserves before and after one disclosed state transition."],
      ["Timing is still discretionary", "The rule fixes quantity, caller, earliest time, and one-shot execution path; it does not force the Creator to act at unlock or any later deadline. Waiting is valid contract state, and Rugged is not a growth target."],
      ["Ordinary wallet tokens are outside the rule", "The restriction applies only to the 45% Founder Allocation held by RugInstance. A Creator-controlled or related wallet can acquire ordinary RugToken through claims, transfers, canonical trading, or external pools and sell those tokens like another holder. The protocol cannot reliably identify every related address."],
      ["No reserve withdrawal occurs", "The one-shot action is a token-for-WBNB swap against canonical reserves, not an LP redemption or reserve transfer. RugPool has no LP token or reserve-withdraw function, but the full sale can still create extreme price impact and reduce WBNB depth."],
      ["A clearer risk is still a risk", "No-partial-sale makes one protocol-held action easier to describe and reconstruct; it does not make the market safe. Founder timing, related wallets, MEV, slippage, alternative pools, key compromise, volatility, and total loss remain possible. Independent audit and organized mainnet activation remain pending."],
    ],
  },
  "/can-the-creator-contribute": {
    eyebrow: "Opening · identity boundary",
    title: "ONE ADDRESS IS BLOCKED. IDENTITIES ARE NOT SOLVED.",
    intro: "The recorded Creator address cannot call contribute() during Opening. That exact-address rule separates the known Creator from the contributor ledger; it does not identify related wallets or make the batch sybil-resistant.",
    sections: [
      ["The contract checks msg.sender", "contribute(amount) requires Opening status, a timestamp before openingEnd, and a nonzero amount. It then compares msg.sender with the immutable recorded Creator address. An exact match reverts with CreatorCannotContribute before WBNB is transferred or contribution totals change."],
      ["Creator stake is not a contribution", "The Creator separately deposits at least 0.1 WBNB as stake when creating the Rug and pays the 0.003 WBNB creation fee. Stake sets the Opening minimum and cap and is held by RugInstance; it does not create a contributionOf entry or a contributor token claim."],
      ["Other wallets may contribute repeatedly", "A non-Creator address may call contribute() more than once before the cutoff. Each successful call adds to that wallet's contributionOf balance and to totalContributed, then transfers the specified WBNB into RugInstance."],
      ["The check knows one address, not one person", "The EVM exposes the transaction sender, not a reliable map of people, organizations, device owners, or wallet relationships. A Creator-controlled or coordinated address that is not byte-for-byte equal to creator is not identified by this rule."],
      ["This is not anti-sybil", "Rugspull does not perform identity verification, proof-of-personhood, wallet clustering, allowlisting, sanctions screening, or related-address detection in contribute(). Multiple wallets can belong to one actor, and one wallet can be operated for others."],
      ["Threshold and cap still use the full ledger", "After the 24-hour window, permissionless finalize() compares totalContributed with the 30%-of-stake minimum. On success, accepted contribution is capped at 50% of Creator stake, and every recorded contributor uses the same proportional claim and excess-refund formulas."],
      ["Claims remain wallet-specific", "The address recorded in contributionOf must call claimOpening() or, after a Failed result, claimFailedRefund(). The Creator address restriction does not let the Worker, support account, administrator, or another wallet claim on a contributor's behalf."],
      ["One batch is not identity fairness", "The unified Opening formula removes an in-window changing-price race, but it does not guarantee one-person-one-allocation, equal inclusion, geographic eligibility, honest wallet disclosure, or protection from last-block congestion and censorship."],
      ["The risk boundary remains", "The exact-address restriction is a narrow, tested mechanism fact—not proof of a fair launch, independent audit, safety, adoption, or suitable participation. Related-wallet behavior, Founder selling, MEV, alternative pools, volatility, and total loss remain possible. Organized new mainnet activity remains NO-GO."],
    ],
  },
  "/can-the-creator-cancel-opening": {
    eyebrow: "Opening · cancellation boundary",
    title: "OPENING HAS NO CANCEL BUTTON.",
    intro: "Once RugFactory creates a RugInstance, its Opening follows the recorded window and contribution result. The Creator cannot cancel, replace, shorten, extend, or manually choose the outcome.",
    sections: [
      ["There is no cancel function", "The deployed RugInstance interface exposes contribute(), finalize(), claimOpening(), claimFailedRefund(), withdrawCreatorStakeAfterFailure(), and rug(). It exposes no cancel, abort, delete, close-early, reset, or Creator-refund function for an Opening."],
      ["Opening times are immutable", "openingStart is recorded at creation and openingEnd is calculated from the Factory's immutable duration. The Creator cannot change either timestamp, rewrite the minimum or cap, swap the Creator address, or alter the Rug's economics after creation."],
      ["Contributions remain rule-bound", "Before openingEnd, non-Creator wallets may contribute while status is Opening. The Creator cannot close the window because participation is low, high, inconvenient, or different from an off-chain expectation."],
      ["The cutoff is not automatic settlement", "At openingEnd, new contributions revert, but status can remain Opening until a transaction calls finalize(). Any address may submit that transaction; the Creator has no exclusive settlement right and cannot veto another caller."],
      ["One comparison selects the outcome", "finalize() compares totalContributed with the immutable minLaunchAmount. Below the threshold it records Failed and emits LaunchFailed. At or above the threshold it calculates the capped accepted contribution, deploys RugToken and RugPool, initializes reserves, records the Founder Allocation, and sets Active."],
      ["Failed is not Creator cancellation", "A Failed result comes only from the recorded contribution total after the window, not from Creator discretion. Contributors must claim their own full WBNB records, while the Creator separately withdraws stake once. The creation fee and gas are not refunded."],
      ["Active has no Creator unwind", "After successful finalization, Creator stake and accepted WBNB are canonical pool reserves. RugPool issues no LP token and has no reserve-withdraw or remove-liquidity function. The Creator cannot reverse the launch to retrieve stake as principal."],
      ["Factory pause does not cancel a Rug", "The Factory owner may pause creation of new Rugs, but that does not rewrite or cancel an existing RugInstance. The Worker, D1, frontend, support inbox, and project operators also have no settlement or cancellation authority."],
      ["No cancellation is not a guarantee", "The absence of a Creator cancel path does not guarantee that someone finalizes promptly, that an Opening succeeds, that claims complete, or that trading is liquid or safe. Congestion, failed transactions, Founder selling, MEV, alternative pools, volatility, and total loss remain possible. Independent audit and organized mainnet activation remain pending."],
    ],
  },
  "/what-happens-to-excess-contributions": {
    eyebrow: "Opening · excess WBNB",
    title: "THE CAP ACCEPTS LESS. CLAIM THE REST.",
    intro: "A successful Opening can record more WBNB than the canonical pool accepts. The excess is allocated back to contributors by formula, but each wallet must claim it together with its Opening tokens.",
    sections: [
      ["The cap is derived from Creator stake", "For the deployed Factory, openingCap equals 50% of Creator stake. The cap limits accepted user contribution; it does not prevent totalContributed from growing above that amount during the 24-hour Opening."],
      ["Accepted contribution is min(U, cap)", "At successful finalization, the contract records Q = min(totalContributed U, openingCap). Only Q joins Creator stake in canonical WBNB reserve Y. The amount U - Q is the aggregate excess assigned back through contributor claims."],
      ["Below the cap means no excess", "If totalContributed is at or below openingCap, acceptedContribution equals the total and the aggregate excess is zero. A successful contributor still claims tokens, but the excess-refund component is zero."],
      ["Each refund follows contribution share", "For a wallet with recorded contribution u, claimOpening() computes refundAmount = floor((U - Q) × u ÷ U). A larger recorded contribution receives a proportionally larger share; transaction order does not create a preferred refund rate."],
      ["Token claims use the same denominator", "The wallet's tokenAmount is floor(openingTokenAllocation × u ÷ U). Both token and excess-WBNB outputs use the wallet's contribution share of the same final total, so the batch does not grant an earlier contributor a different formula."],
      ["Integer arithmetic rounds down", "Solidity performs integer division, so each wallet calculation rounds down to whole token units and WBNB wei. Display estimates must use integer math and must not promise that independently rounded wallet values sum to a decimal model with no remainder."],
      ["The refund is not pushed automatically", "finalize() records the successful result but does not transfer every contributor's tokens or excess WBNB. The contributing address calls claimOpening(); the transaction marks that address claimed before transferring both calculated amounts and rejects a second claim."],
      ["Failed uses a different path", "If totalContributed is below the 30%-of-stake launch minimum, the Rug becomes Failed instead of applying the successful-Opening cap allocation. Each contributor then calls claimFailedRefund() for that wallet's full recorded contribution; no RugToken or RugPool is created."],
      ["Support cannot claim for a wallet", "The Worker, D1, frontend, Creator, administrator, Telegram account, and support inbox cannot sign claimOpening() for a contributor. Verify the RugInstance address, use the original wallet, reject support DMs, and never share a seed phrase or private key."],
      ["A refund formula is not protection", "The cap and excess formula do not guarantee transaction inclusion, claim completion, token value, liquidity, fair identities, or safety. Founder selling, MEV, alternative pools, volatility, key compromise, and total loss remain possible. Independent audit and organized mainnet activation remain pending."],
    ],
  },
  "/who-can-finalize-an-opening": {
    eyebrow: "Opening · permissionless finalization",
    title: "THE CLOCK ENDS. A TRANSACTION SETTLES.",
    intro: "Rugspull does not assign finalization to the Creator, an administrator, or an off-chain keeper. After the recorded cutoff, any address may submit finalize(); the contract then selects Failed or Active from the contribution total.",
    sections: [
      ["Anyone may call after the cutoff", "finalize() has no Creator, owner, allowlist, or operator check. Once block.timestamp is at least openingEnd and status is still Opening, any EVM address may submit the transaction. The caller pays gas and receives no protocol reward for doing so."],
      ["Calling early reverts", "Before openingEnd, finalize() reverts with OpeningNotEnded. Contributions remain possible only while status is Opening and block.timestamp is earlier than openingEnd; the same recorded timestamp separates the contribution window from finalization eligibility."],
      ["The countdown does not send a transaction", "Reaching openingEnd stops new contributions but does not itself change contract storage. Status may continue to read Opening until a finalize transaction is successfully included. The frontend, Worker, D1, support inbox, and a wall-clock timer cannot settle it off-chain."],
      ["The caller does not choose the result", "finalize() compares totalContributed with immutable minLaunchAmount. If the total is below the threshold, status becomes Failed and LaunchFailed records the total and minimum. The caller cannot override that comparison, add contributions after the cutoff, or select Active manually."],
      ["Success creates the canonical market", "At or above the threshold, accepted contribution is capped by openingCap. The transaction calculates token allocations and reserves, deploys RugToken and RugPool, transfers canonical token and WBNB reserves, initializes RugPool, records the full protocol-held Founder Allocation, sets Active, and emits LaunchSucceeded."],
      ["Finalization is atomic and one-shot", "If a required deployment, transfer, or initialization step reverts, the EVM reverts the whole transaction instead of leaving a half-finalized market. After a successful Failed or Active result, another finalize() call reverts with BadStatus because the Rug is no longer Opening."],
      ["Finalization does not complete claims", "A Failed result leaves each contributor to call claimFailedRefund() and the Creator to call withdrawCreatorStakeAfterFailure(). An Active result leaves each contributor to call claimOpening() for tokens and any excess WBNB. The finalizer cannot claim or refund for those wallets."],
      ["Permissionless is not automatic or guaranteed", "Open access removes an exclusive Creator finalization right; it does not guarantee prompt inclusion, available RPCs, adequate gas, successful claims, fair identities, liquidity, price, or safety. Congestion, failed transactions, Founder selling, MEV, alternative pools, volatility, key compromise, and total loss remain possible. Independent audit and organized mainnet activation remain pending."],
    ],
  },
  "/how-to-claim-opening-tokens": {
    eyebrow: "Active or Rugged · wallet claim",
    title: "FINALIZED IS NOT CLAIMED.",
    intro: "A successful Opening records each contributor's entitlement but does not push assets to every wallet. The original contributing address calls claimOpening() once to receive its calculated RugToken amount and any excess WBNB refund.",
    sections: [
      ["Wait for Active or Rugged", "claimOpening() is available only after a successful finalize transaction sets status to Active. It remains available after the Founder Allocation is sold and status becomes Rugged. While status is Opening or Failed, this function reverts with BadStatus."],
      ["Use the original contributing wallet", "The contract reads contributionOf[msg.sender]. The address that accumulated the contribution must sign the claim transaction; another wallet, the Creator, support, an administrator, the frontend, Worker, or D1 cannot redirect or claim that entitlement on its behalf."],
      ["One call returns two calculated assets", "For wallet contribution u and final total U, tokenAmount = floor(openingTokenAllocation × u ÷ U). If accepted contribution Q is below U, refundAmount = floor((U - Q) × u ÷ U). The transaction transfers the token amount and any nonzero excess WBNB together."],
      ["Integer rounding is part of settlement", "Solidity integer division rounds each wallet amount down. A very small entitlement can round to zero, and aggregate per-wallet claims can leave token or WBNB dust in RugInstance. The contract has no function that reallocates that dust to another claimant or lets support override the formula."],
      ["The claim is one-shot", "Before transfers, the transaction checks that claimed[msg.sender] is false and then records it true. After a successful claim, a second call from the same wallet reverts with AlreadyClaimed. If a required transfer reverts, EVM atomicity reverts the whole transaction, including the claimed update."],
      ["Read the event and balances", "A successful call emits ClaimedOpening with the RugInstance, user, tokenAmount, and refundAmount. Verify the transaction on BscScan, the RugInstance and RugToken addresses, the claimed flag, and wallet balance changes rather than trusting a support message or screenshot."],
      ["No contract deadline does not mean no operational risk", "claimOpening() has no deadline parameter or timestamp expiry while status remains Active or Rugged. That does not guarantee frontend availability, RPC access, transaction inclusion, affordable gas, key access, chain continuity, or support response. The wallet needs native BNB for gas; the claim does not require granting a WBNB allowance."],
      ["Failed Opening uses a different function", "If finalization records Failed, no RugToken or RugPool exists and claimOpening() is unavailable. Each contributor instead calls claimFailedRefund() for that wallet's full recorded WBNB contribution; the Creator uses a separate stake-withdrawal path."],
      ["Claiming is not a safety or value claim", "Receiving tokens and any excess WBNB does not guarantee token value, liquidity, profitable trading, identity fairness, or protection from Founder selling, MEV, alternative pools, volatility, phishing, key compromise, and total loss. Independent audit and organized mainnet activation remain pending."],
    ],
  },
  "/what-is-wbnb": {
    eyebrow: "BNB Chain · quote asset guide",
    title: "BNB PAYS GAS. WBNB ENTERS THE CONTRACT.",
    intro: "WBNB is the tokenized form of BNB used by Rugspull contracts as the only MVP quote asset. Wrapping changes the interface used by contracts; it is not a yield product, stablecoin, investment strategy, or safety feature.",
    sections: [
      ["Native BNB and WBNB are different balance types", "Native BNB is BNB Smart Chain's gas asset. WBNB is a BEP-20-compatible contract balance designed for token-style transfers and allowances. A wallet can hold both at the same time, and the Rugspull interface displays them separately."],
      ["Wrapping and unwrapping are direct conversions", "The canonical WBNB contract accepts native BNB through deposit() and mints the same amount of WBNB units; withdraw(amount) burns WBNB and returns the corresponding native BNB. The project does not set an exchange rate, add yield, or guarantee that a third-party wrapper is canonical."],
      ["Verify the mainnet contract", "Rugspull's deployed BNB Smart Chain mainnet Factory records WBNB at 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c. Verify chain id 56, the Factory WBNB() value, and the exact address before approving or transferring. A matching name or symbol is not enough."],
      ["Why Rugspull uses WBNB", "The MVP accepts WBNB as its only quote asset so Factory fees, Creator stake, Opening contributions, canonical RugPool reserves, swap inputs and outputs, refunds, and protocol fees use one token interface. Rugspull does not use a stablecoin quote and does not route its canonical market through PancakeSwap."],
      ["Approvals are scoped contract permissions", "Creating a Rug, contributing WBNB, or buying through RugPool can require a WBNB allowance for the specific Factory, RugInstance, or RugPool that will call transferFrom. An approval is not a payment by itself, but a malicious or excessive allowance can later be abused by its approved spender. Verify the spender and amount in the wallet."],
      ["Keep native BNB for gas", "WBNB cannot pay normal BNB Smart Chain transaction gas. Wrapping an entire native BNB balance can leave a wallet unable to submit an approval, create, contribute, claim, refund, trade, finalize, unwrap, or Founder transaction until it receives more native BNB."],
      ["Claims do not require a new WBNB approval", "claimOpening(), claimFailedRefund(), and withdrawCreatorStakeAfterFailure() transfer already-recorded assets out of RugInstance and do not need the claimant to grant a fresh WBNB allowance. The original eligible wallet still needs native BNB for gas and must call the correct RugInstance directly."],
      ["WBNB accounting does not remove market risk", "Using one canonical quote token makes balances and reserves easier to reconcile; it does not guarantee WBNB depth, price, transaction inclusion, slippage, MEV protection, wallet safety, an exit, or recovery. Founder selling, alternative pools, phishing, key compromise, volatility, and total loss remain possible. Independent audit and organized mainnet activation remain pending."],
    ],
  },
  "/what-is-a-token-approval": {
    eyebrow: "BNB Chain · allowance guide",
    title: "APPROVAL IS PERMISSION. VERIFY THE SPENDER.",
    intro: "A BEP-20 token approval records how much of one token a named spender contract may move from a wallet with transferFrom(). It is not the same transaction as wrapping, paying gas, contributing, trading, claiming, refunding, or granting control of every wallet asset.",
    sections: [
      ["Allowance names a token, owner, spender, and amount", "The token contract stores allowance(owner, spender). The permission applies only to that token contract, owner wallet, spender address, and remaining amount. A matching app name, symbol, logo, or support message does not verify any of those addresses."],
      ["Creation approves the Factory", "Before createRug(), the Creator may need to approve the canonical RugFactory to transfer the WBNB Creator stake plus creation fee. The new RugInstance does not exist until creation succeeds, so a different spender address is not interchangeable with the Factory."],
      ["Opening contributions approve one RugInstance", "Before contribute(amount), a non-Creator contributor may need to approve that exact RugInstance to transfer WBNB. Permission for one RugInstance does not automatically authorize another Rug, RugPool, Factory, support account, or frontend."],
      ["Canonical trades approve RugPool", "A WBNB-to-token buy may need WBNB allowance for the exact canonical RugPool. A token-to-WBNB sell may need that RugToken's allowance for the same RugPool. Verify the RugInstance pool() value and chain before signing; an alternative pool remains a separate contract and risk surface."],
      ["Some actions require no token approval", "Wrapping native BNB through canonical WBNB deposit() sends native value and does not grant a token allowance. claimOpening(), claimFailedRefund(), withdrawCreatorStakeAfterFailure(), and permissionless finalize() do not need a new WBNB allowance from the caller. Every transaction still needs native BNB for gas."],
      ["Approval is not the later transfer", "A successful approve() changes allowance but does not by itself create a Rug, contribute, buy, sell, claim, refund, finalize, or rug. The later contract call can use transferFrom() up to the available allowance and balance; wallet interfaces should present approval and action as separate transactions when both are required."],
      ["Prefer the required spender and amount", "Check the token, spender, chain, and amount in the wallet before signing. A larger or unlimited allowance can outlive the immediate action and increases exposure if the approved spender is malicious or compromised. Rugspull's frontend requests the amount needed for the action when current allowance is insufficient, but the signed wallet request remains authoritative."],
      ["Revocation changes future allowance only", "Setting an allowance to zero can stop that spender from making future transferFrom() calls under the revoked permission. Revocation costs gas, does not undo a confirmed transfer, cancel immutable Rug economics, reverse a trade, recover losses, revoke a different token or spender, or remove permissions already granted elsewhere."],
      ["Approval hygiene is not protocol safety", "Correct approvals reduce one class of wallet error; they do not guarantee contract correctness, transaction inclusion, price, liquidity, slippage, MEV protection, identity fairness, key security, an exit, or recovery. Founder selling, alternative pools, phishing, volatility, and total loss remain possible. Independent audit and organized mainnet activation remain pending."],
    ],
  },
  "/what-is-slippage-on-bnb-chain": {
    eyebrow: "BNB Chain · swap protection guide",
    title: "THE QUOTE MOVES. MINIMUM OUTPUT DECIDES.",
    intro: "Slippage tolerance sets the lowest output a submitted swap may accept relative to a current estimate. It is a transaction constraint—not a promise about price, inclusion, liquidity, MEV protection, or whether a trade will succeed.",
    sections: [
      ["An estimate is a current-state calculation", "Rugspull computes an estimated output from the entered amount, the canonical RugPool reserves, and the deployed swap and protocol fees. A quote is not reserved for the wallet. Another confirmed trade can change reserves before the submitted transaction executes."],
      ["Price impact and slippage are related but different", "Price impact is already present in the constant-product quote because the submitted amount moves along the pool curve. Slippage tolerance allows the final output to be lower than that displayed estimate if pool state changes before execution. It does not remove the trade's own price impact."],
      ["Minimum output is calculated in basis points", "The frontend calculates floor(estimate × (10,000 - slippageBps) ÷ 10,000). Its visible choices are 1%, 3%, and 5%, with 3% selected initially. Integer division rounds the minimum down, and the signed transaction parameters—not a screenshot—are authoritative."],
      ["RugPool enforces the floor atomically", "A buy passes minTokensOut; a sell passes minQuoteOut. RugPool calculates the actual output from execution-time reserves and reverts with Slippage() when actual output is below the submitted minimum. The EVM then rolls back token transfers, reserve writes, protocol-fee transfers, and swap events from that attempt, although gas is still spent."],
      ["The deadline rejects stale attempts", "The Rugspull frontend submits canonical buys, sells, and the Creator's one-shot Founder sale with a deadline 20 minutes after the wallet prepares the call. RugPool reverts with Expired() only when block.timestamp is later than that submitted deadline. A deadline is not a promise of confirmation within 20 minutes."],
      ["Tighter and wider settings trade failure risk for price exposure", "A tighter tolerance rejects a smaller adverse move but can revert more often as reserves change. A wider tolerance may let a worse output execute and can increase exposure to volatility or transaction ordering. Neither setting determines whether a transaction is included or protects against every form of MEV."],
      ["More tolerance does not create liquidity", "Thin WBNB or token reserves, a large order, the full Founder Allocation sale, fees, earlier trades, or alternative-pool activity can produce severe price impact or no acceptable canonical output. Raising tolerance cannot add reserves, guarantee a buyer, restore a prior price, or recover losses."],
      ["A reverted swap is not a completed swap", "After a Slippage() or Expired() revert, verify the transaction receipt and current allowance separately. No canonical swap state from that attempt is committed, but an earlier approval can remain available to the exact token spender and the failed transaction still consumes native BNB gas."],
      ["Slippage controls are not protocol safety", "Minimum output and deadlines bound one submitted call; they do not guarantee contract correctness, reserve depth, fair ordering, price stability, frontend or RPC availability, wallet safety, an exit, or recovery. Founder selling, alternative pools, phishing, key compromise, volatility, and total loss remain possible. Independent audit and organized mainnet activation remain pending."],
    ],
  },
  "/constant-product-amm-explained": {
    eyebrow: "RugPool · AMM arithmetic guide",
    title: "THE PRODUCT STAYS. THE PRICE MOVES.",
    intro: "A constant-product automated market maker quotes swaps from two stored reserves instead of an order book. The curve makes execution calculable; it does not make price constant, liquidity deep, ordering fair, or participation safe.",
    sections: [
      ["Two stored reserves define the canonical curve", "Each initialized RugPool stores reserveToken and reserveQuote, where quote means WBNB. The familiar shorthand is reserveToken × reserveQuote = k. A swap moves the reserve pair along the curve; k is not a token price, account balance, guarantee, or value floor."],
      ["The reserve ratio is not a guaranteed execution price", "reserveQuote ÷ reserveToken can describe a spot-like pool ratio, but a real order changes both reserves. Larger orders consume more of the output reserve and receive a worse average rate. Fees and integer rounding also make execution differ from a simple ratio."],
      ["The amount-out formula uses post-fee input", "RugMath calculates floor(reserveOut × amountInAfterFee ÷ (reserveIn + amountInAfterFee)). It rejects zero input, zero reserves, invalid fees, and outputs that round to zero. Solidity integer division always rounds down; no floating-point arithmetic or off-chain price oracle settles the swap."],
      ["A buy separates protocol fee before the pool quote", "For WBNB-to-token buys, RugPool first calculates the 0.05% protocol WBNB fee, then treats the remainder as poolQuoteIn. The 0.25% pool fee is applied inside the amount-out formula, while the full poolQuoteIn increases the stored WBNB reserve. The protocol portion goes to the immutable treasury."],
      ["A sell removes gross WBNB before splitting output", "For token-to-WBNB sells, the 0.25% pool fee is applied to token input inside the quote formula. RugPool removes grossQuoteOut from its stored WBNB reserve, calculates the 0.05% protocol fee from that gross amount, sends the fee to the treasury, and sends the remainder to the recipient."],
      ["Fees and rounding make k nondecreasing, not fixed byte-for-byte", "The phrase constant product describes the no-fee ideal. Because the pool retains its fee and calculations round down, the recorded reserve product can increase rather than remain numerically identical after a swap. Nondecreasing k does not prove fair price, healthy liquidity, profit, or recoverability."],
      ["Direct token donations are not synchronized into quotes", "RugPool has no sync or skim function. Tokens or WBNB transferred directly to the pool outside its swap paths remain balance surplus above the stored reserves and are not automatically added to the quoting curve. A wallet balance alone is therefore not a substitute for getReserves() plus transfer history."],
      ["RugPool has no LP redemption path", "The canonical pool issues no LP token and exposes no remove-liquidity or reserve-withdraw function. Successful Opening assets become pool reserves rather than a Creator-redeemable position. That boundary does not prevent the disclosed full Founder Allocation sale from changing reserve composition sharply."],
      ["Alternative pools do not change canonical state", "RugToken is an ordinary ERC-20, so third parties can create separate pools with different contracts, reserves, fees, routing, and risks. Their prices do not update RugPool reserves and must not be merged into a claim about canonical liquidity or protocol safety."],
      ["A deterministic curve is not a safety guarantee", "Constant-product arithmetic does not guarantee reserve depth, stable price, acceptable slippage, transaction inclusion, MEV protection, wallet security, a buyer, an exit, or recovery. Founder selling, related wallets, alternative pools, phishing, key compromise, volatility, and total loss remain possible. Independent audit and organized mainnet activation remain pending."],
    ],
  },
  "/what-is-liquidity-on-bnb-chain": {
    eyebrow: "BNB Chain · liquidity and reserve guide",
    title: "LIQUIDITY IS INVENTORY. DEPTH CHANGES THE TRADE.",
    intro: "AMM liquidity is the token and quote-asset inventory available to the pool's curve. More reserve depth can reduce a trade's price impact; it does not guarantee price, execution, a buyer, an exit, recovery, or safety.",
    sections: [
      ["Two reserves make the canonical market", "Rugspull's canonical RugPool stores reserveToken and reserveQuote, where quote means WBNB. A buy adds WBNB-side input and removes RugToken output; a sell adds RugToken input and removes gross WBNB output. Liquidity is therefore two-sided inventory, not a single wallet balance or marketing number."],
      ["Reserve depth affects price impact", "For the same trade size and fee configuration, a deeper reserve pair generally moves less along the constant-product curve than a thinner pair. Relative order size matters: an amount that is small beside the reserves can have modest impact, while the same amount against shallow reserves can move the quoted average price sharply."],
      ["Depth is not a price or exit guarantee", "A displayed reserve does not promise that it will remain available until a transaction confirms. Earlier swaps, the full Founder Allocation sale, transaction ordering, fees, and integer rounding can change the execution-time result. Minimum output can reject an unacceptable result, but it cannot create inventory or a counterparty."],
      ["Successful Opening establishes initial depth", "When Opening succeeds, RugInstance initializes RugPool with token reserve x and WBNB reserve y. The WBNB side is creatorStake plus acceptedContribution; the token side is the non-Founder supply remaining after the proportional Opening allocation. These values are fixed by the immutable launch economics, not chosen later by an administrator."],
      ["Trades change reserve composition", "A canonical swap changes both stored reserves even when their product is nondecreasing after fees and rounding. A sequence of sells can reduce WBNB depth while increasing token inventory; buys do the opposite. Nonzero reserves do not imply a useful price for a large order."],
      ["The Founder sale consumes ordinary pool liquidity", "After unlock, rug() sells the entire protocol-held Founder Allocation once through RugPool. It is a token-for-WBNB swap, not a reserve withdrawal, but its size can create extreme price impact and sharply reduce the WBNB reserve. The call can also revert when its minimum-output or deadline constraint is not met."],
      ["No LP token or reserve-withdraw path exists", "RugPool issues no LP token and exposes no remove-liquidity or reserve-withdraw function. Successful Opening assets are not a Creator-redeemable LP position. This makes one withdrawal boundary inspectable; it does not stop market sales, alternative pools, key compromise, or loss."],
      ["Stored reserves and actual balances can differ", "RugPool quotes from getReserves(), not from arbitrary token balances. Direct RugToken or WBNB transfers remain surplus above stored reserves because the pool has no sync or skim function. Reconciliation must compare both stored reserves and actual balances instead of treating either number alone as canonical liquidity."],
      ["Alternative pools are separate liquidity", "Third parties can create external markets for a RugToken. Their contracts, reserve assets, fees, routing, LP controls, prices, and risks are independent of RugPool. External balances must not be combined with canonical reserves to imply protocol-controlled depth, price support, or safety."],
      ["Liquidity is not protocol safety", "Reserve depth does not guarantee contract correctness, fair ordering, stable price, RPC or frontend availability, wallet security, a buyer, an exit, or recovery. Founder selling, related wallets, slippage, MEV, alternative pools, phishing, key compromise, volatility, and total loss remain possible. Independent audit and organized mainnet activation remain pending."],
    ],
  },
  "/how-to-read-amm-reserves-on-bscscan": {
    eyebrow: "BscScan · RugPool reserve verification",
    title: "READ THE CONTRACT. THEN RECONCILE THE BALANCES.",
    intro: "A pool balance, a reserve value, and a social screenshot are not interchangeable evidence. Start from the exact canonical RugPool, read its stored reserves, compare token balances and events, and keep the limits of every observation visible.",
    sections: [
      ["Start on BNB Smart Chain with the exact RugInstance", "Confirm chain id 56 and obtain the RugInstance address from the canonical Factory record or a verified Rugspull URL. Do not begin from a ticker, token search result, unsolicited message, copied screenshot, or alternative-pool address. A matching name does not establish contract identity."],
      ["Derive the pool and token from RugInstance", "On the verified RugInstance Read Contract surface, read pool() and token(). A Failed Opening has neither address and therefore has no canonical AMM reserves to inspect. For an Active or Rugged instance, treat pool() as the canonical RugPool pointer and cross-check the token address before reading balances."],
      ["Verify the RugPool identity fields", "On the RugPool Read Contract surface, confirm token(), WBNB(), rugInstance(), protocolTreasury(), swapFeeBps(), protocolFeeBps(), and initialized(). The token and rugInstance values should point back to the same lifecycle record, and WBNB must match the canonical BNB Smart Chain WBNB address. A verified source match is evidence, not an independent audit."],
      ["Read getReserves in the documented order", "getReserves() returns reserveToken first and reserveQuote second. In RugPool, quote means WBNB. Both RugToken and WBNB use 18 decimals, so divide the raw integer by 10^18 only for human display; retain the exact integer for calculations and reconciliation."],
      ["Read actual token balances separately", "Call balanceOf(poolAddress) on the exact RugToken and canonical WBNB contracts. These ERC-20 balances answer how many units each contract currently holds; they do not replace RugPool's stored reserve variables, identify the canonical pool by themselves, or prove that the assets are withdrawable."],
      ["Reconcile reserves against balances", "After initialization and canonical swaps, project tests expect RugToken balance to equal reserveToken and WBNB balance to equal reserveQuote. Direct transfers can instead create positive surplus above stored reserves because RugPool has no sync or skim function. A balance surplus is not quoted liquidity, and any apparent shortfall or identity mismatch should stop promotion and trigger investigation."],
      ["Use Swap events as history, not live state", "Each successful canonical Swap records pool, sender, recipient, direction, amount in, amount out, protocol WBNB fee, and the two post-swap stored reserves. A reverted transaction commits no Swap event or reserve change. Events help reconstruct history, but the latest confirmed getReserves() and balances remain necessary for a current-state check."],
      ["A reserve ratio is not the execution quote", "reserveQuote divided by reserveToken is only a spot-like ratio. A real order changes both reserves, applies the deployed fees, and rounds integer output down. Estimate execution with the contract's amount-out arithmetic, then apply minimum output and deadline constraints; do not present a reserve ratio as a guaranteed price."],
      ["Keep alternative pools separate", "A RugToken is an ordinary ERC-20, so third parties can create other pools. Their pair addresses, reserve assets, routers, LP controls, fees, events, and balances are independent. Do not combine external liquidity with RugPool reserves or imply that an alternative market is canonical, protocol-controlled, locked, or endorsed."],
      ["Reserve verification is not a safety verdict", "Correct addresses and reconciled values do not guarantee contract correctness, reserve depth, stable price, fair ordering, transaction inclusion, MEV protection, wallet security, a buyer, an exit, or recovery. Founder selling, related wallets, slippage, alternative pools, phishing, key compromise, volatility, and total loss remain possible. Independent audit and organized mainnet activation remain pending."],
    ],
  },
  "/what-is-mev-on-bnb-chain": {
    eyebrow: "BNB Chain · MEV and transaction-ordering guide",
    title: "THE QUOTE IS A SNAPSHOT. THE CHAIN CHOOSES AN ORDER.",
    intro: "A swap estimate describes one current reserve state. Before a transaction executes, another confirmed transaction can change those reserves and therefore the output. Minimum output and deadlines bound what your call will accept; they do not guarantee ordering, inclusion, price, or protection from MEV.",
    sections: [
      ["MEV is an ordering risk, not a Rugspull feature", "MEV commonly describes value that can be extracted by choosing, observing, or reacting to transaction order. Rugspull does not expose a special MEV function, but its canonical AMM is stateful: earlier confirmed swaps change the reserves used by later swaps. A public transaction being submitted first does not prove it will execute first."],
      ["A quote ages as soon as state can change", "The interface estimates output from the current RugPool reserves and deployed fee parameters. That estimate is not reserved for the wallet. A buy, sell, full Founder Allocation sale, or other state-changing transaction confirmed before yours can make the estimate stale even when your calldata is unchanged."],
      ["Earlier swaps move the later execution curve", "A confirmed buy reduces token reserve and increases WBNB reserve; a confirmed sell does the opposite. The next amount-out calculation starts from the new pair. Thin reserves, a large order, and several nearby transactions can amplify the difference between the displayed estimate and eventual execution."],
      ["Minimum output is a rejection boundary", "RugPool reverts when calculated output is below the submitted minimum. A tighter minimum can reject more adverse state changes; a wider tolerance can permit a worse fill. Neither setting guarantees a fair price, blocks a sandwich pattern, prevents reordering, or creates reserve depth."],
      ["A deadline limits time, not position", "RugPool rejects a swap only when block.timestamp is later than its submitted deadline. The deadline does not reserve a block position, force prompt inclusion, guarantee that the transaction will be seen privately, or ensure that reserves remain unchanged until execution."],
      ["A revert is atomic but not costless", "If the deadline, minimum-output, allowance, balance, or caller checks fail, the swap does not commit token transfers, a Swap event, or reserve changes. The submitted transaction may still consume gas, and a revert does not restore a missed opportunity, recover another trade, or compensate the wallet."],
      ["AMM fees do not remove ordering risk", "RugPool's nominal fee changes the amount-out arithmetic and sends the protocol portion in WBNB, while the retained portion contributes to nondecreasing reserve product. Those mechanics do not encrypt pending intent, guarantee fair sequencing, stop competing transactions, or make a stale quote current."],
      ["The Founder sale shares the same execution boundary", "After unlock, rug() attempts one full sale of the protocol-held Founder Allocation through the canonical RugPool with minimum-output and deadline inputs. The sale is disclosed but voluntary and unscheduled. Transactions confirmed before it can change its output, and the sale can itself materially change reserves seen by later traders."],
      ["Alternative pools are separate ordering domains", "Third parties can create other markets for a RugToken. Their routers, reserves, fees, ordering, liquidity controls, and transaction paths are independent of RugPool. Cross-market activity can create additional price differences, but it must not be merged into a claim that the canonical route is protected, synchronized, or endorsed."],
      ["Verify the receipt and keep the limits visible", "Before signing, verify chain id 56, exact contracts, current reserves, estimated output, minimum output, deadline, and approvals. After confirmation, inspect status, calldata, transfers, Swap event, fees, and post-swap reserves. These checks improve evidence; they do not guarantee inclusion, ordering, liquidity, wallet security, a buyer, an exit, or recovery. Independent audit and organized mainnet activation remain pending; total loss remains possible."],
    ],
  },
  "/what-are-alternative-pools-on-bnb-chain": {
    eyebrow: "BNB Chain · canonical and alternative-pool guide",
    title: "ONE TOKEN CAN TRADE IN MANY POOLS. ONLY ONE IS CANONICAL.",
    intro: "RugToken is transferable, so third parties can create other markets for it. Those pools may quote different assets, use different contracts, and expose different liquidity controls. Rugspull identifies one internal RugPool as canonical; it does not make every pool equivalent or safe.",
    sections: [
      ["RugToken does not contain a pool allowlist", "RugToken exposes ordinary transfer, approve, and transferFrom behavior with a fixed supply and 18 decimals. It does not block transfers to external DEX pairs, routers, vaults, or wallets. That means a third party with tokens and another asset can create a separate market without making it part of Rugspull settlement."],
      ["Derive the canonical pool from RugInstance", "For an Active or Rugged lifecycle, read pool() and token() from the exact RugInstance created by the canonical Factory on chain id 56. The returned pool() address identifies Rugspull's internal canonical RugPool. A ticker, logo, search result, router path, or high-volume pair does not replace that contract link."],
      ["Alternative pools can use different contracts and quote assets", "An external market may be a PancakeSwap pair, another AMM, a concentrated-liquidity position, an order book, or a custom contract. It may pair RugToken with WBNB, a stablecoin, another token, or a routed basket. Its factory, router, pair ABI, fee schedule, hooks, and settlement rules are independent of RugPool."],
      ["Every pool has separate reserves and prices", "RugPool stores its own RugToken and WBNB reserves and quotes only from that pair. An external pool maintains different balances and state. A trade in one pool does not directly rewrite the other pool's reserves, and a price shown for one venue must not be presented as the canonical pool price or combined into canonical liquidity."],
      ["Routing and slippage protections do not transfer between pools", "The official Rugspull interface reads RugPool and calls its swap functions directly with RugPool minimum-output and deadline parameters. An external router can choose another path, fee, recipient flow, approval spender, or slippage model. Approval for RugPool does not authorize an alternative router, and protection on one route does not bind another."],
      ["Liquidity control claims must stay pool-specific", "RugPool issues no LP token and exposes no remove-liquidity, reserve-withdraw, skim, or sync function. An alternative pool may issue LP positions or expose withdrawal, fee-collection, administration, upgrade, or emergency controls to other parties. RugPool's no-reserve-withdraw boundary must never be copied into a claim about external liquidity."],
      ["The same token identity does not authenticate the venue", "A real RugToken address can appear inside a malicious or misleading pool, and an unrelated token can copy the same name or symbol. Verify chain id, RugInstance, RugToken, pool, quote asset, factory, router, and spender addresses before reading a quote or signing. Token authenticity alone does not certify the pool or its operators."],
      ["Aggregators can blur the boundary", "Wallets, explorers, terminals, and aggregators may surface the deepest, newest, or algorithmically preferred market rather than RugPool. Rugspull cannot guarantee that every third party labels canonical and alternative venues correctly. Integrators should keep contract addresses, source factories, reserve series, fees, volume, and risk labels separate."],
      ["Cross-market trading can connect prices without synchronizing state", "Traders or bots may respond to price differences by buying in one market and selling in another. Those transactions can move each venue toward a different relationship, but there is no protocol oracle or automatic reserve synchronization between them. Ordering, gas, fees, depth, failed execution, and MEV can prevent or change the apparent opportunity."],
      ["More venues do not guarantee an exit", "An additional pool can fragment liquidity, expose new approvals and operators, or disappear when its own liquidity is removed. Before using any venue, inspect its exact contracts, reserves, LP or admin controls, quote asset, route, allowance, minimum output, deadline, and confirmed receipt. Multiple pools do not guarantee price, depth, fair ordering, transaction success, a buyer, an exit, recovery, or safety. Independent audit and organized mainnet activation remain pending; total loss remains possible."],
    ],
  },
  "/what-are-smart-contract-invariants": {
    eyebrow: "Builder desk · Foundry invariant testing",
    title: "A PROPERTY THAT SURVIVES MANY CALLS IS EVIDENCE. NOT PROOF OF SAFETY.",
    intro: "An invariant is a property expected to remain true across many reachable sequences of contract actions. Rugspull's Foundry state machine probes seven such properties; that repeatable evidence is useful, but it is neither exhaustive proof nor an independent audit.",
    sections: [
      ["An invariant checks sequences, not one example", "A unit test usually prepares one path and checks one result. An invariant harness repeatedly chooses among contribute, end Opening, finalize, claim, refund, failed-stake withdrawal, end Founder lock, buy, sell, rug, double-claim probe, and double-rug probe. After each evolving sequence, the invariant property must still hold."],
      ["The published configuration is reproducible and bounded", "The current foundry.toml sets 128 runs, depth 64, fail_on_revert true, and metrics output. That gives 8,192 handler calls per invariant property across 12 targeted selectors in the reported run. Seeds, bounds, preconditions, mock actors, time warps, and the exact repository revision define the explored state space; 8,192 calls are not every possible call sequence."],
      ["WBNB must remain conserved inside the modeled system", "invariant_WbnbIsConserved sums WBNB held by RugInstance, RugPool when created, Creator, treasury, handler, and three modeled actors, then compares the result with MockWBNB totalSupply. This detects modeled WBNB appearing or disappearing, but it assumes the harness includes every relevant holder and uses the test token rather than production WBNB."],
      ["RugToken supply stays accounted and Founder Tokens avoid the Creator", "invariant_TokenIsConservedAndFounderNeverMovesToCreator sums token balances across RugInstance, RugPool, Creator, treasury, handler, and actors, then compares them with totalSupply. It separately requires the Creator's modeled token balance to remain zero. This checks the protocol-held Founder Allocation path, not related-wallet identity or arbitrary tokens acquired elsewhere."],
      ["Canonical swap reserves must equal actual balances", "invariant_CanonicalSwapsKeepReservesEqualToBalances compares RugPool's stored reserveToken and reserveQuote with the pool's actual RugToken and WBNB balances after modeled canonical actions. The harness does not target arbitrary direct token donations; RugPool intentionally has no sync or skim, so outside transfers can create surplus above stored reserves without changing canonical quotes."],
      ["Economic allocations must reconcile across lifecycle states", "invariant_EconomicAllocationsRemainConsistent checks the relationship among founderRemaining, Opening token allocation, pool token reserve, and total supply while Active or Rugged. It expects the full 45% Founder Allocation before the one-shot sale and zero afterward. The assertion is tied to this harness's immutable 1,000,000-token supply and 45% configuration."],
      ["Observed protocol fees must accrue only to the treasury", "invariant_ProtocolFeesOnlyAccrueToTreasury compares the treasury's modeled WBNB balance with fees observed around buys, sells, and the Founder sale. It catches an unexpected fee destination in those targeted actions; it does not independently validate every possible integration, external transfer, treasury key practice, or the economic desirability of the fee schedule."],
      ["Lifecycle status and reserve product must not move backward", "invariant_StatusAndConstantProductNeverDecrease records lifecycle status and the canonical reserve product k after modeled actions, then rejects any decrease. Nondecreasing k reflects fee and rounding behavior in the tested swap paths. It does not mean token price, WBNB depth, user value, or available exit liquidity cannot fall sharply."],
      ["Claims and the Founder sale must not execute twice", "invariant_ClaimsAndRugCannotExecuteTwice deliberately retries an already completed claim and an already completed rug, then requires both low-level calls to fail. This is evidence for the one-shot guards reached by the harness; it does not prove every replay, reentrancy, authorization, or cross-contract scenario has been exhaustively explored."],
      ["Passing invariants are a review input, not a verdict", "These seven project-authored properties can expose regressions and make economic assumptions concrete. They can still miss a wrong specification, omitted actor, missing selector, unrealistic mock, compiler or deployment difference, liveness failure, integration behavior, or unimagined attack. Review the exact commit, contracts, harness, configuration, unit/fuzz/scenario tests, deployed bytecode, and independent audit scope. Independent audit and organized mainnet activation remain pending; total loss remains possible."],
    ],
  },
  "/verified-source-code-does-not-mean-audited": {
    eyebrow: "BNB Chain · source-verification and audit boundary",
    title: "MATCHED BYTECODE IS EVIDENCE. IT IS NOT AN AUDIT.",
    intro: "Explorer source verification helps connect published Solidity to deployed bytecode under specific compiler settings. It does not mean an independent reviewer assessed the design, economics, configuration, integrations, operating controls, or every reachable failure mode.",
    sections: [
      ["Source verification answers an identity question", "A successful exact or full match supports the claim that submitted source, compiler version, optimizer settings, metadata, and constructor inputs reproduce the deployed bytecode under the verifier's method. It makes code inspection easier. It does not state that the code is correct, safe, complete, or suitable for a user's purpose."],
      ["Compiler settings and constructor inputs are part of the evidence", "Compare the exact compiler release, optimizer status and runs, EVM target, linked libraries, metadata treatment, and constructor arguments. A familiar source file compiled or initialized differently can produce materially different behavior. Read the deployed address and configuration, not a repository file in isolation."],
      ["Readable code can still contain dangerous behavior", "Verification does not test access control, arithmetic, state transitions, token behavior, reentrancy boundaries, denial of service, economic manipulation, rounding, liveness, or integration assumptions. A harmful or flawed contract can be perfectly verified because verification checks correspondence, not quality."],
      ["Configuration can be as important as the Solidity", "Inspect owners, treasuries, quote assets, fee parameters, timing, limits, linked contract addresses, pause scope, and immutable values. Correct source with an unexpected owner or destination remains an unexpected deployment. Labels, project names, and explorer badges are not substitutes for reading the actual values."],
      ["Review the whole contract system", "Rugspull settlement spans RugFactory, RugInstance, RugToken, RugPool, and canonical WBNB. Reviewing only one verified address can miss authorization and asset flows across the others. Derive child addresses from the canonical Factory and instance records, then follow transfers, calls, events, and stored state across the complete path."],
      ["No proxy does not mean no risk", "The Rugspull MVP deliberately has no upgradeable proxy, so implementation-slot and upgrade-admin checks are not part of its deployed design. That narrows one class of review; it does not validate the immutable economics, remove owner or treasury risk, prove reserve accounting, or prevent losses from ordinary contract behavior."],
      ["Project-authored tests are evidence, not independence", "Unit, fuzz, invariant, and scenario tests can demonstrate specified properties on a stated revision. They remain written and selected by the project unless an independent party owns the review. Passing tests do not prove exhaustive state coverage, eliminate specification mistakes, or transform source verification into an audit."],
      ["An audit needs a named scope and revision", "A meaningful audit claim should identify the independent firm or reviewer, exact commit or bytecode, contracts and dependencies in scope, methodology, dates, findings, severity treatment, remediation status, and any excluded assumptions. A logo, scanner score, informal comment, automated bot result, or audit of a different revision is not equivalent."],
      ["Rugspull's current evidence keeps the boundary explicit", "The project publishes Solidity, deployed identities, exact-match verification evidence, Foundry tests, mechanism guides, and open counterexample requests. Independent audit remains pending, and organized new mainnet activation remains NO-GO. None of the public source, tests, directory submissions, automated comments, or chain readbacks is promoted as an audit or safety finding."],
      ["Use verification as the start of review", "Confirm chain id 56 and the full address, reproduce or inspect the verified build, read constructor and immutable values, map privileged roles, trace assets and events, compare the deployed revision with tests and documentation, and look for an independently scoped audit. These checks improve evidence; they do not guarantee contract correctness, liquidity, fair ordering, wallet security, an exit, recovery, or safety. Total loss remains possible."],
    ],
  },
  "/why-d1-is-not-financial-truth": {
    eyebrow: "Builder desk · chain and cache boundary",
    title: "THE DATABASE REMEMBERS. THE CONTRACT DECIDES.",
    intro: "Rugspull uses Cloudflare D1 to make discovery, lifecycle history, and event-derived market data easier to read. D1 is an indexed copy that can lag, omit, or be rebuilt. It never authorizes a transfer, settles a claim, or replaces current BNB Smart Chain state.",
    sections: [
      ["Financial truth lives in contract state and confirmed execution", "For a specific action, use the exact chain id, deployed contract addresses, current view calls, submitted calldata, transaction status, logs, and token balance changes. A database row or API response can help locate those objects, but it cannot make a reverted transaction succeed, change a contract balance, or create an entitlement."],
      ["D1 is a discovery and index replica", "The Worker stores Factory-derived Rug records, lifecycle events, canonical Swap history, market aggregates, block timestamps, and indexer checkpoints in D1. Those rows are optimized for lists, charts, account discovery, and review. They are not a second ledger and are not consulted by Solidity during settlement."],
      ["A scheduled indexer can be behind the chain", "The production indexer runs on a schedule and depends on RPC responses. Newly confirmed events may exist on BNB Smart Chain before the corresponding D1 row appears. The public indexer status reports latest block, per-source sync checkpoints, a stale-block threshold, and warnings; an empty warning list is an operational observation, not a finality or completeness guarantee."],
      ["A cached lifecycle label must be checked on-chain", "Opening, Failed, Active, and Rugged rows are derived from contract reads and matching events. Before contributing, finalizing, claiming, refunding, trading, or executing the Founder sale, read the current RugInstance and RugPool state. A stale interface label cannot extend a deadline, reopen a status, restore Founder Tokens, or override a contract revert."],
      ["Market charts are historical reconstructions, not quotes", "D1 market endpoints reconstruct price, WBNB volume, reserves, protocol fees, and the Founder-sale marker from indexed LaunchSucceeded, Swap, and RugPulled evidence. Missing or delayed events can make a series incomplete. Transaction controls therefore read current RugPool reserves and calculate minimum output separately; a chart point is never a guaranteed execution price."],
      ["Fallback registration still starts from chain evidence", "When broad historical log access is unavailable, a newly created Rug can be registered from its mined creation transaction receipt plus contract reads. Client-supplied block numbers are not accepted as truth. That verification improves cache integrity, but the resulting row remains a derivative record rather than settlement authority."],
      ["The API cannot sign or settle user actions", "Rugspull's public Read API exposes GET-only discovery data. There is no API operation that creates, contributes, buys, sells, rugs, claims, refunds, approves, or signs on behalf of a wallet. User wallets call the deployed contracts directly, and neither a Worker response nor a D1 write can authorize those calls."],
      ["A D1 outage does not move on-chain funds", "If D1 is stale, unavailable, cleared, or rebuilt, the BNB Smart Chain contracts retain their balances, ownership, lifecycle state, contribution records, claim flags, Founder Allocation, and canonical reserves. The interface may lose convenient discovery or charts, so users should fall back to exact addresses and direct chain reads rather than infer that assets disappeared or settlement changed."],
      ["Rebuilding depends on retained chain evidence and RPC capability", "The cache is designed to be replayed from configured Factory sources, child contracts, events, and view calls. A provider that cannot serve required historical logs can limit reconstruction and should produce an explicit operational warning or fallback path. Rebuildable means the database is disposable relative to chain evidence; it does not promise every provider preserves every historical query forever."],
      ["Verify source, freshness, and scope before relying on a response", "Check chain id, current Factory, full Rug address, source Factory, indexed block, indexer warnings, and the exact endpoint fields. Then reconcile any action-sensitive value against current contract state and the confirmed receipt. These checks improve observability; they do not guarantee RPC uptime, index completeness, contract correctness, price, liquidity, fair ordering, an exit, recovery, or safety. Independent audit and organized mainnet activation remain pending; total loss remains possible."],
    ],
  },
  "/testnet-lifecycle": {
    eyebrow: "TESTNET lifecycle archive",
    title: "TWO PATHS. ZERO MAINNET CLAIMS.",
    intro: "This controlled BSC Testnet E2E demonstrates Failed and Rugged outcomes. It is test evidence—not mainnet activity, users, volume, adoption, an audit, or a safety finding.",
    sections: [
      ["TESTNET ONLY · chain id 97", "The demo Factory uses a 90-second Opening and 90-second founder-lock delay so the complete flow can be tested. Production uses a 24-hour Opening and a further 48-hour lock; never substitute these demo timings for mainnet rules."],
      ["Factory record", "Short-duration E2E Factory 0x8e6ba49e54F7bDa1a5499D143395116d3430ae3c · deployment block 118840328 · deployment tx 0xec595840f04888cd94023a033e4cd57c59df9e119fab59d4e0d3a8925ad7178b."],
      ["Failed path", "Rug 0xeD8F823839a115B26cA126C0b41a61eC38b606bd finalized Failed with 0.001 WBNB contributed against a 0.003 WBNB minimum. No token or pool exists; the recorded contributor claimed the refund and creatorStakeWithdrawn is true."],
      ["Rugged path", "Rug 0xF8f2BC14FbB238D2AB7EAf0Eb548FA27D7e2ac7c finalized successfully, the recorded contributor claimed, the full protocol-held Founder Allocation exited once, founderRemaining is zero, and canonical trading continued after Rugged."],
      ["Reserve reconciliation", "Pool 0xFBb80c25Fc5Bb3E9e60949ce72Ffa9493513fE62 records 826961130829643363640339 token units and 7253391206162222 WBNB wei. Both reserves equal the pool's actual balances exactly in the 2026-07-17 read-only RPC check."],
      ["Evidence boundary", "Current contract state and balances were reverified through read-only RPC. Historical lifecycle transaction hashes other than the Factory deployment were not recovered from retained broadcasts or available archive endpoints, so this is not described as a complete transaction-receipt packet. Sourcify exact match is not an independent audit."],
    ],
  },
  "/office-counter": {
    eyebrow: "Office Counter · report 009",
    title: "EVIDENCE, NOT GROWTH THEATER.",
    intro: "A dated public snapshot of what is deployed, what was tested, what was published, and what remains unresolved. Counts below use a 2026-07-19 19:32 CST cutoff and are not live analytics.",
    sections: [
      ["Mainnet chain record", "BNB Smart Chain mainnet · chain id 56 · Factory 0xDFF540baBCa2ee8A2A8Ff26359Ecc9c5921D8A63. The production index returned zero current-Factory Rugs at the report cutoff. This is a dated observation, not a promise that the count remains zero."],
      ["Contract test record", "Foundry reran 41 tests across unit, fuzz, invariant, and scenario families on 2026-07-17: 41 passed and zero failed. Passing project-authored tests are evidence, not an independent audit or safety finding."],
      ["Lifecycle evidence", "Two controlled BSC Testnet paths are published: Failed with contributor refund and creator-stake withdrawal, and Rugged with contributor claim, one founder exit, post-rug trading, and reserve reconciliation. They are not mainnet users, volume, adoption, or complete historical receipts."],
      ["Public evidence inventory", "37 evergreen mechanism, security, API-reference, education, WBNB, token-approval, slippage, constant-product AMM, liquidity, BscScan reserve-verification, MEV, alternative-pool, verified-source/audit-boundary, D1/financial-truth, Opening, Creator-stake, contribution-identity, cancellation, excess-refund, permissionless-finalization, successful-claim, Failed-refund, Founder-sale, Still-Waiting, post-Rugged trading, lifecycle-template, Creator-readback, community-safety, and gate-review pages plus the TESTNET lifecycle archive and this dated Office Counter make 39 trust-first evidence routes public. The sitemap contains 42 URLs. Google Search Console accepted the refreshed sitemap on 2026-07-19 and its aggregate row reports 42 discovered pages with 0 videos. URL Inspection classified the new alternative-pool guide as not indexed because Google could not recognize the URL, detected no referring sitemap or referring page, recorded no last crawl, and accepted a priority indexing request. The overview reports 0 web-search clicks. Discovery and notification requests do not prove indexing, ranking, clicks, visits, or use."],
      ["Distribution record", "Four verified X URLs and final Telegram correction post 9 are recorded in the execution log. Post 9 contains three publicly verified HTTPS links and was verified as the current pinned message in the logged-in desktop channel on 2026-07-17. Earlier Telegram posts 5 and 7 have malformed links and post 6 is title-only; they remain visible and are not counted as successful linked content. X account recovery is complete and the next approved item remains time-gated."],
      ["Review and directory state", "DappBay's latest owner-side My Project route rendered Page Not Found, its submit page requested a fresh wallet connection, and its public search returned No related dApps or campaigns; the earlier Security Reviewing state is not promoted to a current result. RootData's prior dashboard session expired, so its last authenticated Pending Review state was not promoted either. DappRadar's official submit link and Developers route redirect to its homepage, which exposes no submit entry. Focused public searches found no Rugspull detail page on those services, MathWallet, Magic Store, or Moralis Web3 Wiki. BNB Chain Awesome PR #13 and Electric Capital PR #2932 remain open and clean. GitHub Issue 1 now has five project-authored review comments and no external response. None of these states is an audit, listing approval, independent review, recommendation, partnership, or BNB Chain endorsement."],
      ["Deployment continuity record", "A prior README-only GitHub push exposed source drift and temporarily caused sampled edges to disagree. The deployment source was synchronized, and subsequent GitHub-triggered deployments restored consistent public assets. The current production sitemap serves 42 unique URLs, and the alternative-pool guide from commit a8c0d22 renders with its canonical metadata, ten evidence steps, and risk boundaries. This is a dated recovery and deployment observation, not an uptime SLA or future-availability promise."],
      ["Machine-readable discovery", "Mirrored root and well-known security.txt files, llms.txt, a ten-item RSS evidence feed, homepage RSS discovery, the IndexNow key, and a source-controlled IndexNow submission command are public. The feed and llms.txt link the WBNB, token-approval, slippage, constant-product AMM, liquidity, reserve-verification, MEV, alternative-pool, verified-source/audit-boundary, and D1/financial-truth guides directly. IndexNow accepted 53 URLs: 42 sitemap URLs plus 11 machine-readable resources. Security contact, pending independent audit, total loss, organized-mainnet NO-GO, and no-inferred-endorsement boundaries are explicit. Publication and successful notification do not prove crawl, subscription, AI ingestion, response, indexing, or readership."],
      ["Measurement boundary", "No production behavior beacon, visitor/session identifier, advertising pixel, or wallet-profile tracker is deployed. 16 approved UTM links describe distribution intent only; they do not prove visits, qualified sessions, conversions, consent, people, or correct publication."],
      ["Open activation gates", "Independent audit, written jurisdiction review, two SLA-backed production RPC providers, multisig custody, moderation, a named backup incident contact, staffed incident response, and an authenticated project outbound-email sender remain unresolved. Organized new mainnet activity is not being requested."],
      ["Incident line", "No real security incident was created for promotion. A fake-Factory/fake-support tabletop prepared holding copy by simulated T+22. X recovery, real two-channel publication, and final Telegram pin verification are complete; backup staffing, inbound support-email timing, and two-channel incident timing remain open."],
    ],
  },
  "/lifecycle-templates": {
    eyebrow: "Public records toolkit · v1.0.0",
    title: "FIVE STATES. NO INVENTED STORY.",
    intro: "Reusable Permit, Failed, Active, Still Waiting, and Rugged templates turn verified chain state into public records. A blank template is not evidence, approval, an audit, or a request to transact.",
    sections: [
      ["01 · Rug Permit / Opening", "Use only while status is Opening. Record the creation receipt, full addresses, metadata hash, stake, fee, contribution minimum and cap, Opening times, 45% Founder Allocation, and unlock calculation. Say that no Failed or Active result exists yet."],
      ["02 · Failed Opening Receipt", "Use only after Failed finalization. No Token or Pool is created. Report eligible, claimed, and outstanding contributor refunds separately from eligible, withdrawn, and outstanding Creator stake. The creation fee is not refunded."],
      ["03 · Active Opening Receipt", "Use only after Active finalization. Publish Token and Pool addresses, accepted contribution, claim progress, founder remaining and unlock, plus canonical reserves reconciled to actual balances at a named cutoff. Active does not mean every claim is complete."],
      ["04 · Still Waiting", "Use only when status remains Active after unlock. State a UTC and block cutoff, founder remaining, RPC checks, and that no Rugged event was observed by that cutoff. The cutoff is not a protocol deadline or a promise about future Creator behavior."],
      ["05 · Rugged / Autopsy", "Use only after verifying the rug() receipt and Rugged event. Report Founder Tokens sold, Creator WBNB received, fee, founder remaining, reserve reconciliation, post-rug trading evidence if any, and outstanding contributor claims. Rugged creates no refund right."],
      ["Publication boundary", "Every completed artifact must label MAINNET or TESTNET, disclose project/Creator relationships and stake source, publish full identifiers and raw amounts, separate eligible/claimed/outstanding values, and link Risk and source. Tests and TESTNET evidence are not an independent audit. Total loss remains possible."],
    ],
  },
  "/creator-handbook": {
    eyebrow: "Creator desk · TESTNET first",
    title: "READ IT BACK BEFORE YOU HOST IT.",
    intro: "A public mechanism, disclosure, and incident checklist for Creator interviews. It is not an invitation to create, fund, trade, promote, or execute a mainnet Rug. Organized mainnet Creator activity remains NO-GO until every activation gate has written evidence.",
    sections: [
      ["01 · Ten-point readback", "Explain stake and the non-refundable fee; 24-hour batch Opening; related-wallet limits; Failed claims; 45% protocol custody and 48-hour lock; optional one-shot rug(); founder sale versus reserve withdrawal; no Rugged refund; ordinary associated-wallet tokens; and why tests or TESTNET are not an audit."],
      ["02 · Thirty-minute TESTNET walkthrough", "Inspect identity and scope, Opening economics, Failed, Active, and Rugged evidence, then finish with an unprompted red-team readback of MEV, related-wallet, alternative-pool, key, and total-loss risk. No stake or gas reimbursement is offered."],
      ["03 · Qualification", "Score mechanism comprehension 25%, historical credibility 20%, original communication 20%, audience fit 15%, operational response 10%, and brand safety 10%. Below 70/100 is not qualified for organized mainnet collaboration; serious fraud or hidden compensation is an automatic stop."],
      ["04 · Communication boundary", "Use Read, Inspect, Review, Verify, and Critique calls to action. Do not use return, urgency, price, safety, audit, endorsement, reward, trading, or execute-rug incentives. Every project post labels MAINNET or TESTNET and links Risk."],
      ["05 · Relationship and compensation", "Publish the full Creator wallet, controller, stake source, Rugspull role, and all benefits. Rugspull provides no stake, gas, Founder Tokens, paid posts, guaranteed reposts, referral fees, market making, fake activity, custody, or backend financial actions."],
      ["06 · Metadata and identity", "Reject impersonation, unlicensed assets, fake badges, promises, and uncontrolled links. Verify name, symbol, image rights, description, official domains, metadata URI, and full hash before public announcement; immutable metadata cannot be silently corrected."],
      ["07 · State communications", "Publish only the state that exists. Failed separates refunds and Creator withdrawal. Active includes claims, founder remaining, unlock, and reserves. Still Waiting uses a cutoff, not a deadline. Rugged verifies the sale, remaining claims, and balances; it is not a liquidity pull or refund."],
      ["08 · Stop and correct", "If an address, link, state, or security claim is wrong: stop amplification, preserve evidence, publish a factual correction, repair every derivative, and resume only when the canonical source and queue agree. Official support never asks for keys, remote access, or direct transfers."],
      ["09 · Mainnet remains gated", "Handbook comprehension is necessary but never sufficient. Independent audit, written legal/geographic review, two SLA-backed RPC providers, degradation drills, moderation and incident staffing, privacy-approved analytics, relationship disclosure, and zero unresolved P0/P1 remain required."],
    ],
  },
  "/community-safety": {
    eyebrow: "Community safety desk · rules v1.0",
    title: "CRITICISM STAYS. SCAMS GO.",
    intro: "Public rules for Rugspull channels and project-controlled surfaces. Publishing these rules does not create 24/7 moderation, an incident response SLA, an audit, safety, or BNB Chain endorsement.",
    sections: [
      ["01 · Criticism is allowed", "Negative reviews, mechanism criticism, loss reports, competing analysis, and uncomfortable questions remain visible unless they also contain scams, targeted harassment, exposed secrets, or unlawful material. Disagreement with Rugspull is not a moderation violation."],
      ["02 · No fake support or impersonation", "Do not impersonate Rugspull, a Creator, BNB Chain, an auditor, or community support. Official support never asks for a seed phrase, private key, remote access, direct transfer, or a wallet connection through a support message."],
      ["03 · No price or engagement manipulation", "Price targets, pump coordination, paid calls, referral trading, fake testimonials, invented holders or volume, and coordinated fake comments are prohibited on project-controlled surfaces. Rugspull does not manufacture adoption evidence."],
      ["04 · Address and link discipline", "Treat rugspull.com, the full production Factory address, and the public source repository as canonical references. A wrong address, malicious link, chain mismatch, or altered risk page triggers stop amplification, evidence preservation, and a factual correction before promotion resumes."],
      ["05 · Malicious and unlawful content", "Phishing, malware, hateful or targeted harassment, impersonation, unlawful metadata, and exposed credentials may be removed and reported. Removing discovery content does not edit deployed contracts, reverse transactions, refund losses, or otherwise change on-chain settlement."],
      ["06 · Evidence before enforcement claims", "Preserve the timestamp, URL, account, screenshot, transaction or address, and available hashes before describing an incident. Clearly distinguish what was observed, what is alleged, and what has been confirmed."],
      ["07 · Stop-amplification triggers", "Pause project promotion and Creator outreach for an unresolved P0/P1 issue, wrong address, chain or page mismatch, compromised official channel, unavailable risk disclosure, or unresolved geographic or legal notice. User-signed claim and refund paths remain governed by the contracts."],
      ["08 · Coverage boundary", "Telegram is currently an announcement-only channel in public preview; X and GitHub provide public critique surfaces. Primary and backup moderation owners remain unassigned. There is no 24/7 moderation promise, guaranteed response time, or incident SLA."],
      ["09 · Report route", "Send a factual report to info@rugspull.com without secrets, seed phrases, private keys, or unnecessary personal data. One Google Forms receipt addressed to this project inbox was observed on 2026-07-17. That proves one inbound delivery, not delivery latency, an outbound project sender, DMARC/DKIM alignment, response timing, retention, staffed ownership, or an SLA."],
    ],
  },
  "/stage-0-review": {
    eyebrow: "Day 7 gate review · 2026-07-17",
    title: "HOLD MEANS HOLD.",
    intro: "Stage 0 is not complete. This dated review separates verified groundwork from external actions that have not happened and keeps organized mainnet promotion at NO-GO.",
    sections: [
      ["Overall result · HOLD", "Six Stage 0 Must requirements were reviewed against public pages, repository records, production state, and channel evidence. Claims guidance, measurement specifications, and a publicly verified and pinned Telegram correction exist, but final Telegram profile and permission checks, outreach results, and staffed incident readiness do not."],
      ["Verified groundwork", "The canonical identity pack, approved-claims boundaries, prohibited language, risk tail, Creator/media fact sheet, 16 UTM-intent links, five lifecycle templates, Creator Handbook, public Community Safety rules, incident templates, and TESTNET lifecycle evidence are published or versioned. The rules publish criticism, impersonation, phishing, correction, and stop-amplification boundaries; they do not prove staffed moderation or an SLA. GitHub Issue 1 is pinned as a public mechanism-critique thread with a reproducible evidence index; this project-opened thread is critique infrastructure, not an independent review or outreach result. X account recovery is complete and the reviewed boundary post is public. The verified BNB Chain Discord server has been joined, but its member-screening/role step still blocks submit-project. Prepared assets and joined channels are not review, endorsement, or distribution results."],
      ["Telegram · PARTIAL", "Final correction post 9 is public, all three exact HTTPS links passed public verification, and the logged-in desktop channel showed it as the current pinned message on 2026-07-17. Older posts 5 and 7 have malformed links and post 6 is title-only; none is counted as successful linked content. The public channel preview exposes no reply or comment controls, but administrator permission configuration remains unverified. The avatar remains the letter R and the approved public description is not yet applied."],
      ["Creator / Builder outreach · INCOMPLETE", "The research queue contains 15 targets and five sendable one-to-one critique drafts. At this cutoff the result remains 0 sent and 0 booked. The project-opened public GitHub Issue 1 does not count as a one-to-one invitation or booked review. Research and drafts are not interviews, consent, independent review, endorsement, or adoption."],
      ["Incident path · PARTIAL", "A fake-Factory/fake-support tabletop produced holding copy at simulated T+22. X recovery and Telegram final pin verification are complete. A later four-host public RPC check had one 3-of-4 run with a transient HTTP 429, followed by one 4-of-4 matching run; this is not provider independence, SLA, archive, degradation, claim/refund, or future-availability proof. Authoritative DNS shows three Cloudflare Email Routing MX records and SPF softfail, but no DMARC TXT record. One Google Forms receipt addressed to info@rugspull.com reached the monitored inbox on 2026-07-17. Delivery latency, authenticated project outbound email, response timing, DKIM alignment, primary and backup staffing, and real incident publication time remain unproven."],
      ["Measurement · SPECIFIED, DISABLED", "Analytics governance v0.1 aligns 14 event names with the strategy and keeps all 12 activation gates false. Risk, contract/source proof, wallet, create, and claim/refund transaction-lifecycle events are specified with bot, internal, QA, and controlled-wallet separation. No production behavior beacon, visitor identifier, wallet profiler, or analytics write endpoint is deployed while privacy, legal, geographic, retention, deletion, ownership, and abuse controls remain open."],
      ["Mainnet activation · NO-GO", "Geographic matrix v0.1 now makes the default explicit: every market remains NO-GO, the website is publicly reachable without market approval, geoblocking and sanctions screening are not evidenced, and every legal owner and opinion date is unassigned. Independent audit, written legal review, two SLA-backed production RPC providers, moderation, named incident staffing and backup, privacy-approved analytics, and complete relationship controls are also not all evidenced. TESTNET, source inspection, risk education, corrections, and read-only reporting may continue."],
      ["What changes the result", "Complete BNB Chain Discord member screening and send the reviewed one-time cooperation request; set and verify the approved Telegram avatar, public description, and announcement-only permissions; record three eligible one-to-one critique invitations and an actual booking outcome; assign the operating roles; test inbound response timing and configure authenticated project outbound email; repeat the incident drill with two independent RPCs and two usable channels; satisfy every remaining activation gate in writing."],
    ],
  },
  "/founder-allocation-explained": {
    eyebrow: "Founder allocation register",
    title: "45% HELD BY THE PROTOCOL. ONE EXIT.",
    intro: "Rugspull's Founder Allocation is deliberately large and dangerous. Its custody and exit rules are fixed so the specific risk can be inspected before anyone participates.",
    sections: [
      ["Where the 45% sits", "The Founder Allocation is held by RugInstance, not transferred to the creator wallet. It remains there through the 24-hour Opening and the additional 48-hour post-Opening lock."],
      ["The contract-defined exit", "After unlock, the creator may call rug() once. That call sells the entire remaining protocol-held Founder Allocation into the canonical RugPool. The creator cannot use rug() for a partial sale."],
      ["What the creator receives", "The swap sends the resulting WBNB to the creator after the canonical trade fee. Price impact can be extreme because the full protocol-held allocation enters the pool in one transaction."],
      ["What does not happen", "The creator does not redeem an LP position or withdraw pool reserves. RugPool has no reserve-withdraw function and issues no LP token. The pool remains available for trading after Rugged."],
      ["The rule is not identity control", "The one-shot restriction applies only to the Founder Allocation held by RugInstance. Creator-controlled or associated wallets can still acquire ordinary RugToken and trade it like other holders; the protocol cannot reliably identify related wallets."],
      ["The rule is not safety", "A disclosed lock and one-shot sale do not prevent total loss, MEV, slippage, alternative pools, key compromise, misleading promotion, or off-chain abandonment. Inspect the deployed contracts and risk disclosure, not just this explanation."],
    ],
  },
  "/how-to-check-a-smart-contract-on-bscscan": {
    eyebrow: "Public inspection checklist",
    title: "CHECK THE CONTRACT. THEN CHECK THE CLAIMS.",
    intro: "BscScan can expose deployed code, transactions, balances, and events on BNB Smart Chain. It helps you inspect evidence; it does not certify that a contract, team, or market is safe.",
    sections: [
      ["01 · Confirm chain and address", "Start from an official project source, then independently confirm the BNB Smart Chain address. Lookalike names and copied interfaces can point to unrelated contracts. Compare the full address, not only its first and last characters."],
      ["02 · Read source status precisely", "Source Code Verified means published source compiles to the deployed bytecode under the recorded settings. Exact match is stronger evidence than a partial match, but neither status is an independent security audit or an endorsement."],
      ["03 · Inspect constructor and immutables", "Check the constructor arguments, linked libraries, owner, treasury, quote asset, fee profile, and deployment transaction. A readable contract can still be configured with dangerous destinations or privileges."],
      ["04 · Search privileged paths", "Look for minting, pausing, blacklisting, fee changes, ownership transfer, upgrades, reserve withdrawal, emergency withdrawal, arbitrary calls, and token-recovery functions. Then trace which address can call each path."],
      ["05 · Follow assets and events", "Use token transfers, internal transactions, event logs, contract balances, and pool reserves to verify what actually moved. Labels and dashboard summaries are conveniences, not financial truth."],
      ["06 · Check what code cannot prove", "Verified code cannot prove honest operators, uncompromised keys, accurate social claims, legitimate related wallets, safe alternative pools, adequate liquidity, or future price. Treat missing evidence and unexplained control as risk, not as a puzzle to rationalize away."],
    ],
  },
  "/crypto-rug-pull-red-flags": {
    eyebrow: "Risk-signal field guide",
    title: "RED FLAGS ARE QUESTIONS, NOT A SAFETY SCORE.",
    intro: "No checklist can prove that a token is safe. Risk signals are prompts to inspect permissions, assets, identities, and claims before deciding whether the remaining uncertainty is acceptable.",
    sections: [
      ["Hidden or flexible token controls", "Unexplained minting, transfer restrictions, blacklists, adjustable taxes, privileged routers, upgrade paths, or arbitrary calls can change who is able to buy, sell, or move value."],
      ["Liquidity nobody can explain", "Identify the actual pool, reserve assets, LP ownership or withdrawal path, lock terms, and alternative pools. A token lock is not a liquidity lock, and a liquidity lock does not prevent insider selling."],
      ["Concentrated or obscured inventory", "Large balances, related-wallet clusters, fresh transfers, and allocations held outside the disclosed mechanism can create sell pressure. Wallet distribution alone cannot prove common control, so combine it with funding and transaction evidence."],
      ["Administrative and treasury reach", "Map owners, multisigs, treasuries, fee recipients, pausers, and operators. Ask what each key can change, whether changes affect existing economics, and what happens if the key is compromised or abandoned."],
      ["Claims that exceed the evidence", "Treat guaranteed returns, safe-liquidity claims, audit-like badges, fake affiliations, urgent countdowns, unexplained volume, and unverifiable testimonials as reasons to stop and verify. Source verification is not an audit."],
      ["A clean checklist is still not safety", "MEV, slippage, market concentration, alternative pools, off-chain deception, legal restrictions, key compromise, and total loss can remain even when obvious red flags are absent. The correct conclusion may still be not to participate."],
    ],
  },
  "/what-is-a-crypto-rug-pull": {
    eyebrow: "Neutral field guide",
    title: "WHAT IS A CRYPTO RUG PULL?",
    intro: "Rug pull is an umbrella term, not one contract function. It usually describes insiders using control, inventory, liquidity, or misleading promises to leave other participants with severe losses.",
    sections: [
      ["Liquidity withdrawal", "A controller removes some or all assets from a trading pool. The available liquidity collapses, and remaining holders may be unable to exit at a meaningful price."],
      ["Founder or insider sell", "An insider sells a large token inventory into existing liquidity. Pool reserves may remain, but their composition changes and the token price can fall sharply."],
      ["Hidden token controls", "Minting, transfer restrictions, blacklist rules, fees, or privileged routing can make a token behave differently from what buyers expected. Source verification helps inspection but is not an audit."],
      ["Off-chain abandonment", "Teams can disappear, stop delivering, remove social channels, or misrepresent affiliations even when contract code has no reserve-withdraw function."],
      ["What to inspect", "Check deployed code, privileged roles, actual pool balances, liquidity ownership, token distribution, transaction receipts, and whether public claims match the contract. No single badge or scanner proves safety."],
      ["Rugspull's disclosed case", "Rugspull intentionally exposes one protocol-held Founder Allocation sale path. That makes a specific action inspectable; it does not prevent manipulation, losses, alternative pools, or other operational failures."],
    ],
  },
  "/rug-pull-vs-liquidity-pull": {
    eyebrow: "Mechanism comparison",
    title: "SELLING TOKENS IS NOT WITHDRAWING RESERVES.",
    intro: "Both actions can destroy a market price, but they move different assets through different permissions. Treating them as identical hides the exact control that should be inspected.",
    sections: [
      ["Founder sell", "The founder or a contract sends tokens into a pool and receives quote assets through a swap. The pool still holds reserves, but more tokens and fewer quote assets remain, so price and exit depth deteriorate."],
      ["Liquidity pull", "A privileged liquidity holder removes reserve assets directly or redeems an LP position. The pool loses trading inventory without an ordinary market swap."],
      ["Why the distinction matters", "A token lock does not automatically lock liquidity, and locked liquidity does not prevent a large holder from selling. Each permission and asset path must be checked separately."],
      ["Rugspull canonical boundary", "RugPool exposes no reserve-withdraw function and issues no LP token. Its protocol-held 45% Founder Allocation can still be sold once in full through rug() after unlock."],
      ["What Rugspull cannot control", "Third parties can create alternative pools, builders can extract MEV, wallets or keys can be compromised, and market participants can sell their own allocations. The canonical-pool boundary is not a market-wide guarantee."],
      ["How to verify an event", "Inspect the called function, token transfers, WBNB transfers, pool reserve changes, and the transaction receipt. A label such as Rugged or Safe is not a substitute for tracing the assets."],
    ],
  },
} as const;

function FactPage({ path }: { path: EvergreenRoute }) {
  const page = FACT_PAGES[path];
  const isTestnetLifecycle = path === "/testnet-lifecycle";
  const isSecurityModel = path === "/security-model";
  const isLifecycleTemplates = path === "/lifecycle-templates";
  const isApiReference = path === "/api-reference";
  const critiqueIssueUrl = "https://github.com/pqchase/rugspull/issues/1";
  return (
    <main className="page fact-page">
      <section className="page-intro">
        <span className="eyebrow">{page.eyebrow}</span>
        <h1>{page.title}</h1>
        <p>{page.intro}</p>
      </section>
      <section className="fact-grid">
        {page.sections.map(([heading, copy]) => <article className="panel" key={heading}><span className="eyebrow">{heading}</span><p>{copy}</p></article>)}
      </section>
      <section className="panel fact-actions">
        <strong>{isSecurityModel ? "Challenge a claim with evidence." : isApiReference ? "Choose a read-only artifact." : "Read risk first."}</strong>
        <span>{isSecurityModel ? "Submit a minimal reproduction, counterexample, missing invariant, or disclosure correction. Sensitive funds-at-risk reports belong in private email, not a public issue." : isApiReference ? "Use the chain for financial truth and the API only for discovery. No artifact below creates an audit, SLA, endorsement, or execution service." : "Rugspull is high-risk satire, not a safe investment or promise of returns. Total loss remains possible."}</span>
        <div>
          <a className="primary" href="/docs/risk">Risk disclosure</a>
          <a className="secondary" href={isTestnetLifecycle ? "https://testnet.bscscan.com/address/0x8e6ba49e54F7bDa1a5499D143395116d3430ae3c" : "https://bscscan.com/address/0xDFF540baBCa2ee8A2A8Ff26359Ecc9c5921D8A63#code"} target="_blank" rel="noreferrer">{isTestnetLifecycle ? "Testnet Factory" : "BscScan source"}</a>
          <a className="secondary" href="https://github.com/pqchase/rugspull" target="_blank" rel="noreferrer">GitHub</a>
          {isApiReference ? <a className="primary" href="/openapi.json">OpenAPI 3.1</a> : null}
          {isApiReference ? <a className="secondary" href="/rugspull-read.postman_collection.json">Postman Collection</a> : null}
          {isApiReference ? <a className="secondary" href="/.well-known/apis.json">APIs.json</a> : null}
          {isApiReference ? <a className="secondary" href="/.well-known/api-onboarding">API Onboarding</a> : null}
          {isApiReference ? <a className="secondary" href="/.well-known/api-catalog">API Catalog</a> : null}
          {isApiReference ? <a className="secondary" href="https://github.com/pqchase/rugspull/blob/main/docs/INTEGRATION.md" target="_blank" rel="noreferrer">Integration guide</a> : null}
          {isLifecycleTemplates ? <a className="primary" href="/lifecycle-artifact-templates.json" download>Download JSON templates</a> : null}
          {isLifecycleTemplates ? <a className="secondary" href="/assets/rug-permit-template.svg" download>Download Permit SVG</a> : null}
          {isSecurityModel ? <a className="primary" href={critiqueIssueUrl} target="_blank" rel="noreferrer"><ExternalLink size={16} />Join public critique thread</a> : null}
        </div>
      </section>
    </main>
  );
}

function Disclosure() {
  return (
    <section className="panel disclosure">
      <span className="disclosure-stamp">Full disclosure on every rug</span>
      <h2>No mystery. Still plenty of danger.</h2>
      <p>This token is not equity, debt, yield, a roadmap, or a project promise. The creator may sell the entire 45% founder allocation once into the canonical pool after the 48-hour post-Opening lock.</p>
      <div className="disclosure-grid">
        <div><strong>Founder can</strong><span>perform one disclosed full founder sell after unlock.</span></div>
        <div><strong>Founder cannot</strong><span>withdraw canonical pool reserves or sell founder tokens in pieces.</span></div>
        <div><strong>The booth takes</strong><span>0.30% per trade: 0.25% remains in the pool and 0.05% WBNB goes to the protocol treasury.</span></div>
        <div><strong>You can</strong><span>face volatility, slippage, MEV, alternative-pool risk, and total loss.</span></div>
      </div>
    </section>
  );
}

function TurnstileBox({ siteKey, onToken }: { siteKey: string; onToken(token: string): void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const widgetId = useRef<string>("");

  useEffect(() => {
    const scriptId = "cf-turnstile-script";
    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    let cancelled = false;
    const timer = window.setInterval(() => {
      if (cancelled || !ref.current || !window.turnstile || widgetId.current) return;
      widgetId.current = window.turnstile.render(ref.current, {
        sitekey: siteKey,
        callback: onToken,
        "expired-callback": () => onToken(""),
      });
      window.clearInterval(timer);
    }, 100);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      if (window.turnstile && widgetId.current) window.turnstile.reset(widgetId.current);
    };
  }, [onToken, siteKey]);

  return <div className="turnstile-box" ref={ref} />;
}

function LoadingPanel() {
  return <section className="panel loading-panel"><h2><Loader2 className="spin" size={18} />Someone is checking the chain</h2></section>;
}

function Countdown({ label, target }: { label: string; target: number | bigint }) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const remaining = Math.max(0, Number(target) - now);
  const days = Math.floor(remaining / 86_400);
  const hours = Math.floor(remaining % 86_400 / 3_600);
  const minutes = Math.floor(remaining % 3_600 / 60);
  const seconds = remaining % 60;
  const value = remaining === 0
    ? "Ready"
    : `${days > 0 ? `${days}d ` : ""}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  return <div className="countdown"><span>{label}</span><strong>{value}</strong></div>;
}

function statusSentence(status: Status) {
  if (status === "Opening") return "The floor is still being laid. Contributions wait for one batch result.";
  if (status === "Failed") return "Not enough people stood on it. Contributors can claim refunds.";
  if (status === "Active") return "Trading is live. The disclosed founder pull may unlock on schedule.";
  return "It happened. The founder allocation was sold, and the canonical pool still trades.";
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}

function formatWei(value?: bigint | string | null) {
  if (value == null || value === "") return "-";
  try {
    return `${Number(formatEther(BigInt(value))).toLocaleString(undefined, { maximumFractionDigits: 6 })} WBNB`;
  } catch {
    return String(value);
  }
}

function formatNative(value?: bigint | string | null) {
  if (value == null || value === "") return "-";
  try {
    return `${Number(formatEther(BigInt(value))).toLocaleString(undefined, { maximumFractionDigits: 6 })} BNB`;
  } catch {
    return String(value);
  }
}

function formatToken(value?: bigint | string | null) {
  if (value == null || value === "") return "-";
  try {
    return `${Number(formatEther(BigInt(value))).toLocaleString(undefined, { maximumFractionDigits: 2 })} token`;
  } catch {
    return String(value);
  }
}

function formatBps(value: number | bigint) {
  return `${(Number(value) / 100).toFixed(2)}%`;
}

function formatDuration(seconds: number | bigint) {
  const value = Number(seconds);
  if (value % 86_400 === 0) return `${value / 86_400} day${value === 86_400 ? "" : "s"}`;
  if (value % 3_600 === 0) return `${value / 3_600} hour${value === 3_600 ? "" : "s"}`;
  return `${value} seconds`;
}

const zeroSwapQuote = { amountOut: 0n, protocolFeeQuote: 0n };

function getBuyQuote(amountIn: bigint, reserveIn: bigint, reserveOut: bigint, swapFeeBps: number, protocolFeeBps: number) {
  try {
    return quoteBuyExactQuote(amountIn, reserveIn, reserveOut, BigInt(swapFeeBps), BigInt(protocolFeeBps));
  } catch {
    return zeroSwapQuote;
  }
}

function getSellQuote(amountIn: bigint, reserveIn: bigint, reserveOut: bigint, swapFeeBps: number, protocolFeeBps: number) {
  try {
    return quoteSellExactTokens(amountIn, reserveIn, reserveOut, BigInt(swapFeeBps), BigInt(protocolFeeBps));
  } catch {
    return zeroSwapQuote;
  }
}

function minimumAfterSlippage(estimate: bigint, slippageBps: number) {
  try {
    return minimumAmountOut(estimate, BigInt(slippageBps));
  } catch {
    return 0n;
  }
}

function getOpeningClaimEstimate(contribution: bigint, state: RugState) {
  if (contribution === 0n || state.totalContributed === 0n) return { tokenAmount: 0n, refundAmount: 0n };
  if (state.status !== "Active" && state.status !== "Rugged") return { tokenAmount: 0n, refundAmount: 0n };
  return claimAmounts(
    contribution,
    state.totalContributed,
    state.openingTokenAllocation,
    state.acceptedContribution,
  );
}

function parseAmountOrZero(value: string) {
  try {
    return parseEther(value || "0");
  } catch {
    return 0n;
  }
}

function short(address: Address | string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function shortOrEmpty(address: Address) {
  return address === ZERO ? "Not created" : short(address);
}

function formatTime(seconds: number | bigint) {
  const value = Number(seconds);
  if (value === 0) return "-";
  return new Date(value * 1000).toLocaleString();
}

function hashCanonical(value: unknown) {
  return keccak256(stringToHex(JSON.stringify(sortObject(value))));
}

async function finalizeUploadBundle(
  metadata: Record<string, unknown>,
  imageFile: File | null,
  turnstileToken = "",
): Promise<{ hash: `0x${string}`; uri: string }> {
  const form = new FormData();
  form.set("metadata", JSON.stringify(metadata));
  if (imageFile) form.set("image", imageFile, imageFile.name);
  const response = await fetch(`${API_BASE}/api/uploads/finalize`, {
    method: "POST",
    headers: turnstileHeaders(turnstileToken),
    body: form,
  });
  if (response.ok) return response.json();
  const error = await response.json().catch(() => ({ error: "Metadata upload failed." }));
  throw new Error(typeof error.error === "string" ? error.error : "Metadata upload failed.");
}

async function registerRug(rug: Address, txHash: `0x${string}`) {
  const response = await fetch(`${API_BASE}/api/indexer/register-rug`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rug, txHash }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: "Rug cache registration failed." }));
    throw new Error(typeof body.error === "string" ? body.error : "Rug cache registration failed.");
  }
}

function turnstileHeaders(turnstileToken: string) {
  const headers: Record<string, string> = {};
  if (turnstileToken) headers["cf-turnstile-response"] = turnstileToken;
  return headers;
}

function resolveR2Uri(uri: string) {
  if (!uri.startsWith("r2://")) return uri;
  return `${API_BASE}/api/r2/${encodeURI(uri.slice("r2://".length))}`;
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

function walletErrorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "number" ? code : null;
}

async function findCreatedRug(logs: Array<{ topics: string[]; data: string }>): Promise<Address | null> {
  const eventTopic = "0x40f71ec9a6e3ecda59b1a42d5ee6b4214a14d762bf10b3c363c8ddb487298870";
  const log = logs.find((entry) => entry.topics[0] === eventTopic);
  if (!log?.topics[1]) return null;
  return `0x${log.topics[1].slice(-40)}` as Address;
}

createRoot(document.getElementById("root")!).render(<App />);
