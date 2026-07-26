// Filled in after Phase 1 (contract deploy). Keep in sync with contracts/broadcast output.
export const ARC_TESTNET_CHAIN_ID = 5042002;

export const addresses = {
  decisionLedger: process.env.DECISION_LEDGER_ADDRESS ?? "",
  treasuryPolicy: process.env.TREASURY_POLICY_ADDRESS ?? "",
  escrow: process.env.ESCROW_ADDRESS ?? "",
} as const;

// Arc Testnet's eth_getLogs caps ranges at 10,000 blocks, and the chain was already at
// block ~53.7M when these contracts deployed — querying from block 0 always fails. Use
// this as fromBlock instead. Update if contracts are ever redeployed
// (see contracts/broadcast/Deploy.s.sol/5042002/run-latest.json for the real block).
export const DEPLOYMENT_BLOCK = 53719224n;
