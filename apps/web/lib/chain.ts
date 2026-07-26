import "./loadServerEnv"; // must run before @arcos/shared evaluates process.env-derived addresses
import { createPublicClient, http, decodeEventLog, formatUnits, type AbiEvent, type Log } from "viem";
import { arcTestnet } from "viem/chains";
import { TreasuryPolicyAbi, EscrowAbi, DecisionLedgerAbi, addresses, ActionType, DEPLOYMENT_BLOCK } from "@arcos/shared";

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
// don't retry that (they're for transport-level failures). Retry it ourselves.
async function withRetry<T>(fn: () => Promise<T>, attempts = 6, baseDelayMs = 600): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes("request limit")) throw err;
      await new Promise((r) => setTimeout(r, baseDelayMs * (i + 1)));
    }
  }
  throw lastError;
}

// Arc Testnet's eth_getLogs caps ranges at 10,000 blocks. The chain is already at block
// ~53.7M, and that gap only grows over time, so a single fromBlock/toBlock query will
// eventually break again even with a fixed DEPLOYMENT_BLOCK start — paginate instead of
// hoping the range stays small.
const MAX_LOG_RANGE = 9_999n;

async function getLogsPaginated(params: { address: `0x${string}`; event: AbiEvent }): Promise<Log[]> {
  const latest = await withRetry(() => publicClient.getBlockNumber());
  const logs: Log[] = [];
  for (let from = DEPLOYMENT_BLOCK; from <= latest; from += MAX_LOG_RANGE + 1n) {
    const to = from + MAX_LOG_RANGE > latest ? latest : from + MAX_LOG_RANGE;
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

export async function getBuckets(): Promise<BucketState[]> {
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
}

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
  const logs = await getLogsPaginated({
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

export async function getPendingSpends(): Promise<PendingSpendRow[]> {
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
}

export interface EscrowPayment {
  paymentId: string;
  to: `0x${string}`;
  amountUsdc: string;
  refundTo: `0x${string}`;
  refunded: boolean;
  withdrawn: boolean;
}

export async function getEscrowPayments(): Promise<EscrowPayment[]> {
  const logs = await getLogsPaginated({
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
