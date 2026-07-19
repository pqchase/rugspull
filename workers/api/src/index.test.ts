import { rugFactoryAbi, rugInstanceAbi, rugPoolAbi } from "@rugspull/contracts-ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type Address,
  bytesToHex,
  decodeFunctionData,
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionResult,
  keccak256,
  hexToNumber,
  numberToHex,
} from "viem";
import worker, { seoForPath, type Env } from "./index";

type RugRow = Record<string, unknown> & {
  chain_id: number;
  rug_address: string;
  factory_address?: string;
  created_block: number;
  updated_block: number;
  total_contributed: string;
  status: string;
};

type EventRow = {
  chain_id: number;
  tx_hash: string;
  log_index: number;
  block_number: number;
  rug_address: string;
  event_name: string;
  event_json: string;
};

type SyncRow = {
  chain_id: number;
  contract_address: string;
  last_scanned_block: number;
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

type BlockTimeRow = {
  chain_id: number;
  block_number: number;
  block_timestamp: number;
};

type RpcLog = {
  address: Address;
  blockNumber: `0x${string}`;
  transactionHash: `0x${string}`;
  logIndex: `0x${string}`;
  topics: [`0x${string}`, ...`0x${string}`[]];
  data: `0x${string}`;
};

class MemoryD1 {
  rugs = new Map<string, RugRow>();
  events: EventRow[] = [];
  sync = new Map<string, SyncRow>();
  metadata = new Map<string, unknown>();
  marketStats = new Map<string, MarketStatsRow>();
  blockTimes = new Map<string, BlockTimeRow>();

  prepare(sql: string) {
    return new MemoryStmt(this, sql);
  }

  rugKey(chain: number, rug: string) {
    return `${chain}:${rug.toLowerCase()}`;
  }

  syncKey(chain: number, contract: string) {
    return `${chain}:${contract.toLowerCase()}`;
  }

  marketKey(chain: number, rug: string) {
    return `${chain}:${rug.toLowerCase()}`;
  }

  blockTimeKey(chain: number, block: number) {
    return `${chain}:${block}`;
  }
}

class MemoryStmt {
  private args: unknown[] = [];

  constructor(private readonly db: MemoryD1, private readonly sql: string) {}

  bind(...args: unknown[]) {
    this.args = args;
    return this;
  }

  async all<T = unknown>(): Promise<{ results: T[] }> {
    const sql = normalize(this.sql);
    if (sql.includes("select * from rugs where chain_id = ?") && sql.includes("and status = ?")) {
      const [chain, factoryAddress, status, limit, offset] = this.args as [number, string, string, number, number];
      return {
        results: sortRugs([...this.db.rugs.values()].filter((row) => row.chain_id === chain
          && row.factory_address?.toLowerCase() === factoryAddress.toLowerCase()
          && row.status === status), limit, offset) as T[],
      };
    }
    if (sql.includes("select * from rugs where chain_id = ?") && sql.includes("factory_address") && sql.includes("order by updated_block")) {
      const [chain, factoryAddress, limit, offset] = this.args as [number, string, number, number];
      return {
        results: sortRugs([...this.db.rugs.values()].filter((row) => row.chain_id === chain
          && row.factory_address?.toLowerCase() === factoryAddress.toLowerCase()), limit, offset) as T[],
      };
    }
    if (sql.includes("select r.rug_address, r.created_block")) {
      const [chain] = this.args as [number];
      return {
        results: [...this.db.rugs.values()]
          .filter((row) => row.chain_id === chain)
          .sort((a, b) => {
            const aSync = this.db.sync.get(this.db.syncKey(chain, a.rug_address))?.last_scanned_block ?? a.created_block;
            const bSync = this.db.sync.get(this.db.syncKey(chain, b.rug_address))?.last_scanned_block ?? b.created_block;
            return aSync - bSync;
          })
          .slice(0, 100)
          .map((row) => ({ rug_address: row.rug_address, created_block: row.created_block })) as T[],
      };
    }
    if (sql.includes("select r.rug_address, r.pool_address, r.created_block")) {
      const [chain] = this.args as [number];
      return {
        results: [...this.db.rugs.values()]
          .filter((row) => row.chain_id === chain && typeof row.pool_address === "string")
          .sort((a, b) => {
            const aPool = a.pool_address as string;
            const bPool = b.pool_address as string;
            const aSync = this.db.sync.get(this.db.syncKey(chain, aPool))?.last_scanned_block ?? a.created_block;
            const bSync = this.db.sync.get(this.db.syncKey(chain, bPool))?.last_scanned_block ?? b.created_block;
            return aSync - bSync;
          })
          .slice(0, 100)
          .map((row) => ({ rug_address: row.rug_address, pool_address: row.pool_address, created_block: row.created_block })) as T[],
        };
    }
    if (sql.includes("row_number() over") && sql.includes("from rug_events")) {
      const [chain, ...addresses] = this.args as [number, ...string[]];
      const allowed = new Set(addresses.map((address) => address.toLowerCase()));
      const rows: Array<Pick<EventRow, "rug_address" | "block_number" | "log_index" | "event_json">> = [];
      for (const address of allowed) {
        rows.push(...this.db.events
          .filter((row) => row.chain_id === chain
            && row.rug_address.toLowerCase() === address
            && ["LaunchSucceeded", "Swap"].includes(row.event_name))
          .sort((a, b) => b.block_number - a.block_number || b.log_index - a.log_index)
          .slice(0, 16)
          .reverse()
          .map((row) => ({
            rug_address: row.rug_address,
            block_number: row.block_number,
            log_index: row.log_index,
            event_json: row.event_json,
          })));
      }
      return { results: rows as T[] };
    }
    if (sql.includes("select * from (") && sql.includes("event_name in ('launchsucceeded', 'swap', 'rugpulled')")) {
      const [chain, rug, limit] = this.args as [number, string, number];
      const rows = this.db.events
        .filter((row) => row.chain_id === chain
          && row.rug_address.toLowerCase() === rug.toLowerCase()
          && ["LaunchSucceeded", "Swap", "RugPulled"].includes(row.event_name))
        .sort((a, b) => b.block_number - a.block_number || b.log_index - a.log_index)
        .slice(0, limit)
        .reverse();
      return { results: rows as T[] };
    }
    if (sql.includes("select event_json, block_number from rug_events")) {
      const [chain, rug] = this.args as [number, string];
      return {
        results: this.db.events
          .filter((row) => row.chain_id === chain
            && row.rug_address.toLowerCase() === rug.toLowerCase()
            && row.event_name === "Swap")
          .sort((a, b) => a.block_number - b.block_number || a.log_index - b.log_index)
          .slice(0, 5_001)
          .map((row) => ({ event_json: row.event_json, block_number: row.block_number })) as T[],
      };
    }
    if (sql.includes("select block_number, block_timestamp from block_times")) {
      const [chain, ...blocks] = this.args as [number, ...number[]];
      const allowed = new Set(blocks);
      return {
        results: [...this.db.blockTimes.values()]
          .filter((row) => row.chain_id === chain && allowed.has(row.block_number))
          .map((row) => ({ block_number: row.block_number, block_timestamp: row.block_timestamp })) as T[],
      };
    }
    if (sql.includes("select * from rug_events where chain_id = ?")) {
      const [chain, rug] = this.args as [number, string];
      return {
        results: this.db.events
          .filter((row) => row.chain_id === chain && row.rug_address.toLowerCase() === rug.toLowerCase())
          .sort((a, b) => a.block_number - b.block_number || a.log_index - b.log_index)
          .slice(0, 100) as T[],
      };
    }
    if (sql.includes("select contract_address, last_scanned_block from sync_state where chain_id = ?")) {
      const [chain] = this.args as [number];
      return {
        results: [...this.db.sync.values()]
          .filter((row) => row.chain_id === chain)
          .sort((a, b) => a.contract_address.localeCompare(b.contract_address))
          .map((row) => ({ contract_address: row.contract_address, last_scanned_block: row.last_scanned_block })) as T[],
      };
    }
    return { results: [] };
  }

  async first<T = unknown>(): Promise<T | null> {
    const sql = normalize(this.sql);
    if (sql.includes("select * from rugs where chain_id = ?")) {
      const [chain, rug] = this.args as [number, string];
      return (this.db.rugs.get(this.db.rugKey(chain, rug)) as T | undefined) ?? null;
    }
    if (sql.includes("select total_contributed from rugs where chain_id = ?")) {
      const [chain, rug] = this.args as [number, string];
      const row = this.db.rugs.get(this.db.rugKey(chain, rug));
      return (row ? { total_contributed: row.total_contributed } as T : null);
    }
    if (sql.includes("select tx_hash") && sql.includes("event_name = 'rugpulled'")) {
      const [chain, rug] = this.args as [number, string];
      const row = this.db.events
        .filter((event) => event.chain_id === chain
          && event.rug_address.toLowerCase() === rug.toLowerCase()
          && event.event_name === "RugPulled")
        .sort((a, b) => b.block_number - a.block_number || b.log_index - a.log_index)[0];
      return (row as T | undefined) ?? null;
    }
    if (sql.includes("select * from rug_market_stats")) {
      const [chain, rug] = this.args as [number, string];
      return (this.db.marketStats.get(this.db.marketKey(chain, rug)) as T | undefined) ?? null;
    }
    if (sql.includes("select count(*) as trade_count from rug_events")) {
      const [chain, rug] = this.args as [number, string];
      const tradeCount = this.db.events.filter((event) => event.chain_id === chain
        && event.rug_address.toLowerCase() === rug.toLowerCase()
        && event.event_name === "Swap").length;
      return { trade_count: tradeCount } as T;
    }
    if (sql.includes("select last_scanned_block from sync_state")) {
      const [chain, contract] = this.args as [number, string];
      const row = this.db.sync.get(this.db.syncKey(chain, contract));
      return (row ? { last_scanned_block: row.last_scanned_block } as T : null);
    }
    return null;
  }

  async run(): Promise<{ success: true; meta: { changes: number } }> {
    const sql = normalize(this.sql);
    let changes = 1;
    if (sql.includes("insert into rugs") && sql.includes("accepted_contribution")) {
      const [
        chain,
        rug,
        factoryAddress,
        creator,
        status,
        name,
        symbol,
        metadataUri,
        metadataHash,
        disclosureHash,
        creatorStake,
        totalContributed,
        acceptedContribution,
        founderRemaining,
        token,
        pool,
        openingStart,
        openingEnd,
        founderUnlockTime,
        createdBlock,
        updatedBlock,
      ] = this.args as [number, string, string, string, string, string, string, string, string, string, string, string, string, string, string | null, string | null, number, number, number, number, number];
      const key = this.db.rugKey(chain, rug);
      const current = this.db.rugs.get(key);
      this.db.rugs.set(key, {
        ...current,
        chain_id: chain,
        rug_address: rug,
        factory_address: factoryAddress,
        creator,
        status,
        name,
        symbol,
        metadata_uri: metadataUri,
        metadata_hash: metadataHash,
        disclosure_hash: disclosureHash,
        creator_stake: creatorStake,
        total_contributed: totalContributed,
        accepted_contribution: acceptedContribution,
        founder_remaining: founderRemaining,
        token_address: token,
        pool_address: pool,
        opening_start: openingStart,
        opening_end: openingEnd,
        founder_unlock_time: founderUnlockTime,
        created_block: current?.created_block ?? createdBlock,
        updated_block: updatedBlock,
      });
    } else if (sql.includes("insert into rugs")) {
      const [
        chain,
        rug,
        factoryAddress,
        creator,
        name,
        symbol,
        metadataUri,
        metadataHash,
        disclosureHash,
        creatorStake,
        openingStart,
        openingEnd,
        founderUnlockTime,
        createdBlock,
        updatedBlock,
      ] = this.args as [number, string, string, string, string, string, string, string, string, string, number, number, number, number, number];
      const key = this.db.rugKey(chain, rug);
      const current = this.db.rugs.get(key);
      this.db.rugs.set(key, {
        ...current,
        chain_id: chain,
        rug_address: rug,
        factory_address: factoryAddress,
        creator,
        status: current?.status ?? "Opening",
        name,
        symbol,
        metadata_uri: metadataUri,
        metadata_hash: metadataHash,
        disclosure_hash: disclosureHash,
        creator_stake: creatorStake,
        total_contributed: current?.total_contributed ?? "0",
        opening_start: openingStart,
        opening_end: openingEnd,
        founder_unlock_time: founderUnlockTime,
        created_block: current?.created_block ?? createdBlock,
        updated_block: updatedBlock,
      });
    } else if (sql.includes("update rugs set total_contributed")) {
      const [total, updatedBlock, chain, rug] = this.args as [string, number, number, string];
      Object.assign(requireRug(this.db, chain, rug), { total_contributed: total, updated_block: updatedBlock });
    } else if (sql.includes("update rugs set status = 'failed'")) {
      const [total, updatedBlock, chain, rug] = this.args as [string, number, number, string];
      Object.assign(requireRug(this.db, chain, rug), { status: "Failed", total_contributed: total, updated_block: updatedBlock });
    } else if (sql.includes("update rugs set status = 'active'")) {
      const [token, pool, total, accepted, founderAllocation, founderRemaining, updatedBlock, chain, rug] =
        this.args as [string, string, string, string, string, string, number, number, string];
      Object.assign(requireRug(this.db, chain, rug), {
        status: "Active",
        token_address: token,
        pool_address: pool,
        total_contributed: total,
        accepted_contribution: accepted,
        founder_allocation: founderAllocation,
        founder_remaining: founderRemaining,
        updated_block: updatedBlock,
      });
    } else if (sql.includes("update rugs set status = 'rugged'")) {
      const [updatedBlock, chain, rug] = this.args as [number, number, string];
      Object.assign(requireRug(this.db, chain, rug), { status: "Rugged", founder_remaining: "0", updated_block: updatedBlock });
    } else if (sql.includes("insert or ignore into rug_events")) {
      const [chain, txHash, logIndex, blockNumber, rug, eventName, eventJson] =
        this.args as [number, string, number, number, string, string, string];
      if (!this.db.events.some((row) => row.chain_id === chain && row.tx_hash === txHash && row.log_index === logIndex)) {
        this.db.events.push({
          chain_id: chain,
          tx_hash: txHash,
          log_index: logIndex,
          block_number: blockNumber,
          rug_address: rug,
          event_name: eventName,
          event_json: eventJson,
        });
      } else {
        changes = 0;
      }
    } else if (sql.includes("insert into sync_state")) {
      const [chain, contract, block] = this.args as [number, string, number];
      this.db.sync.set(this.db.syncKey(chain, contract), {
        chain_id: chain,
        contract_address: contract,
        last_scanned_block: block,
      });
    } else if (sql.includes("insert into rug_market_stats")) {
      const [
        chain,
        rug,
        tradeCount,
        buyQuoteVolume,
        sellQuoteVolume,
        protocolFeeQuote,
        latestPriceX18,
        updatedBlock,
      ] = this.args as [number, string, number, string, string, string, string, number];
      this.db.marketStats.set(this.db.marketKey(chain, rug), {
        chain_id: chain,
        rug_address: rug,
        trade_count: tradeCount,
        buy_quote_volume: buyQuoteVolume,
        sell_quote_volume: sellQuoteVolume,
        protocol_fee_quote: protocolFeeQuote,
        latest_price_x18: latestPriceX18,
        updated_block: updatedBlock,
      });
    } else if (sql.includes("insert into block_times")) {
      const [chain, block, timestamp] = this.args as [number, number, number];
      this.db.blockTimes.set(this.db.blockTimeKey(chain, block), {
        chain_id: chain,
        block_number: block,
        block_timestamp: timestamp,
      });
    } else if (sql.includes("insert or ignore into metadata_objects")) {
      const [hash, key, mimeType, byteSize, createdAt, uploader] = this.args;
      if (!this.db.metadata.has(hash as string)) {
        this.db.metadata.set(hash as string, { hash, key, mimeType, byteSize, createdAt, uploader });
      }
    }
    return { success: true, meta: { changes } };
  }
}

class MemoryR2 {
  objects = new Map<string, { value: unknown; options?: R2PutOptions }>();

  async head(key: string) {
    return this.objects.has(key) ? { key } : null;
  }

  async put(key: string, value: unknown, options?: R2PutOptions) {
    this.objects.set(key, { value, options });
    return null;
  }

  async get(key: string) {
    const object = this.objects.get(key);
    if (!object) return null;
    return {
      body: object.value as BodyInit,
      httpMetadata: object.options?.httpMetadata,
    };
  }
}

function env(overrides: Partial<Env> = {}, db = new MemoryD1()): Env {
  return {
    DB: db as unknown as D1Database,
    R2: new MemoryR2() as unknown as R2Bucket,
    CHAIN_ID: "97",
    FACTORY_ADDRESS: factory,
    FACTORY_DEPLOY_BLOCK: "100",
    RPC_URL: "https://rpc.test",
    ALLOW_UNPROTECTED_UPLOADS: "1",
    ...overrides,
  };
}

async function json(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

const factory = "0x30713B67a8de924E84f22a40E6854F4bD1baaE5B" as Address;
const rug = "0x1111111111111111111111111111111111111111" as Address;
const failedRug = "0x6666666666666666666666666666666666666666" as Address;
const creator = "0x2222222222222222222222222222222222222222" as Address;
const user = "0x3333333333333333333333333333333333333333" as Address;
const token = "0x4444444444444444444444444444444444444444" as Address;
const pool = "0x5555555555555555555555555555555555555555" as Address;
const metadataHash = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const disclosureHash = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("rugspull worker", () => {
  it("builds canonical metadata for public and private routes", async () => {
    await expect(seoForPath("/create")).resolves.toMatchObject({
      title: "Create a Rug | Rugspull",
      canonical: "https://rugspull.com/create",
      robots: "index, follow",
    });
    await expect(seoForPath("/api-reference")).resolves.toMatchObject({
      title: "Read API Reference | Rugspull",
      canonical: "https://rugspull.com/api-reference",
      robots: "index, follow",
    });
    await expect(seoForPath("/can-the-creator-contribute")).resolves.toMatchObject({
      title: "Can the Creator Contribute? | Rugspull",
      canonical: "https://rugspull.com/can-the-creator-contribute",
      robots: "index, follow",
    });
    await expect(seoForPath("/can-the-creator-cancel-opening")).resolves.toMatchObject({
      title: "Can the Creator Cancel Opening? | Rugspull",
      canonical: "https://rugspull.com/can-the-creator-cancel-opening",
      robots: "index, follow",
    });
    await expect(seoForPath("/what-happens-to-excess-contributions")).resolves.toMatchObject({
      title: "What Happens to Excess Opening Contributions? | Rugspull",
      canonical: "https://rugspull.com/what-happens-to-excess-contributions",
      robots: "index, follow",
    });
    await expect(seoForPath("/who-can-finalize-an-opening")).resolves.toMatchObject({
      title: "Who Can Finalize an Opening? | Rugspull",
      canonical: "https://rugspull.com/who-can-finalize-an-opening",
      robots: "index, follow",
    });
    await expect(seoForPath("/how-to-claim-opening-tokens")).resolves.toMatchObject({
      title: "How to Claim Opening Tokens | Rugspull",
      canonical: "https://rugspull.com/how-to-claim-opening-tokens",
      robots: "index, follow",
    });
    await expect(seoForPath("/what-is-wbnb")).resolves.toMatchObject({
      title: "What Is WBNB? BNB Chain Quote Asset Guide | Rugspull",
      canonical: "https://rugspull.com/what-is-wbnb",
      robots: "index, follow",
    });
    await expect(seoForPath("/what-is-a-token-approval")).resolves.toMatchObject({
      title: "What Is a Token Approval on BNB Chain? | Rugspull",
      canonical: "https://rugspull.com/what-is-a-token-approval",
      robots: "index, follow",
    });
    await expect(seoForPath("/what-is-slippage-on-bnb-chain")).resolves.toMatchObject({
      title: "What Is Slippage on BNB Chain? | Rugspull",
      canonical: "https://rugspull.com/what-is-slippage-on-bnb-chain",
      robots: "index, follow",
    });
    await expect(seoForPath("/constant-product-amm-explained")).resolves.toMatchObject({
      title: "What Is a Constant-Product AMM? | Rugspull",
      canonical: "https://rugspull.com/constant-product-amm-explained",
      robots: "index, follow",
    });
    await expect(seoForPath("/what-is-liquidity-on-bnb-chain")).resolves.toMatchObject({
      title: "What Is Liquidity on BNB Chain? | Rugspull",
      canonical: "https://rugspull.com/what-is-liquidity-on-bnb-chain",
      robots: "index, follow",
    });
    await expect(seoForPath("/how-to-read-amm-reserves-on-bscscan")).resolves.toMatchObject({
      title: "How to Read AMM Reserves on BscScan | Rugspull",
      canonical: "https://rugspull.com/how-to-read-amm-reserves-on-bscscan",
      robots: "index, follow",
    });
    await expect(seoForPath("/what-is-mev-on-bnb-chain")).resolves.toMatchObject({
      title: "What Is MEV on BNB Chain? | Rugspull",
      canonical: "https://rugspull.com/what-is-mev-on-bnb-chain",
      robots: "index, follow",
    });
    await expect(seoForPath("/what-are-alternative-pools-on-bnb-chain")).resolves.toMatchObject({
      title: "What Are Alternative Pools on BNB Chain? | Rugspull",
      canonical: "https://rugspull.com/what-are-alternative-pools-on-bnb-chain",
      robots: "index, follow",
    });
    await expect(seoForPath("/what-are-smart-contract-invariants")).resolves.toMatchObject({
      title: "What Are Smart Contract Invariants? | Rugspull",
      canonical: "https://rugspull.com/what-are-smart-contract-invariants",
      robots: "index, follow",
    });
    await expect(seoForPath("/what-does-token-conservation-mean")).resolves.toMatchObject({
      title: "What Does Token Conservation Mean? | Rugspull",
      canonical: "https://rugspull.com/what-does-token-conservation-mean",
      robots: "index, follow",
    });
    await expect(seoForPath("/what-does-wbnb-conservation-mean")).resolves.toMatchObject({
      title: "What Does WBNB Conservation Mean? | Rugspull",
      canonical: "https://rugspull.com/what-does-wbnb-conservation-mean",
      robots: "index, follow",
    });
    await expect(seoForPath("/what-does-no-double-claim-mean")).resolves.toMatchObject({
      title: "What Does No Double Claim Mean? | Rugspull",
      canonical: "https://rugspull.com/what-does-no-double-claim-mean",
      robots: "index, follow",
    });
    await expect(seoForPath("/what-does-no-double-rug-mean")).resolves.toMatchObject({
      title: "What Does No Double Rug Mean? | Rugspull",
      canonical: "https://rugspull.com/what-does-no-double-rug-mean",
      robots: "index, follow",
    });
    await expect(seoForPath("/what-does-reserve-reconciliation-mean")).resolves.toMatchObject({
      title: "What Does Reserve Reconciliation Mean? | Rugspull",
      canonical: "https://rugspull.com/what-does-reserve-reconciliation-mean",
      robots: "index, follow",
    });
    await expect(seoForPath("/what-does-founder-token-immobility-mean")).resolves.toMatchObject({
      title: "What Does Founder Token Immobility Mean? | Rugspull",
      canonical: "https://rugspull.com/what-does-founder-token-immobility-mean",
      robots: "index, follow",
    });
    await expect(seoForPath("/what-does-protocol-fee-destination-mean")).resolves.toMatchObject({
      title: "What Does Protocol Fee Destination Mean? | Rugspull",
      canonical: "https://rugspull.com/what-does-protocol-fee-destination-mean",
      robots: "index, follow",
    });
    await expect(seoForPath("/what-does-non-decreasing-amm-k-mean")).resolves.toMatchObject({
      title: "What Does Non-Decreasing AMM K Mean? | Rugspull",
      canonical: "https://rugspull.com/what-does-non-decreasing-amm-k-mean",
      robots: "index, follow",
    });
    await expect(seoForPath("/what-does-status-monotonicity-mean")).resolves.toMatchObject({
      title: "What Does Lifecycle-Status Monotonicity Mean? | Rugspull",
      canonical: "https://rugspull.com/what-does-status-monotonicity-mean",
      robots: "index, follow",
    });
    await expect(seoForPath("/what-does-economic-allocation-consistency-mean")).resolves.toMatchObject({
      title: "What Does Economic-Allocation Consistency Mean? | Rugspull",
      canonical: "https://rugspull.com/what-does-economic-allocation-consistency-mean",
      robots: "index, follow",
    });
    await expect(seoForPath("/why-opening-price-is-not-below-initial-pool-price")).resolves.toMatchObject({
      title: "Why Is the Opening Price Not Below the Initial Pool Price? | Rugspull",
      canonical: "https://rugspull.com/why-opening-price-is-not-below-initial-pool-price",
      robots: "index, follow",
    });
    await expect(seoForPath("/why-pro-rata-claims-can-leave-rounding-residue")).resolves.toMatchObject({
      title: "Why Can Pro-Rata Claims Leave Rounding Residue? | Rugspull",
      canonical: "https://rugspull.com/why-pro-rata-claims-can-leave-rounding-residue",
      robots: "index, follow",
    });
    await expect(seoForPath("/what-does-settled-mean-for-claims-and-refunds")).resolves.toMatchObject({
      title: "What Does Settled Mean for Claims and Refunds? | Rugspull",
      canonical: "https://rugspull.com/what-does-settled-mean-for-claims-and-refunds",
      robots: "index, follow",
    });
    await expect(seoForPath("/how-to-verify-claims-and-refunds-on-bscscan")).resolves.toMatchObject({
      title: "How to Verify Claims and Refunds on BscScan | Rugspull",
      canonical: "https://rugspull.com/how-to-verify-claims-and-refunds-on-bscscan",
      robots: "index, follow",
    });
    await expect(seoForPath("/what-is-a-transaction-receipt-on-bnb-chain")).resolves.toMatchObject({
      title: "What Is a Transaction Receipt on BNB Chain? | Rugspull",
      canonical: "https://rugspull.com/what-is-a-transaction-receipt-on-bnb-chain",
      robots: "index, follow",
    });
    await expect(seoForPath("/verified-source-code-does-not-mean-audited")).resolves.toMatchObject({
      title: "Verified Source Code Is Not an Audit | Rugspull",
      canonical: "https://rugspull.com/verified-source-code-does-not-mean-audited",
      robots: "index, follow",
    });
    await expect(seoForPath("/why-d1-is-not-financial-truth")).resolves.toMatchObject({
      title: "Why Cloudflare D1 Is Not Financial Truth | Rugspull",
      canonical: "https://rugspull.com/why-d1-is-not-financial-truth",
      robots: "index, follow",
    });
    await expect(seoForPath("/ops")).resolves.toMatchObject({ robots: "noindex, nofollow" });
  });

  it("uses indexed rug names in server-rendered social metadata", async () => {
    const db = new MemoryD1();
    const address = "0x1111111111111111111111111111111111111111";
    db.rugs.set(db.rugKey(97, address), {
      chain_id: 97,
      rug_address: address,
      factory_address: "0x9999999999999999999999999999999999999999",
      created_block: 1,
      updated_block: 1,
      total_contributed: "0",
      status: "Opening",
      name: "Chair With Ambition",
      symbol: "CHAIR",
    });
    await expect(seoForPath(`/rug/97/${address}`, {
      DB: db as unknown as D1Database,
      FACTORY_ADDRESS: factory,
    })).resolves.toMatchObject({
      title: "Chair With Ambition (CHAIR) | Rugspull",
      robots: "noindex, nofollow",
    });
  });

  it("serves health and config", async () => {
    const health = await worker.fetch(new Request("https://rugspull.test/api/health"), env());
    expect(health.status).toBe(200);
    expect(health.headers.get("access-control-allow-origin")).toBe("*");
    expect(health.headers.get("access-control-expose-headers")).toBe("link");
    expect(health.headers.get("link")).toContain('rel="api-catalog"');
    expect(health.headers.get("link")).toContain('rel="service-desc"');
    expect(health.headers.get("link")).toContain('rel="service-doc"');
    expect(await json(health)).toMatchObject({ ok: true, service: "rugspull-api" });

    const config = await worker.fetch(new Request("https://rugspull.test/api/config"), env());
    expect(config.status).toBe(200);
    expect(await json(config)).toMatchObject({ chainId: 97, financialTruth: "BSC contracts", uploadsProtected: false });
  });

  it("serves the extensionless API Onboarding well-known as JSON", async () => {
    const assets = {
      fetch: vi.fn().mockResolvedValue(new Response('{"aod":"0.1"}', { status: 200 })),
    };
    const response = await worker.fetch(
      new Request("https://rugspull.test/.well-known/api-onboarding"),
      env({ ASSETS: assets as unknown as Fetcher }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    await expect(response.json()).resolves.toEqual({ aod: "0.1" });
  });

  it("answers API CORS preflight for split frontend/API deployments", async () => {
    const response = await worker.fetch(new Request("https://rugspull.test/api/metadata/finalize", {
      method: "OPTIONS",
      headers: {
        origin: "https://app.example",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type,x-turnstile-token",
      },
    }), env());
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-headers")).toContain("x-turnstile-token");
  });

  it("does not expose custodial financial endpoints", async () => {
    for (const path of ["/api/buy", "/api/sell", "/api/rug", "/api/claim"]) {
      const response = await worker.fetch(new Request(`https://rugspull.test${path}`), env());
      expect(response.status).toBe(405);
      expect((await json(response)).error).toContain("wallet");
    }
  });

  it("validates rug list filters and pagination for public traffic", async () => {
    const db = new MemoryD1();
    db.rugs.set(db.rugKey(97, rug), {
      chain_id: 97,
      rug_address: rug.toLowerCase(),
      factory_address: factory.toLowerCase(),
      created_block: 101,
      updated_block: 130,
      total_contributed: "2000000000000000",
      status: "Rugged",
    });
    const legacyRug = "0x7777777777777777777777777777777777777777";
    db.rugs.set(db.rugKey(97, legacyRug), {
      chain_id: 97,
      rug_address: legacyRug,
      factory_address: "0x8888888888888888888888888888888888888888",
      created_block: 90,
      updated_block: 999,
      total_contributed: "0",
      status: "Rugged",
    });

    const lowerStatus = await worker.fetch(new Request("https://rugspull.test/api/rugs?status=rugged&limit=NaN&cursor=-4"), env({}, db));
    expect(lowerStatus.status).toBe(200);
    const lowerStatusBody = await json(lowerStatus);
    expect((lowerStatusBody.rugs as RugRow[])[0].rug_address).toBe(rug.toLowerCase());
    expect(lowerStatusBody.rugs as RugRow[]).toHaveLength(1);

    const badStatus = await worker.fetch(new Request("https://rugspull.test/api/rugs?status=unknown"), env({}, db));
    expect(badStatus.status).toBe(400);
    expect((await json(badStatus)).error).toContain("status");
  });

  it("protects manual indexer runs when an admin token is configured", async () => {
    const missing = await worker.fetch(
      new Request("https://rugspull.test/api/indexer/run", { method: "POST" }),
      env({ ADMIN_TOKEN: "secret" }),
    );
    expect(missing.status).toBe(401);

    mockRpc([]);
    const authorized = await worker.fetch(
      new Request("https://rugspull.test/api/indexer/run", {
        method: "POST",
        headers: { authorization: "Bearer secret" },
      }),
      env({ ADMIN_TOKEN: "secret" }),
    );
    expect(authorized.status).toBe(200);
    expect(await json(authorized)).toMatchObject({ ok: true, warnings: [] });
  });

  it("fails closed when indexer administration is not configured", async () => {
    const response = await worker.fetch(
      new Request("https://rugspull.test/api/indexer/run", { method: "POST" }),
      env(),
    );
    expect(response.status).toBe(503);
  });

  it("rotates indexer work so rugs beyond the first 100 are not starved", async () => {
    const db = new MemoryD1();
    for (let index = 1; index <= 101; index++) {
      const address = `0x${index.toString(16).padStart(40, "0")}`;
      db.rugs.set(db.rugKey(97, address), {
        chain_id: 97,
        rug_address: address,
        creator,
        created_block: 100,
        updated_block: 100,
        total_contributed: "0",
        status: "Opening",
      });
    }
    mockRpc([]);
    const request = () => new Request("https://rugspull.test/api/indexer/run", {
      method: "POST",
      headers: { authorization: "Bearer test-admin" },
    });

    expect((await worker.fetch(request(), env({ ADMIN_TOKEN: "test-admin" }, db))).status).toBe(200);
    expect((await worker.fetch(request(), env({ ADMIN_TOKEN: "test-admin" }, db))).status).toBe(200);

    const syncedRugs = [...db.sync.values()].filter((row) => row.contract_address !== factory.toLowerCase());
    expect(syncedRugs).toHaveLength(101);
  });

  it("falls back across configured RPC endpoints", async () => {
    const calls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      calls.push(String(input));
      const body = JSON.parse(init?.body as string) as { id: number; method: string };
      if (String(input) === "https://bad-rpc.test") {
        return rpcError(body.id, "rate limited");
      }
      if (body.method === "eth_blockNumber") {
        return rpcResponse(body.id, numberToHex(200));
      }
      return rpcResponse(body.id, null);
    });

    const response = await worker.fetch(
      new Request("https://rugspull.test/api/indexer/status"),
      env({ RPC_URL: "https://bad-rpc.test", RPC_URLS: "https://good-rpc.test" }),
    );

    expect(response.status).toBe(200);
    const body = await json(response);
    expect(body).toMatchObject({ latestBlock: 200 });
    expect(body.warnings).toEqual([`Factory ${factory} has no indexer checkpoint.`]);
    expect(calls).toEqual(["https://bad-rpc.test", "https://good-rpc.test"]);
  });

  it("uses a configurable stale-block threshold for scheduled indexing", async () => {
    const db = new MemoryD1();
    db.sync.set(db.syncKey(97, factory), {
      chain_id: 97,
      contract_address: factory.toLowerCase(),
      last_scanned_block: 100,
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const body = JSON.parse(init?.body as string) as { id: number; method: string };
      if (body.method === "eth_blockNumber") return rpcResponse(body.id, numberToHex(800));
      return rpcResponse(body.id, null);
    });

    const normal = await json(await worker.fetch(
      new Request("https://rugspull.test/api/indexer/status"),
      env({ INDEXER_STALE_BLOCKS: "1200" }, db),
    ));
    expect(normal).toMatchObject({ staleBlockThreshold: 1200, warnings: [] });

    const strict = await json(await worker.fetch(
      new Request("https://rugspull.test/api/indexer/status"),
      env({ INDEXER_STALE_BLOCKS: "500" }, db),
    ));
    expect(strict.warnings).toEqual([`Factory ${factory} indexer is 700 blocks behind.`]);
  });

  it("registers a rug cache row from verified chain reads without log indexing", async () => {
    const db = new MemoryD1();
    const createdLog = eventLog(factory, 101, 0, "0x21", rugFactoryAbi, "RugCreated", {
      rug,
      creator,
      name: "Mock Rug",
      symbol: "MOCK",
      creatorStake: 1000000000000000n,
      openingEnd: 200,
      metadataHash,
      disclosureHash,
    });
    mockRugReads({
      factory,
      creator,
      status: 0,
      token: "0x0000000000000000000000000000000000000000" as Address,
      pool: "0x0000000000000000000000000000000000000000" as Address,
      metadataURI: "r2://metadata/mock.json",
      creatorStake: 1000000000000000n,
      totalContributed: 0n,
      acceptedContribution: 0n,
      founderRemaining: 500000000000000000000000000n,
      openingStart: 100n,
      openingEnd: 200n,
      founderUnlockTime: 300n,
      latestBlock: 150,
      createdLog,
    });

    const response = await worker.fetch(
      new Request("https://rugspull.test/api/indexer/register-rug", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rug, txHash: createdLog.transactionHash }),
      }),
      env({}, db),
    );

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({ ok: true, rug: rug.toLowerCase(), status: "Opening" });
    expect(db.rugs.get(db.rugKey(97, rug))).toMatchObject({
      rug_address: rug.toLowerCase(),
      creator: creator.toLowerCase(),
      status: "Opening",
      metadata_uri: "r2://metadata/mock.json",
      name: "Mock Rug",
      symbol: "MOCK",
      creator_stake: "1000000000000000",
      created_block: 101,
    });
  });

  it("rejects cache registration without a verified create transaction", async () => {
    const response = await worker.fetch(
      new Request("https://rugspull.test/api/indexer/register-rug", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rug, blockNumber: 999_999_999 }),
      }),
      env(),
    );
    expect(response.status).toBe(400);
    expect((await json(response)).error).toContain("transaction hash");
  });

  it("finalizes metadata with deterministic hash and r2 uri", async () => {
    const response = await worker.fetch(
      new Request("https://rugspull.test/api/metadata/finalize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          symbol: "META",
          name: "Meta Test",
          image: "https://example.com/image.png",
          description: "Transparent test metadata",
        }),
      }),
      env(),
    );
    expect(response.status).toBe(200);
    const body = await json(response);
    expect(body.hash).toBe("0x8fb33d3e507a060f4d12aa49fa5d3fd4dc9158aafafdf8eb4d854409f516d205");
    expect(body.uri).toBe(`r2://metadata/${body.hash}.json`);
  });

  it("canonicalizes metadata before hashing and storing", async () => {
    const db = new MemoryD1();
    const r2 = new MemoryR2();
    const first = await worker.fetch(
      new Request("https://rugspull.test/api/metadata/finalize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          symbol: "META",
          name: "Meta Test",
          attributes: [{ value: "One-shot", trait_type: "Founder Sell Mode" }],
          image: "https://example.com/image.png",
          description: "Transparent test metadata",
        }),
      }),
      env({ R2: r2 as unknown as R2Bucket }, db),
    );
    const second = await worker.fetch(
      new Request("https://rugspull.test/api/metadata/finalize", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          description: "Transparent test metadata",
          image: "https://example.com/image.png",
          attributes: [{ trait_type: "Founder Sell Mode", value: "One-shot" }],
          name: "Meta Test",
          symbol: "META",
        }),
      }),
      env({ R2: r2 as unknown as R2Bucket }, db),
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const firstBody = await json(first);
    const secondBody = await json(second);
    expect(secondBody).toMatchObject({ hash: firstBody.hash, uri: firstBody.uri, byteSize: firstBody.byteSize });
    expect(r2.objects.size).toBe(1);
    const key = `metadata/${firstBody.hash}.json`;
    expect(r2.objects.get(key)?.value).toBe(
      '{"attributes":[{"trait_type":"Founder Sell Mode","value":"One-shot"}],"description":"Transparent test metadata","image":"https://example.com/image.png","name":"Meta Test","symbol":"META"}',
    );
  });

  it("rejects invalid metadata", async () => {
    const response = await worker.fetch(
      new Request("https://rugspull.test/api/metadata/finalize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Missing fields" }),
      }),
      env(),
    );
    expect(response.status).toBe(400);
  });

  it("fails closed when upload protection is not configured", async () => {
    const response = await worker.fetch(
      new Request("https://rugspull.test/api/metadata/finalize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          symbol: "META",
          name: "Meta Test",
          image: "https://example.com/image.png",
          description: "Transparent test metadata",
        }),
      }),
      env({ ALLOW_UNPROTECTED_UPLOADS: undefined }),
    );
    expect(response.status).toBe(503);
    expect(await json(response)).toMatchObject({
      error: "Metadata uploads are disabled until Turnstile is configured",
    });
  });

  it("requires turnstile when metadata upload protection is configured", async () => {
    const missing = await worker.fetch(
      new Request("https://rugspull.test/api/metadata/finalize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          symbol: "META",
          name: "Meta Test",
          image: "https://example.com/image.png",
          description: "Transparent test metadata",
        }),
      }),
      env({ TURNSTILE_SECRET: "secret" }),
    );
    expect(missing.status).toBe(403);

    mockTurnstile(true);
    const ok = await worker.fetch(
      new Request("https://rugspull.test/api/metadata/finalize", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-turnstile-response": "token",
        },
        body: JSON.stringify({
          symbol: "META",
          name: "Meta Test",
          image: "https://example.com/image.png",
          description: "Transparent test metadata",
        }),
      }),
      env({ TURNSTILE_SECRET: "secret" }),
    );
    expect(ok.status).toBe(200);
  });

  it("finalizes image and metadata with one Turnstile validation", async () => {
    const db = new MemoryD1();
    const r2 = new MemoryR2();
    const form = new FormData();
    form.set("metadata", JSON.stringify({
      symbol: "BUNDLE",
      name: "Bundle Test",
      image: "",
      description: "One protected upload request",
    }));
    form.set("image", new File([validPngBytes()], "rug.png", { type: "image/png" }));
    mockTurnstile(true);

    const response = await worker.fetch(
      new Request("https://rugspull.test/api/uploads/finalize", {
        method: "POST",
        headers: { "cf-turnstile-response": "one-use-token" },
        body: form,
      }),
      env({ TURNSTILE_SECRET: "secret", R2: r2 as unknown as R2Bucket }, db),
    );

    expect(response.status).toBe(200);
    const body = await json(response);
    expect(body.uri).toMatch(/^r2:\/\/metadata\/0x[a-f0-9]{64}\.json$/);
    expect(body.image).toMatchObject({ mimeType: "image/png" });
    expect(r2.objects.size).toBe(2);
    expect(vi.mocked(globalThis.fetch).mock.calls).toHaveLength(1);
  });

  it("finalizes image assets into immutable r2 objects", async () => {
    const db = new MemoryD1();
    const r2 = new MemoryR2();
    const imageBytes = validPngBytes();
    const response = await worker.fetch(
      new Request("https://rugspull.test/api/assets/finalize", {
        method: "POST",
        headers: { "content-type": "image/png" },
        body: imageBytes,
      }),
      env({ R2: r2 as unknown as R2Bucket }, db),
    );
    expect(response.status).toBe(200);
    const body = await json(response);
    const expectedHash = keccak256(bytesToHex(imageBytes));
    expect(body).toMatchObject({
      hash: expectedHash,
      uri: `r2://assets/${expectedHash}.png`,
      mimeType: "image/png",
      byteSize: imageBytes.byteLength,
    });
    expect(r2.objects.has(`assets/${expectedHash}.png`)).toBe(true);
    expect(db.metadata.get(expectedHash)).toMatchObject({
      hash: expectedHash,
      key: `assets/${expectedHash}.png`,
      mimeType: "image/png",
      byteSize: imageBytes.byteLength,
    });
  });

  it("serves immutable r2 metadata and asset objects", async () => {
    const db = new MemoryD1();
    const r2 = new MemoryR2();
    const metadataResponse = await worker.fetch(
      new Request("https://rugspull.test/api/metadata/finalize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          symbol: "META",
          name: "Meta Test",
          image: "r2://assets/0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png",
          description: "Transparent test metadata",
        }),
      }),
      env({ R2: r2 as unknown as R2Bucket }, db),
    );
    const metadata = await json(metadataResponse);
    const metadataGet = await worker.fetch(new Request(`https://rugspull.test/api/r2/metadata/${metadata.hash}.json`), env({ R2: r2 as unknown as R2Bucket }, db));
    expect(metadataGet.status).toBe(200);
    expect(metadataGet.headers.get("content-type")).toContain("application/json");
    expect(await metadataGet.json()).toMatchObject({ name: "Meta Test", symbol: "META" });

    const imageBytes = validPngBytes();
    const assetResponse = await worker.fetch(
      new Request("https://rugspull.test/api/assets/finalize", {
        method: "POST",
        headers: { "content-type": "image/png" },
        body: imageBytes,
      }),
      env({ R2: r2 as unknown as R2Bucket }, db),
    );
    const asset = await json(assetResponse);
    const assetGet = await worker.fetch(new Request(`https://rugspull.test/api/r2/assets/${asset.hash}.png`), env({ R2: r2 as unknown as R2Bucket }, db));
    expect(assetGet.status).toBe(200);
    expect(assetGet.headers.get("content-type")).toBe("image/png");
    expect(assetGet.headers.get("x-content-type-options")).toBe("nosniff");
    expect(assetGet.headers.get("content-security-policy")).toContain("sandbox");
    expect(new Uint8Array(await assetGet.arrayBuffer())).toEqual(imageBytes);

    const invalid = await worker.fetch(new Request("https://rugspull.test/api/r2/private/secret.json"), env({ R2: r2 as unknown as R2Bucket }, db));
    expect(invalid.status).toBe(400);
  });

  it("requires turnstile when image upload protection is configured", async () => {
    const missing = await worker.fetch(
      new Request("https://rugspull.test/api/assets/finalize", {
        method: "POST",
        headers: { "content-type": "image/png" },
        body: new Uint8Array([1, 2, 3]),
      }),
      env({ TURNSTILE_SECRET: "secret" }),
    );
    expect(missing.status).toBe(403);

    mockTurnstile(false);
    const failed = await worker.fetch(
      new Request("https://rugspull.test/api/assets/finalize", {
        method: "POST",
        headers: {
          "content-type": "image/png",
          "x-turnstile-token": "bad",
        },
        body: new Uint8Array([1, 2, 3]),
      }),
      env({ TURNSTILE_SECRET: "secret" }),
    );
    expect(failed.status).toBe(403);
  });

  it("rejects unsupported or oversized image assets", async () => {
    const badMime = await worker.fetch(
      new Request("https://rugspull.test/api/assets/finalize", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "not an image",
      }),
      env(),
    );
    expect(badMime.status).toBe(415);

    const oversized = await worker.fetch(
      new Request("https://rugspull.test/api/assets/finalize", {
        method: "POST",
        headers: { "content-type": "image/png" },
        body: new Uint8Array(2 * 1024 * 1024 + 1),
      }),
      env(),
    );
    expect(oversized.status).toBe(413);

    const svg = await worker.fetch(
      new Request("https://rugspull.test/api/assets/finalize", {
        method: "POST",
        headers: { "content-type": "image/svg+xml" },
        body: "<svg><script>alert(1)</script></svg>",
      }),
      env(),
    );
    expect(svg.status).toBe(415);

    const mismatched = await worker.fetch(
      new Request("https://rugspull.test/api/assets/finalize", {
        method: "POST",
        headers: { "content-type": "image/png" },
        body: "not a png",
      }),
      env(),
    );
    expect(mismatched.status).toBe(415);
  });

  it("indexes factory and rug events from JSON-RPC logs", async () => {
    const db = new MemoryD1();
    const logs = [
      eventLog(factory, 101, 0, "0x01", rugFactoryAbi, "RugCreated", {
        rug,
        creator,
        name: "Mock Rug",
        symbol: "MOCK",
        creatorStake: 1000000000000000n,
        openingEnd: 120,
        metadataHash,
        disclosureHash,
      }),
      eventLog(rug, 110, 0, "0x02", rugInstanceAbi, "Contributed", {
        rug,
        user,
        amount: 2000000000000000n,
      }),
      eventLog(rug, 121, 0, "0x03", rugInstanceAbi, "LaunchSucceeded", {
        rug,
        token,
        pool,
        totalContributed: 2000000000000000n,
        acceptedContribution: 2000000000000000n,
        openingTokenAllocation: 400000000000000000000000n,
        poolTokenReserve: 400000000000000000000000n,
        poolQuoteReserve: 2000000000000000n,
        founderAllocation: 200000000000000000000000n,
      }),
      eventLog(rug, 130, 0, "0x04", rugInstanceAbi, "RugPulled", {
        rug,
        creator,
        founderTokensSold: 200000000000000000000000n,
        quoteOut: 900000000000000n,
      }),
      eventLog(pool, 131, 0, "0x05", rugPoolAbi, "Swap", {
        pool,
        sender: user,
        to: user,
        isBuy: true,
        amountIn: 100000000000000n,
        amountOut: 19000000000000000000000n,
        protocolFeeQuote: 50000000000n,
        reserveToken: 581000000000000000000000n,
        reserveQuote: 1100000000000000n,
      }),
    ];
    mockRpc(logs);

    const run = await worker.fetch(new Request("https://rugspull.test/api/indexer/run", {
      method: "POST",
      headers: { authorization: "Bearer test-admin" },
    }), env({ ADMIN_TOKEN: "test-admin" }, db));
    expect(run.status).toBe(200);
    expect(await json(run)).toMatchObject({ ok: true, indexed: 5, warnings: [] });

    const list = await json(await worker.fetch(new Request("https://rugspull.test/api/rugs?limit=10"), env({}, db)));
    expect(list.rugs).toHaveLength(1);
    expect((list.rugs as RugRow[])[0]).toMatchObject({
      rug_address: rug.toLowerCase(),
      creator: creator.toLowerCase(),
      status: "Rugged",
      name: "Mock Rug",
      symbol: "MOCK",
      metadata_uri: "r2://metadata/mock.json",
      token_address: token.toLowerCase(),
      pool_address: pool.toLowerCase(),
      total_contributed: "2000000000000000",
      founder_remaining: "0",
      opening_start: 100,
      founder_unlock_time: 220,
    });

    const detail = await json(await worker.fetch(new Request(`https://rugspull.test/api/rugs/97/${rug}`), env({}, db)));
    expect((detail.rug as RugRow).status).toBe("Rugged");

    const events = await json(await worker.fetch(new Request(`https://rugspull.test/api/rugs/97/${rug}/events`), env({}, db)));
    expect((events.events as EventRow[]).map((event) => event.event_name)).toEqual([
      "RugCreated",
      "Contributed",
      "LaunchSucceeded",
      "RugPulled",
      "Swap",
    ]);

    const market = await json(await worker.fetch(
      new Request(`https://rugspull.test/api/rugs/97/${rug}/market`),
      env({}, db),
    ));
    expect(market).toMatchObject({
      chainId: 97,
      rug: rug.toLowerCase(),
      source: "indexed BSC events",
      stats: {
        tradeCount: 1,
        buyQuoteVolume: "100000000000000",
        sellQuoteVolume: "0",
        protocolFeeQuote: "50000000000",
        complete: true,
        visiblePointCount: 2,
      },
    });
    expect((market.points as Array<Record<string, unknown>>).map((point) => point.side)).toEqual(["launch", "buy"]);
    expect((market.points as Array<Record<string, unknown>>).every((point) => typeof point.timestamp === "number")).toBe(true);
    expect(market.markers).toMatchObject([{ type: "rugPull", blockNumber: 130 }]);

    const sparkline = await json(await worker.fetch(
      new Request(`https://rugspull.test/api/market/sparklines?chainId=97&rugs=${rug}`),
      env({}, db),
    ));
    expect((sparkline.sparklines as Record<string, string[]>)[rug.toLowerCase()]).toHaveLength(2);

    db.sync.clear();
    const replay = await worker.fetch(new Request("https://rugspull.test/api/indexer/run", {
      method: "POST",
      headers: { authorization: "Bearer test-admin" },
    }), env({ ADMIN_TOKEN: "test-admin" }, db));
    expect(await json(replay)).toMatchObject({ ok: true, indexed: 0, warnings: [] });
    expect(db.rugs.get(db.rugKey(97, rug))?.total_contributed).toBe("2000000000000000");
    expect(db.events).toHaveLength(5);
    expect(db.marketStats.get(db.marketKey(97, rug))).toMatchObject({
      trade_count: 1,
      protocol_fee_quote: "50000000000",
    });

    const status = await json(await worker.fetch(new Request("https://rugspull.test/api/indexer/status"), env({}, db)));
    expect(status).toMatchObject({ chainId: 97, latestBlock: 200, warnings: [] });
    expect((status.sync as SyncRow[]).map((row) => row.contract_address).sort()).toEqual([
      factory.toLowerCase(),
      pool.toLowerCase(),
      rug.toLowerCase(),
    ].sort());
  });

  it("validates batch sparkline requests", async () => {
    const invalid = await worker.fetch(
      new Request("https://rugspull.test/api/market/sparklines?chainId=97&rugs=not-an-address"),
      env(),
    );
    expect(invalid.status).toBe(400);

    const tooMany = Array.from({ length: 25 }, (_, index) => `0x${(index + 1).toString(16).padStart(40, "0")}`).join(",");
    const oversized = await worker.fetch(
      new Request(`https://rugspull.test/api/market/sparklines?chainId=97&rugs=${tooMany}`),
      env(),
    );
    expect(oversized.status).toBe(400);
  });

  it("indexes failed launch recovery events", async () => {
    const db = new MemoryD1();
    const logs = [
      eventLog(factory, 101, 0, "0x11", rugFactoryAbi, "RugCreated", {
        rug: failedRug,
        creator,
        name: "Failed Rug",
        symbol: "FAIL",
        creatorStake: 1000000000000000n,
        openingEnd: 120,
        metadataHash,
        disclosureHash,
      }),
      eventLog(failedRug, 121, 0, "0x12", rugInstanceAbi, "LaunchFailed", {
        rug: failedRug,
        totalContributed: 100000000000000n,
        minLaunchAmount: 200000000000000n,
      }),
      eventLog(failedRug, 122, 0, "0x13", rugInstanceAbi, "ClaimedFailedRefund", {
        rug: failedRug,
        user,
        amount: 100000000000000n,
      }),
      eventLog(failedRug, 123, 0, "0x14", rugInstanceAbi, "CreatorStakeWithdrawn", {
        rug: failedRug,
        creator,
        amount: 1000000000000000n,
      }),
    ];
    mockRpc(logs);

    const run = await worker.fetch(new Request("https://rugspull.test/api/indexer/run", {
      method: "POST",
      headers: { authorization: "Bearer test-admin" },
    }), env({ ADMIN_TOKEN: "test-admin" }, db));
    expect(run.status).toBe(200);
    expect(await json(run)).toMatchObject({ ok: true, indexed: 4, warnings: [] });

    const detail = await json(await worker.fetch(new Request(`https://rugspull.test/api/rugs/97/${failedRug}`), env({}, db)));
    expect(detail.rug).toMatchObject({
      rug_address: failedRug.toLowerCase(),
      status: "Failed",
      total_contributed: "100000000000000",
    });

    const events = await json(await worker.fetch(new Request(`https://rugspull.test/api/rugs/97/${failedRug}/events`), env({}, db)));
    expect((events.events as EventRow[]).map((event) => event.event_name)).toEqual([
      "RugCreated",
      "LaunchFailed",
      "ClaimedFailedRefund",
      "CreatorStakeWithdrawn",
    ]);
  });

  it("runs the indexer from the scheduled cron handler", async () => {
    const db = new MemoryD1();
    const waits: Promise<unknown>[] = [];
    mockRpc([]);

    await worker.scheduled({} as ScheduledEvent, env({ ADMIN_TOKEN: "secret" }, db), {
      waitUntil: (promise: Promise<unknown>) => waits.push(promise),
      passThroughOnException: () => undefined,
    } as unknown as ExecutionContext);
    await Promise.all(waits);

    expect(db.sync.get(db.syncKey(97, factory))?.last_scanned_block).toBe(201);
  });
});

