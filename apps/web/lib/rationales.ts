import { keccak256, stringToBytes } from "viem";
import { createSupabaseServiceClient } from "@arcos/shared";

export interface RationaleEntry {
  agentId: string;
  actionType: string;
  rationale: string;
  rationaleHash: `0x${string}`;
  txRef: `0x${string}`;
  ledgerTxHash: `0x${string}`;
  timestamp: string;
}

// Written by apps/agents/src/ledger.ts. Supabase (not a local file) because the
// orchestrator and this dashboard read run as separate Vercel serverless invocations that
// don't share a filesystem — a local file, even under os.tmpdir(), was invisible across
// requests in production, so rationale text silently never appeared on the live dashboard.
export async function getRationales(): Promise<RationaleEntry[]> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("rationales")
    .select("agent_id, action_type, rationale, rationale_hash, tx_ref, ledger_tx_hash, created_at");

  if (error) throw new Error(`Failed to load rationales from Supabase: ${error.message}`);

  return (data ?? []).map((row) => ({
    agentId: row.agent_id,
    actionType: row.action_type,
    rationale: row.rationale,
    rationaleHash: row.rationale_hash as `0x${string}`,
    txRef: row.tx_ref as `0x${string}`,
    ledgerTxHash: row.ledger_tx_hash as `0x${string}`,
    timestamp: row.created_at,
  }));
}

/** Recomputes the rationale hash client-side (well, here server-side at render time) and
 *  checks it against the on-chain value — the concrete "verifiable and explainable" proof
 *  point: the displayed rationale text is provably what the agent actually recorded. */
export function verifyRationale(rationale: string, onChainHash: `0x${string}`): boolean {
  return keccak256(stringToBytes(rationale)) === onChainHash;
}
