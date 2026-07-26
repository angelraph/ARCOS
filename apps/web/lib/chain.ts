import "./loadServerEnv"; // must run before @arcos/shared evaluates process.env-derived addresses
import { createPublicClient, http, decodeEventLog, formatUnits, type AbiEvent, type Log } from "viem";
import { arcTestnet } from "viem/chains";
import { unstable_cache } from "next/cache";
import { TreasuryPolicyAbi, EscrowAbi, DecisionLedgerAbi, addresses, ActionType, DEPLOYMENT_BLOCK } from "@arcos/shared";

// Every dashboard view previously re-scanned the full on-chain history from
// DEPLOYMENT_BLOCK to the current tip on every request (revalidate = 0 on the page).
// That scan's cost — and its RPC call volume against Arc Testnet's rate-limited public
// endpoint — only grows as the chain grows, so it gets more likely to trip "request limit
// reached" over time, not less. Cache each read for a short window so concurrent/repeat
// visitors share one scan instead of each triggering their own burst of calls.
const CACHE_SECONDS = 15;

// Arc Testnet's default RPC endpoint rate-limits under concurrent load (observed directly —
// a handful of parallel eth_call reads on dashboard load was enough to trigger it). Retry
// with backoff rather than fail the whole page; batch is also enabled to collapse the
// per-bucket/per-spend read loops into fewer HTTP round-trips.
export const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(process.env.ARC_TESTNET_RPC_URL ?? "https://rpc.testnet.arc.network", {
    retryCount: 5,
    retryDelay: 500,
  }),
  batch: { multicall: true },
});

const BUCKET_NAMES = ["Tax", "Payroll", "Operating", "Procurement"] as const;

// Arc Testnet's default RPC returns "request limit reached" (code -32011) as a normal
// JSON-RPC response body, not a network-level failure — viem's own retryCount/retryDelay
// don't retry that (they're for transport-level failures). Retry it ourselves, with
// exponential (not linear) backoff — a burst of concurrent dashboard loads needs more
// runway to clear than a single slow request does.
async function withRetry<T>(fn: () => Promise<T>, attempts = 8, baseDelayMs = 500): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes("request limit")) throw err;
      await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** i));
    }
  }
  throw lastError;
}

// Arc Testnet's eth_getLogs caps ranges at 10,000 blocks.
const MAX_LOG_RANGE = 9_999n;

async function getLogsRange(params: { address: `0x${string}`; event: AbiEvent }, fromBlock: bigint, toBlock: bigint): Promise<Log[]> {
  const logs: Log[] = [];
  for (let from = fromBlock; from <= toBlock; from += MAX_LOG_RANGE + 1n) {
    const to = from + MAX_LOG_RANGE > toBlock ? toBlock : from + MAX_LOG_RANGE;
    const chunk = await withRetry(() =>
      publicClient.getLogs({ address: params.address, event: params.event, fromBlock: from, toBlock: to }),
    );
    logs.push(...chunk);
  }
  return logs;
}

// Scanning the full history from DEPLOYMENT_BLOCK on every request means the RPC call
// volume — and the odds of tripping Arc Testnet's rate limit — grows forever as the chain
// grows. Keep an incremental, per-instance cache of "logs found so far" + "highest block
// scanned" per (address, event) pair, so steady-state reads only ever fetch the small
// delta since the last successful scan, not the whole history. In-flight promises are
// also deduped so concurrent requests on a warm instance share one fetch instead of each
// re-scanning independently.
interface LogCacheEntry {
  logs: Log[];
  scannedTo: bigint;
  lastFetch: number;
}
const logCache = new Map<string, LogCacheEntry>();
const logCacheInFlight = new Map<string, Promise<Log[]>>();

async function getLogsIncremental(cacheKey: string, params: { address: `0x${string}`; event: AbiEvent }): Promise<Log[]> {
  const cached = logCache.get(cacheKey);
  if (cached && Date.now() - cached.lastFetch < CACHE_SECONDS * 1000) {
    return cached.logs;
  }

  const inFlight = logCacheInFlight.get(cacheKey);
  if (inFlight) return inFlight;

  const promise = (async () => {
    try {
      const latest = await withRetry(() => publicClient.getBlockNumber());
      const fromBlock = cached ? cached.scannedTo + 1n : DEPLOYMENT_BLOCK;

      const newLogs = fromBlock <= latest ? await getLogsRange(params, fromBlock, latest) : [];
      const merged = cached ? [...cached.logs, ...newLogs] : newLogs;
      logCache.set(cacheKey, { logs: merged, scannedTo: latest, lastFetch: Date.now() });
      return merged;
    } finally {
      logCacheInFlight.delete(cacheKey);
    }
  })();

  logCacheInFlight.set(cacheKey, promise);
  return promise;
}

export interface BucketState {
  name: string;
  balanceUsdc: string;
}

export const getBuckets = unstable_cache(
  async (): Promise<BucketState[]> => {
    const result: BucketState[] = [];
    for (const [i, name] of BUCKET_NAMES.entries()) {
      const balance = await withRetry(() =>
        publicClient.readContract({
          address: addresses.treasuryPolicy as `0x${string}`,
          abi: TreasuryPolicyAbi,
          functionName: "bucketBalance",
          args: [i],
        }),
      );
      result.push({ name, balanceUsdc: formatUnits(balance as bigint, 6) });
    }
    return result;
  },
  ["arcos-buckets"],
  { revalidate: CACHE_SECONDS },
);

