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
          : path.startsWith("/ops")
            ? { title: "Backstage | Rugspull", description: "Indexer and deployment diagnostics for Rugspull.", robots: "noindex, nofollow" }
            : path.startsWith("/account/")
              ? { title: "My Chair | Rugspull", description: "View Rugs and positions associated with a wallet.", robots: "noindex, nofollow" }
              : { title: "Rugspull | Disclosed Rugpull Parody on BNB Smart Chain", description: "A public parody of rugpull incentives: one disclosed founder sell, no pool-reserve withdrawal, and on-chain settlement.", robots: "index, follow" };
    const canonical = `https://rugspull.com${path === "/" ? "/" : path}`;
    document.title = route.title;
    setMeta("meta[name='description']", "content", route.description);
    setMeta("meta[name='robots']", "content", route.robots);
    setMeta("meta[property='og:title']", "content", route.title);
    setMeta("meta[property='og:description']", "content", route.description);
    setMeta("meta[property='og:url']", "content", canonical);
    setMeta("meta[name='twitter:title']", "content", route.title);
    setMeta("meta[name='twitter:description']", "content", route.description);
    setMeta("link[rel='canonical']", "href", canonical);
  }, [path]);
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
                  <li><a href="/">Browse rugs</a></li>
                </ul>
              </section>
              <section className="footer-link-group">
                <h2>Office doors</h2>
                <ul>
                  <li><a href="/create">Host a rug</a></li>
                  <li><a href="/ops">Backstage</a></li>
                </ul>
              </section>
              <section className="footer-desk-note">
                <h2>Support desk rule</h2>
                <p>Official support never asks for a seed phrase, private key, direct transfer, or mystery wallet connection.</p>
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
