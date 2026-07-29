// One-time setup script. Deposits USDC into Circle Gateway's balance for the local EOA
// that pays the Supplier Agent's quote endpoint via x402 — see
// apps/agents/src/gateway/quoteClient.ts for why this has to be a raw local key rather
// than a Circle Developer-Controlled Wallet.
//
// Prerequisite: PROCUREMENT_GATEWAY_PRIVATE_KEY must be set in .env, and that key's
// address must already hold both native gas and a little USDC (fund both via
// faucet.circle.com, Arc Testnet — this is a plain EOA, not a Developer-Controlled
// Wallet, so the public faucet's address-based flow is the right one here).
// Run with: npm run setup-gateway -- --amount=1.00
import { config } from "dotenv";
import { GatewayClient } from "@circle-fin/x402-batching/client";
import type { Hex } from "viem";

config({ path: ".env" });

const privateKey = process.env.PROCUREMENT_GATEWAY_PRIVATE_KEY as Hex | undefined;
if (!privateKey) {
  console.error("Missing PROCUREMENT_GATEWAY_PRIVATE_KEY in .env.");
  process.exit(1);
}

const amountArg = process.argv.find((a) => a.startsWith("--amount="));
const amount = amountArg?.split("=")[1] ?? "1.00";

const client = new GatewayClient({ chain: "arcTestnet", privateKey });

console.log(`Buyer address: ${client.address}`);

const before = await client.getBalances();
console.log(`Wallet USDC balance:  ${before.wallet.formatted}`);
console.log(`Gateway balance:      ${before.gateway.formattedAvailable}`);

console.log(`\nDepositing $${amount} USDC into Gateway...`);
const result = await client.deposit(amount);
console.log(`Deposit tx: ${result.depositTxHash}`);
if (result.approvalTxHash) console.log(`Approval tx: ${result.approvalTxHash}`);

const after = await client.getBalances();
console.log(`\nGateway balance is now: ${after.gateway.formattedAvailable}`);
console.log("Done. This balance pays for quote-endpoint micropayments across many runs of the flow.");
