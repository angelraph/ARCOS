import "./loadServerEnv"; // must run before @arcos/shared evaluates process.env-derived addresses
import { createPublicClient, http, decodeEventLog, formatUnits, formatEther, erc20Abi, type AbiEvent, type Log } from "viem";
import { arcTestnet } from "viem/chains";
import { unstable_cache } from "next/cache";
import { TreasuryPolicyAbi, EscrowAbi, DecisionLedgerAbi, addresses, ActionType, DEPLOYMENT_BLOCK, ARC_TESTNET_USDC } from "@arcos/shared";

// Current chain state (bucket balances, pending spends) changes only when a run happens,
// but a stale dashboard is confusing right after one — a short window keeps it fresh
// without every visitor triggering their own round of reads.
const CACHE_SECONDS = 15;

// How often the *expensive* part of the historical event scans below (DEPLOYMENT_BLOCK to
// a recent checkpoint) gets recomputed. Kept short enough that the always-fresh "tail"
// scan (checkpoint to current latest, see getDecisions/getEscrowPayments) stays cheap --
// at most this many minutes' worth of new blocks, one getLogs call in practice -- while
// still being long enough that concurrent visitors and back-to-back demo runs share one
// recompute instead of each paying for it. This used to be keyed on decisionCount()
// instead of time, so every single new decision anywhere forced a full DEPLOYMENT_BLOCK
// rescan -- measured directly against production at up to 60s per request once enough
// history had built up. That's fixed now; this window is just how long the historical
// checkpoint can lag, not how stale the visible data can be (the tail always covers that).
const HISTORICAL_CHECKPOINT_REVALIDATE_SECONDS = 20 * 60;

// Arc's own primary RPC (rpc.testnet.arc.network) rate-limits after just 3-5 sequential
// eth_getLogs calls (observed directly) — unusable for scanning hundreds of thousands of
// blocks in 10k-block chunks. dRPC's mirror handled 90 sequential calls with zero errors
// in the same test. See docs/circle-feedback.md.
export const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(process.env.ARC_TESTNET_RPC_URL ?? "https://rpc.drpc.testnet.arc.io", {
    retryCount: 5,
    retryDelay: 500,
  }),
  batch: { multicall: true },
});

const BUCKET_NAMES = ["Tax", "Payroll", "Operating", "Procurement"] as const;

