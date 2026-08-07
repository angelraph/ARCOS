import { keccak256, stringToBytes, stringToHex, type Hex } from "viem";
import { ActionType, createSupabaseServiceClient } from "@arcos/shared";
import type { ContractSigner } from "./signers/types";

// The full rationale text lives off-chain in Supabase; only its keccak256 hash is pinned
// on DecisionLedger. The dashboard recomputes this hash client-side and checks it against
// the on-chain value. This used to be a local JSON file, but the orchestrator and the
// dashboard read run as separate Vercel serverless invocations that don't share a
// filesystem, so a local file (even under os.tmpdir()) was invisible across requests in
// production — Supabase is the real, durable, shared store this always needed to be.
async function saveRationale(entry: {
  agent_id: string;
  action_type: string;
  rationale: string;
  rationale_hash: string;
  tx_ref: string;
  ledger_tx_hash: string;
}) {
  const supabase = createSupabaseServiceClient();
  // upsert, not insert: two runs with identical inputs produce byte-identical rationale
  // text (the fallback templates have no randomness/timestamp), so rationale_hash — the
  // primary key — can collide. The row content would be identical anyway in that case.
  const { error } = await supabase.from("rationales").upsert(entry, { onConflict: "rationale_hash" });
  if (error) throw new Error(`Failed to save rationale to Supabase: ${error.message}`);
}

export type AgentName = "TREASURY_AGENT" | "PROCUREMENT_AGENT" | "SUPPLIER_AGENT";

// Exposed so callers can pass the identical hash into a contract call (e.g.
// TreasuryPolicy.proposeSpend's rationaleHash param) before also recording it here.
export function hashRationale(rationale: string): Hex {
  return keccak256(stringToBytes(rationale));
}

export async function recordDecision(params: {
  signer: ContractSigner;
  ledgerAddress: `0x${string}`;
  agentId: AgentName;
  actionType: ActionType;
  rationale: string;
  txRef: Hex;
}): Promise<{ txHash: Hex; rationaleHash: Hex }> {
  const rationaleHash = hashRationale(params.rationale);
  // Right-pads the ASCII agent name into bytes32, matching Solidity's `bytes32("NAME")`
  // short-string literal encoding used in the contract's test suite.
  const agentIdBytes32 = stringToHex(params.agentId, { size: 32 });

  const { txHash } = await params.signer.execute({
    contractAddress: params.ledgerAddress,
    abiFunctionSignature: "recordDecision(bytes32,uint8,bytes32,bytes32)",
    abiParameters: [agentIdBytes32, params.actionType, rationaleHash, params.txRef],
  });

  await saveRationale({
    agent_id: params.agentId,
    action_type: ActionType[params.actionType],
    rationale: params.rationale,
    rationale_hash: rationaleHash,
    tx_ref: params.txRef,
    ledger_tx_hash: txHash,
  });

  return { txHash, rationaleHash };
}