function normalize(sql: string) {
  return sql.toLowerCase().replace(/\s+/g, " ").trim();
}

function sortRugs(rows: RugRow[], limit: number, offset: number) {
  return rows.sort((a, b) => b.updated_block - a.updated_block).slice(offset, offset + limit);
}

function requireRug(db: MemoryD1, chain: number, rugAddress: string) {
  const row = db.rugs.get(db.rugKey(chain, rugAddress));
  if (!row) throw new Error(`Missing rug row ${rugAddress}`);
  return row;
}

function eventLog(
  address: Address,
  block: number,
  logIndex: number,
  txSuffix: string,
  abi: typeof rugFactoryAbi | typeof rugInstanceAbi | typeof rugPoolAbi,
  eventName: string,
  args: Record<string, unknown>,
): RpcLog {
  const event = abi.find((item) => item.type === "event" && item.name === eventName);
  if (!event || event.type !== "event") throw new Error(`Missing event ${eventName}`);
  const topics = encodeEventTopics({ abi, eventName, args } as never);
  const dataInputs = event.inputs.filter((input) => !input.indexed);
  return {
    address,
    blockNumber: numberToHex(block),
    transactionHash: `0x${txSuffix.slice(2).padStart(64, "0")}`,
    logIndex: numberToHex(logIndex),
    topics: topics as [`0x${string}`, ...`0x${string}`[]],
    data: encodeAbiParameters(
      dataInputs.map((input) => ({ type: input.type, name: input.name })),
      dataInputs.map((input) => args[input.name]),
    ),
  };
}