// Belt-and-suspenders: dRPC hasn't shown rate-limit errors in testing, but if any provider
// ever returns "request limit reached" (code -32011) as a normal JSON-RPC response body,
// it's not a network-level failure, so viem's own retryCount/retryDelay won't retry it.
async function withRetry<T>(fn: () => Promise<T>, attempts = 5, baseDelayMs = 400): Promise<T> {
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

export interface AgentWallet {
  role: string;
  address: `0x${string}` | null;
  nativeBalance: string;
  usdcBalance: string;
  low: boolean;
}

// Only Customer is a one-way drain: every /run click pulls its "customer payment" out of
// this one shared wallet and nothing in the flow ever pays it back (Treasury/Procurement/
// Supplier/Governance mostly circulate the same funds among themselves). It's the one that
// actually needs periodic top-ups from the Circle faucet -- this threshold just flags it
// on the dashboard so that's visible before a visitor's run fails outright at step 1.
const LOW_USDC_THRESHOLD = 10;
const AGENT_WALLET_ROLES = ["TREASURY", "PROCUREMENT", "SUPPLIER", "GOVERNANCE", "CUSTOMER"] as const;

export const getAgentWallets = unstable_cache(
  async (): Promise<AgentWallet[]> => {
    return Promise.all(
      AGENT_WALLET_ROLES.map(async (role): Promise<AgentWallet> => {
        const address = process.env[`CIRCLE_WALLET_ADDRESS_${role}`] as `0x${string}` | undefined;
        if (!address) {
          return { role, address: null, nativeBalance: "0", usdcBalance: "0", low: false };
        }

        const [nativeBalance, usdcBalance] = await Promise.all([
          withRetry(() => publicClient.getBalance({ address })),
          withRetry(() =>
            publicClient.readContract({ address: ARC_TESTNET_USDC as `0x${string}`, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
          ) as Promise<bigint>,
        ]);
        const usdcFormatted = formatUnits(usdcBalance, 6);

        return {
          role,
          address,
          nativeBalance: formatEther(nativeBalance),
          usdcBalance: usdcFormatted,
          low: parseFloat(usdcFormatted) < LOW_USDC_THRESHOLD,
        };
      }),
    );
  },
  ["arcos-agent-wallets"],
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

const DECISION_RECORDED_EVENT = {
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
} satisfies AbiEvent;

async function scanDecisionLogs(fromBlock: bigint, toBlock: bigint): Promise<DecisionRow[]> {
  if (fromBlock > toBlock) return [];
  const logs = await getLogsRange({ address: addresses.decisionLedger as `0x${string}`, event: DECISION_RECORDED_EVENT }, fromBlock, toBlock);
  return logs.map((log) => {
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
  });
}

// Two-tier scan, wrapped in Next's durable Data Cache (unstable_cache) rather than the
// in-memory Map the original version used (that Map lived in one Lambda instance's process
// memory, so on Vercel it was reset by every cold start).
//
// The *cached* tier below only ever scans DEPLOYMENT_BLOCK -> "latest at the time this
// last recomputed", and only recomputes once per HISTORICAL_CHECKPOINT_REVALIDATE_SECONDS
// -- cheap regardless of how much history has built up, since it's shared across every
// visitor in that window. getDecisions() (below) always adds a small, always-fresh "tail"
// scan on top (checkpoint -> current latest) so nothing recent is ever missed.
//
// This replaced a version keyed on decisionCount() (recompute whenever the on-chain
// decision count changed) -- correct, but meant literally every new decision anywhere
// forced a full DEPLOYMENT_BLOCK rescan for the next visitor. Measured directly against
// production: a cache-miss dashboard load took 60s once enough history had built up. This
// version's worst case is one checkpoint recompute shared across a 20-minute window, plus
// a tail scan that's normally a single getLogs call.
const getHistoricalDecisions = unstable_cache(
  async (): Promise<{ logs: DecisionRow[]; scannedTo: string }> => {
    const latest = await withRetry(() => publicClient.getBlockNumber());
    const logs = await scanDecisionLogs(DEPLOYMENT_BLOCK, latest);
    return { logs, scannedTo: latest.toString() };
  },
  ["arcos-decisions-historical"],
  { revalidate: HISTORICAL_CHECKPOINT_REVALIDATE_SECONDS },
);

export async function getDecisions(): Promise<DecisionRow[]> {
  const [{ logs: historical, scannedTo }, latest] = await Promise.all([
    getHistoricalDecisions(),
    withRetry(() => publicClient.getBlockNumber()),
  ]);
  const scannedToBlock = BigInt(scannedTo);
  const tail = latest > scannedToBlock ? await scanDecisionLogs(scannedToBlock + 1n, latest) : [];
  return [...tail, ...historical].sort((a, b) => Number(b.decisionId) - Number(a.decisionId));
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

interface EscrowPaymentLog {
  paymentId: string;
  to: `0x${string}`;
  amountUsdc: string;
  refundTo: `0x${string}`;
}

const PAYMENT_CREATED_EVENT = {
  type: "event",
  name: "PaymentCreated",
  inputs: [
    { name: "paymentID", type: "uint256", indexed: true },
    { name: "to", type: "address", indexed: true },
    { name: "amount", type: "uint256", indexed: false },
    { name: "releaseTimestamp", type: "uint256", indexed: false },
    { name: "refundTo", type: "address", indexed: true },
  ],
} satisfies AbiEvent;

async function scanEscrowPaymentLogs(fromBlock: bigint, toBlock: bigint): Promise<EscrowPaymentLog[]> {
  if (fromBlock > toBlock) return [];
  const logs = await getLogsRange({ address: addresses.escrow as `0x${string}`, event: PAYMENT_CREATED_EVENT }, fromBlock, toBlock);
  return logs.map((log) => {
    const decoded = decodeEventLog({ abi: EscrowAbi, data: log.data, topics: log.topics });
    const args = decoded.args as unknown as { paymentID: bigint; to: `0x${string}`; amount: bigint; refundTo: `0x${string}` };
    return { paymentId: args.paymentID.toString(), to: args.to, amountUsdc: formatUnits(args.amount, 6), refundTo: args.refundTo };
  });
}

// Same two-tier cached-historical + always-fresh-tail split as getDecisions above, for the
// same reason (a decisionCount()-keyed cache measured at up to 60s per request once enough
// history had built up).
//
// Separately: withdrawn/refunded status is deliberately read fresh for *every* payment on
// every request, never cached -- unlike a PaymentCreated event (immutable once logged), a
// payment's status can change later (withdraw/refund) independent of any new event this
// scan would pick up, so caching it would risk showing a stale "pending" on an already-
// released payment. Reading all of them in parallel keeps that cheap even as it doesn't
// come from cache, and lets viem's batch:{multicall:true} collapse them into few round trips.
const getHistoricalEscrowPaymentLogs = unstable_cache(
  async (): Promise<{ logs: EscrowPaymentLog[]; scannedTo: string }> => {
    const latest = await withRetry(() => publicClient.getBlockNumber());
    const logs = await scanEscrowPaymentLogs(DEPLOYMENT_BLOCK, latest);
    return { logs, scannedTo: latest.toString() };
  },
  ["arcos-escrow-payments-historical"],
  { revalidate: HISTORICAL_CHECKPOINT_REVALIDATE_SECONDS },
);

export async function getEscrowPayments(): Promise<EscrowPayment[]> {
  const [{ logs: historical, scannedTo }, latest] = await Promise.all([
    getHistoricalEscrowPaymentLogs(),
    withRetry(() => publicClient.getBlockNumber()),
  ]);
  const scannedToBlock = BigInt(scannedTo);
  const tail = latest > scannedToBlock ? await scanEscrowPaymentLogs(scannedToBlock + 1n, latest) : [];
  const allLogs = [...historical, ...tail];

  const payments = await Promise.all(
    allLogs.map(async (logEntry): Promise<EscrowPayment> => {
      const onChainPayment = (await withRetry(() =>
        publicClient.readContract({
          address: addresses.escrow as `0x${string}`,
          abi: EscrowAbi,
          functionName: "payments",
          args: [BigInt(logEntry.paymentId)],
        }),
      )) as readonly [string, bigint, bigint, string, bigint, boolean];

      return {
        ...logEntry,
        refunded: onChainPayment[5],
        withdrawn: onChainPayment[4] > 0n, // withdrawnAmount
      };
    }),
  );

  return payments.sort((a, b) => Number(b.paymentId) - Number(a.paymentId));
}
