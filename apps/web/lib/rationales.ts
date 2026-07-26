import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { keccak256, stringToBytes } from "viem";

// Shared local store written by apps/agents/src/ledger.ts — stands in for Supabase until
// that's wired up. Reading it directly (rather than duplicating storage) keeps rationale
// text and on-chain hash in one place during this build phase.
const rationaleStorePath = path.resolve(process.cwd(), "../agents/data/rationales.json");

export interface RationaleEntry {
  agentId: string;
  actionType: string;
  rationale: string;
  rationaleHash: `0x${string}`;
  txRef: `0x${string}`;
  ledgerTxHash: `0x${string}`;
  timestamp: string;
}

export function getRationales(): RationaleEntry[] {
  if (!existsSync(rationaleStorePath)) return [];
  return JSON.parse(readFileSync(rationaleStorePath, "utf-8"));
}

/** Recomputes the rationale hash client-side (well, here server-side at render time) and
 *  checks it against the on-chain value — the concrete "verifiable and explainable" proof
 *  point: the displayed rationale text is provably what the agent actually recorded. */
export function verifyRationale(rationale: string, onChainHash: `0x${string}`): boolean {
  return keccak256(stringToBytes(rationale)) === onChainHash;
}