function mockRpc(logs: RpcLog[]) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
    const body = JSON.parse(init?.body as string) as {
      method: string;
      params: unknown[];
      id: number;
    };
    if (body.method === "eth_blockNumber") {
      return rpcResponse(body.id, numberToHex(200));
    }
    if (body.method === "eth_getBlockByNumber") {
      const block = hexToNumber(body.params[0] as `0x${string}`);
      return rpcResponse(body.id, { timestamp: numberToHex(1_700_000_000 + block) });
    }
    if (body.method === "eth_call") {
      const call = body.params[0] as { data: `0x${string}` };
      const decoded = decodeFunctionData({ abi: rugInstanceAbi, data: call.data });
      if (decoded.functionName === "openingStart") {
        return rpcResponse(body.id, encodeFunctionResult({
          abi: rugInstanceAbi,
          functionName: "openingStart",
          result: 100,
        }));
      }
      if (decoded.functionName === "founderUnlockTime") {
        return rpcResponse(body.id, encodeFunctionResult({
          abi: rugInstanceAbi,
          functionName: "founderUnlockTime",
          result: 220,
        }));
      }
      return rpcResponse(
        body.id,
        encodeFunctionResult({
          abi: rugInstanceAbi,
          functionName: "metadataURI",
          result: "r2://metadata/mock.json",
        }),
      );
    }
    if (body.method === "eth_getLogs") {
      const filter = body.params[0] as {
        address: Address;
        fromBlock: `0x${string}`;
        toBlock: `0x${string}`;
        topics?: `0x${string}`[];
      };
      const from = hexToNumber(filter.fromBlock);
      const to = hexToNumber(filter.toBlock);
      const topic0 = filter.topics?.[0]?.toLowerCase();
      return rpcResponse(body.id, logs.filter((log) => {
        const block = hexToNumber(log.blockNumber);
        return log.address.toLowerCase() === filter.address.toLowerCase()
          && block >= from
          && block <= to
          && (!topic0 || log.topics[0].toLowerCase() === topic0);
      }));
    }
    return rpcResponse(body.id, null);
  });
}