export interface DecisionRow {
  decisionId: string;
  agentId: string;
  actionType: string;
  rationaleHash: `0x${string}`;
  txRef: `0x${string}`;
  timestamp: string;
  recordedBy: `0x${string}`;
  ledgerTxHash: `0x${string}`;
}

function bytes32ToAsciiLabel(hex: `0x${string}`): string {
  const bytes = Buffer.from(hex.slice(2), "hex");
  const trimmed = bytes.subarray(0, bytes.findIndex((b) => b === 0) === -1 ? bytes.length : bytes.findIndex((b) => b === 0));
  return trimmed.toString("utf8") || hex;
}

export async function getDecisions(): Promise<DecisionRow[]> {
  const logs = await getLogsIncremental("decisions", {
    address: addresses.decisionLedger as `0x${string}`,
    event: {
      type: "event",
      name: "DecisionRecorded",
      inputs: [
        { name: "decisionId", type: "uint256", indexed: true },
        { name: "agentId", type: "bytes32", indexed: true },
        { name: "actionType", type: "uint8", indexed: false },
        { name: "rationaleHash", type: "bytes32", indexed: false },
        { name: "txRef", type: "bytes32", indexed: false },
        { name: "timestamp", type: "uint256", indexed: false },
        { name: "recordedBy", type: "address", indexed: false },
      ],
    },
  });

  return logs
    .map((log) => {
      const decoded = decodeEventLog({ abi: DecisionLedgerAbi, data: log.data, topics: log.topics });
      const args = decoded.args as unknown as {
        decisionId: bigint;
        agentId: `0x${string}`;
        actionType: number;
        rationaleHash: `0x${string}`;
        txRef: `0x${string}`;
        timestamp: bigint;
        recordedBy: `0x${string}`;
      };
      return {
        decisionId: args.decisionId.toString(),
        agentId: bytes32ToAsciiLabel(args.agentId),
        actionType: ActionType[args.actionType] ?? String(args.actionType),
        rationaleHash: args.rationaleHash,
        txRef: args.txRef,
        timestamp: new Date(Number(args.timestamp) * 1000).toISOString(),
        recordedBy: args.recordedBy,
        ledgerTxHash: log.transactionHash as `0x${string}`,
      };
    })
    .sort((a, b) => Number(b.decisionId) - Number(a.decisionId));
}

export interface PendingSpendRow {
  spendId: string;
  to: `0x${string}`;
  amountUsdc: string;
  bucketIndex: number;
  approved: boolean;
  executed: boolean;
}

export const getPendingSpends = unstable_cache(
  async (): Promise<PendingSpendRow[]> => {
    const count = (await withRetry(() =>
      publicClient.readContract({
        address: addresses.treasuryPolicy as `0x${string}`,
        abi: TreasuryPolicyAbi,
        functionName: "pendingSpendCount",
      }),
    )) as bigint;

    const spends: PendingSpendRow[] = [];
    for (let i = 0; i < Number(count); i++) {
      const spendId = BigInt(i);
      const result = (await withRetry(() =>
        publicClient.readContract({
          address: addresses.treasuryPolicy as `0x${string}`,
          abi: TreasuryPolicyAbi,
          functionName: "pendingSpends",
          args: [spendId],
        }),
      )) as readonly [string, bigint, number, `0x${string}`, boolean, boolean];

      spends.push({
        spendId: spendId.toString(),
        to: result[0] as `0x${string}`,
        amountUsdc: formatUnits(result[1], 6),
        bucketIndex: result[2],
        approved: result[4],
        executed: result[5],
      });
    }

    return spends.reverse();
  },
  ["arcos-pending-spends"],
  { revalidate: CACHE_SECONDS },
);

export interface EscrowPayment {
  paymentId: string;
  to: `0x${string}`;
  amountUsdc: string;
  refundTo: `0x${string}`;
  refunded: boolean;
  withdrawn: boolean;
}

export async function getEscrowPayments(): Promise<EscrowPayment[]> {
  const logs = await getLogsIncremental("escrow-payments", {
    address: addresses.escrow as `0x${string}`,
    event: {
      type: "event",
      name: "PaymentCreated",
      inputs: [
        { name: "paymentID", type: "uint256", indexed: true },
        { name: "to", type: "address", indexed: true },
        { name: "amount", type: "uint256", indexed: false },
        { name: "releaseTimestamp", type: "uint256", indexed: false },
        { name: "refundTo", type: "address", indexed: true },
      ],
    },
  });

  const payments: EscrowPayment[] = [];
  for (const log of logs) {
    const decoded = decodeEventLog({ abi: EscrowAbi, data: log.data, topics: log.topics });
    const args = decoded.args as unknown as { paymentID: bigint; to: `0x${string}`; amount: bigint; refundTo: `0x${string}` };

    const onChainPayment = (await withRetry(() =>
      publicClient.readContract({
        address: addresses.escrow as `0x${string}`,
        abi: EscrowAbi,
        functionName: "payments",
        args: [args.paymentID],
      }),
    )) as readonly [string, bigint, bigint, string, bigint, boolean];

    payments.push({
      paymentId: args.paymentID.toString(),
      to: args.to,
      amountUsdc: formatUnits(args.amount, 6),
      refundTo: args.refundTo,
      refunded: onChainPayment[5],
      withdrawn: onChainPayment[4] > 0n, // withdrawnAmount
    });
  }

  return payments.sort((a, b) => Number(b.paymentId) - Number(a.paymentId));
}
