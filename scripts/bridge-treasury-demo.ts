// Demonstrates the CCTPv2 cross-chain treasury rebalance stretch goal: bridges a small
// amount of USDC from Arc Testnet to another CCTPv2-supported chain via Circle's Bridge
// Kit, using Circle's Orbit relayer so no destination-chain gas wallet is required.
//
// Prerequisite: TREASURY_BRIDGE_PRIVATE_KEY must be set in .env, and that key's address
// must already hold both native gas and a little USDC on Arc Testnet (fund both via
// faucet.circle.com — this is a plain EOA, not a Developer-Controlled Wallet, so the
// public faucet's address-based flow is the right one here). See
// apps/agents/src/bridge/treasuryBridge.ts for why this has to be a raw local key rather
// than the real Treasury Agent's Circle Developer-Controlled Wallet.
// Run with: npm run bridge-treasury-demo -- --amount=1.00 --to=Base_Sepolia
import { config } from "dotenv";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import type { BridgeChainIdentifier } from "@circle-fin/bridge-kit";
import { bridgeTreasuryFunds } from "../apps/agents/src/bridge/treasuryBridge";

config({ path: ".env" });

const privateKey = process.env.TREASURY_BRIDGE_PRIVATE_KEY as Hex | undefined;
if (!privateKey) {
  console.error("Missing TREASURY_BRIDGE_PRIVATE_KEY in .env.");
  process.exit(1);
}

const amountArg = process.argv.find((a) => a.startsWith("--amount="));
const amount = amountArg?.split("=")[1] ?? "1.00";

const toArg = process.argv.find((a) => a.startsWith("--to="));
const toChain = (toArg?.split("=")[1] ?? "Base_Sepolia") as BridgeChainIdentifier;

const account = privateKeyToAccount(privateKey);
console.log(`Bridging $${amount} USDC from Arc Testnet to ${toChain}`);
console.log(`Address (same on both chains): ${account.address}`);

const result = await bridgeTreasuryFunds({ privateKey, amountUsdc: amount, toChain });

console.log(`\nState: ${result.state}`);
console.log(JSON.stringify(result, (_key, value) => (typeof value === "bigint" ? value.toString() : value), 2));