function mockRugReads(values: {
  factory: Address;
  creator: Address;
  status: number;
  token: Address;
  pool: Address;
  metadataURI: string;
  creatorStake: bigint;
  totalContributed: bigint;
  acceptedContribution: bigint;
  founderRemaining: bigint;
  openingStart: bigint;
  openingEnd: bigint;
  founderUnlockTime: bigint;
  latestBlock: number;
  createdLog: RpcLog;
}) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
    const body = JSON.parse(init?.body as string) as {
      method: string;
      params: unknown[];
      id: number;
    };
    if (body.method === "eth_blockNumber") {
      return rpcResponse(body.id, numberToHex(values.latestBlock));
    }
    if (body.method === "eth_getTransactionReceipt") {
      return rpcResponse(body.id, {
        blockNumber: values.createdLog.blockNumber,
        transactionHash: values.createdLog.transactionHash,
        logs: [values.createdLog],
      });
    }
    if (body.method !== "eth_call") return rpcResponse(body.id, null);
    const call = body.params[0] as { data: `0x${string}` };
    const decoded = decodeFunctionData({ abi: rugInstanceAbi, data: call.data });
    const result = values[decoded.functionName as keyof typeof values];
    if (typeof result === "string" && result.startsWith("0x") && result.length === 42) {
      return rpcResponse(body.id, encodeFunctionResult({
        abi: rugInstanceAbi,
        functionName: decoded.functionName,
        result,
      } as never));
    }
    return rpcResponse(body.id, encodeFunctionResult({
      abi: rugInstanceAbi,
      functionName: decoded.functionName,
      result,
    } as never));
  });
}

function mockTurnstile(success: boolean) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => (
    new Response(JSON.stringify({ success }))
  ));
}

function validPngBytes() {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
}

function rpcResponse(id: number, result: unknown) {
  return Promise.resolve(new Response(JSON.stringify({ jsonrpc: "2.0", id, result })));
}

function rpcError(id: number, message: string) {
  return Promise.resolve(new Response(JSON.stringify({ jsonrpc: "2.0", id, error: { message } })));
}
