// Reads native gas + ERC-20 USDC balances for all five ARCOS agent wallets directly
// from Arc Testnet RPC, one request at a time with a short delay — Arc Testnet's public
// RPC rate-limits concurrent requests, so this deliberately avoids Promise.all.
// Run with: npx tsx scripts/check-balances.ts
import { config } from "dotenv";
import { createPublicClient, http, formatEther, formatUnits, erc20Abi } from "viem";

config({ path: ".env" });

const ARC_TESTNET_USDC = "0x3600000000000000000000000000000000000000" as const;
const RPC_URL = process.env.ARC_TESTNET_RPC_URL;

if (!RPC_URL) {
  console.error("Missing ARC_TESTNET_RPC_URL in .env.");
  process.exit(1);
}

const ROLES = ["TREASURY", "PROCUREMENT", "SUPPLIER", "GOVERNANCE", "CUSTOMER"] as const;
const client = createPublicClient({ transport: http(RPC_URL) });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

for (const role of ROLES) {
  const address = process.env[`CIRCLE_WALLET_ADDRESS_${role}`] as `0x${string}` | undefined;
  if (!address) {
    console.log(`${role.padEnd(12)} — CIRCLE_WALLET_ADDRESS_${role} not set in .env, skipping.`);
    continue;
  }

  const nativeBalance = await client.getBalance({ address });
  await sleep(500);
  const usdcBalance = await client.readContract({
    address: ARC_TESTNET_USDC,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address],
  });
  await sleep(500);

  console.log(
    `${role.padEnd(12)} ${address}  gas: ${formatEther(nativeBalance)}  USDC: ${formatUnits(usdcBalance, 6)}`,
  );
}
