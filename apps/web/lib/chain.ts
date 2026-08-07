import "./loadServerEnv"; // must run before @arcos/shared evaluates process.env-derived addresses
import { createPublicClient, http, decodeEventLog, formatUnits, type AbiEvent, type Log } from "viem";
import { arcTestnet } from "viem/chains";
import { unstable_cache } from "next/cache";
import { TreasuryPolicyAbi, EscrowAbi, DecisionLedgerAbi, addresses, ActionType, DEPLOYMENT_BLOCK } from "@arcos/shared";

// Current chain state (bucket balances, pending spends) changes only when a run happens,
// but a stale dashboard is confusing right after one — a short window keeps it fresh
// without every visitor triggering their own round of reads.
const CACHE_SECONDS = 15;

// The historical event scans below (getDecisions/getEscrowPayments) are expensive, so they
// stay cached for a long time -- freshness comes from keying the cache on decisionCount()
// (see getFreshDecisionCount below), not from this window. This is only the time-based
// safety net for the rare case decisionCount() itself can't be read.
const LOG_SCAN_REVALIDATE_SECONDS = 3600;

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

// Cache-busting key for the two expensive log scans below, instead of relying on
// revalidateTag. Tried revalidateTag(tag, { expire: 0 }) from /api/run first -- verified
// directly against production (decisionCount() on-chain vs. the dashboard's reported
// count) that it does NOT invalidate an unstable_cache-tagged entry on this Next.js
// version, even though the call itself doesn't throw. Rather than depend on that, key the
// cache on this cheap, always-fresh read of decisionCount() (a single eth_call, not a log
// scan) -- every state-changing action in ARCOS's own flow (payment, spend, escrow open,
// release, refund) always records a decision alongside it, so a changed count reliably
// means changed data, and an unchanged count means the expensive scan below can safely be
// skipped. This makes staleness structurally impossible rather than dependent on any
// particular revalidation call actually working.
async function getFreshDecisionCount(): Promise<string> {
  const count = await withRetry(() =>
    publicClient.readContract({
      address: addresses.decisionLedger as `0x${string}`,
      abi: DecisionLedgerAbi,
      functionName: "decisionCount",
    }),
  );
  return (count as bigint).toString();
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

// Wrapped in Next's durable Data Cache (unstable_cache), not the in-memory Map the
// previous version used — that Map lived in one Lambda instance's process memory, so on
// Vercel it was reset by every cold start, meaning nearly every real visitor paid the cost
// of rescanning the full history (hundreds of thousands of blocks, in 10k-block chunks)
// from DEPLOYMENT_BLOCK. unstable_cache's storage is shared and durable across
// invocations, so once any request warms this key, every other request (any instance)
// reads it instantly until decisionCount() changes (see getFreshDecisionCount) or
// LOG_SCAN_REVALIDATE_SECONDS elapses.
const getDecisionsCached = unstable_cache(
  async (_decisionCount: string): Promise<DecisionRow[]> => {
    const latest = await withRetry(() => publicClient.getBlockNumber());
    const logs = await getLogsRange(
      {
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
      },
      DEPLOYMENT_BLOCK,
      latest,
    );

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
  },
  ["arcos-decisions"],
  { revalidate: LOG_SCAN_REVALIDATE_SECONDS },
);

export async function getDecisions(): Promise<DecisionRow[]> {
  return getDecisionsCached(await getFreshDecisionCount());
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

// See getDecisions above for why this is unstable_cache-wrapped rather than the previous
// in-memory Map, and keyed on decisionCount() rather than relying on revalidateTag. Every
// escrow state change ARCOS's own flow makes (open, release, refund) always records a
// decision alongside it (see ProcurementAgent/SupplierAgent/GovernanceAgent), so
// decisionCount() is a reliable freshness signal here too, without a second on-chain read.
// (The one gap: a third party calling withdraw()/refundByRecipient() directly on Escrow,
// bypassing ARCOS's agents entirely, wouldn't bump decisionCount -- that's bounded by
// LOG_SCAN_REVALIDATE_SECONDS instead, same as before.)
const getEscrowPaymentsCached = unstable_cache(
  async (_decisionCount: string): Promise<EscrowPayment[]> => {
    const latest = await withRetry(() => publicClient.getBlockNumber());
    const logs = await getLogsRange(
      {
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
      },
      DEPLOYMENT_BLOCK,
      latest,
    );

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
  },
  ["arcos-escrow-payments"],
  { revalidate: LOG_SCAN_REVALIDATE_SECONDS },
);

export async function getEscrowPayments(): Promise<EscrowPayment[]> {
  return getEscrowPaymentsCached(await getFreshDecisionCount());
}
