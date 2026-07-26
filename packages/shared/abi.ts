import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const contractsOut = path.resolve(__dirname, "../../contracts/out");

// Reads the ABI straight from Foundry's compiled artifact so it can never drift from
// the actually-deployed bytecode. Run `forge build` in contracts/ before using this.
export function loadAbi(contractName: "DecisionLedger" | "TreasuryPolicy" | "Escrow") {
  const artifactPath = path.join(contractsOut, `${contractName}.sol`, `${contractName}.json`);
  const artifact = JSON.parse(readFileSync(artifactPath, "utf-8"));
  return artifact.abi as readonly unknown[];
}

export const DecisionLedgerAbi = loadAbi("DecisionLedger");
export const TreasuryPolicyAbi = loadAbi("TreasuryPolicy");
export const EscrowAbi = loadAbi("Escrow");
