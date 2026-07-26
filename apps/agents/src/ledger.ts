import { keccak256, stringToBytes, stringToHex, type Hex } from "viem";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { ActionType } from "@arcos/shared";
import type { ContractSigner } from "./signers/types";

// Local rationale store, standing in for Supabase until that's wired up (Phase 3). Same
// shape either way: the full rationale text lives off-chain; only its keccak256 hash is
// pinned on DecisionLedger. The dashboard later recomputes this hash client-side and
// checks it against the on-chain value.
// Vercel's deployed filesystem is read-only outside os.tmpdir() — use that there.
const rationaleStorePath = process.env.VERCEL
  ? path.join(os.tmpdir(), "arcos-rationales.json")
  : path.resolve(process.cwd(), "data/rationales.json");

function loadStore(): unknown[] {
  if (!existsSync(rationaleStorePath)) return [];
  return JSON.parse(readFileSync(rationaleStorePath, "utf-8"));
}

function saveRationale(entry: Record<string, unknown>) {
  mkdirSync(path.dirname(rationaleStorePath), { recursive: true });
  const store = loadStore();
  store.push(entry);
  writeFileSync(rationaleStorePath, JSON.stringify(store, null, 2));
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

  saveRationale({
    agentId: params.agentId,
    actionType: ActionType[params.actionType],
    rationale: params.rationale,
    rationaleHash,
    txRef: params.txRef,
    ledgerTxHash: txHash,
    timestamp: new Date().toISOString(),
  });

  return { txHash, rationaleHash };
}
