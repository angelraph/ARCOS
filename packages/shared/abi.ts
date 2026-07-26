import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// contracts/out/ is a gitignored Foundry build artifact, unavailable at deploy time.
// abis/ is a committed copy extracted from it — regenerate after any contract change
// by re-running the extraction in contracts/ (forge build) and copying the abi field.
const abisDir = path.resolve(__dirname, "abis");

export function loadAbi(contractName: "DecisionLedger" | "TreasuryPolicy" | "Escrow") {
  const artifactPath = path.join(abisDir, `${contractName}.json`);
  const artifact = JSON.parse(readFileSync(artifactPath, "utf-8"));
  return artifact.abi as readonly unknown[];
}

export const DecisionLedgerAbi = loadAbi("DecisionLedger");
export const TreasuryPolicyAbi = loadAbi("TreasuryPolicy");
export const EscrowAbi = loadAbi("Escrow");
