// One-time setup script. Creates a Circle wallet set and five Developer-Controlled
// Wallets on Arc Testnet (Treasury, Procurement, Supplier, Governance, Customer), then
// appends their wallet IDs and addresses to .env.
//
// Prerequisite: CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET must already be set in .env.
// Run with: npm run create-wallets
import { config } from "dotenv";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

config({ path: ".env" });

const apiKey = process.env.CIRCLE_API_KEY;
const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
if (!apiKey || !entitySecret) {
  console.error("Missing CIRCLE_API_KEY or CIRCLE_ENTITY_SECRET in .env.");
  process.exit(1);
}

const envContent = existsSync(".env") ? readFileSync(".env", "utf-8") : "";
if (/^CIRCLE_WALLET_ID_TREASURY=.+$/m.test(envContent)) {
  console.error(
    "CIRCLE_WALLET_ID_TREASURY is already set in .env — wallets appear to already exist. " +
      "Refusing to create a duplicate wallet set. Delete the CIRCLE_WALLET_ID_* lines first " +
      "if you really want to create a fresh set.",
  );
  process.exit(1);
}

const circleDeveloperSdk = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });

const ROLES = ["TREASURY", "PROCUREMENT", "SUPPLIER", "GOVERNANCE", "CUSTOMER"] as const;

console.log("Creating wallet set...");
const walletSetResponse = await circleDeveloperSdk.createWalletSet({ name: "ARCOS" });
const walletSetId = walletSetResponse.data?.walletSet?.id;
if (!walletSetId) throw new Error("No wallet set id returned");
console.log(`Wallet set created: ${walletSetId}`);

console.log(`Creating ${ROLES.length} wallets on ARC-TESTNET...`);
// The installed SDK's Blockchain type (v4.7.0) doesn't list "ARC-TESTNET" in its union yet,
// even though the runtime API accepts it (confirmed — this call succeeds and returns real
// Arc Testnet addresses). Cast past the stale type rather than widen it repo-wide.
const walletsResponse = await circleDeveloperSdk.createWallets({
  walletSetId,
  blockchains: ["ARC-TESTNET"] as unknown as Parameters<typeof circleDeveloperSdk.createWallets>[0]["blockchains"],
  count: ROLES.length,
  metadata: ROLES.map((role) => ({ name: `ARCOS ${role}` })),
});

const wallets = walletsResponse.data?.wallets ?? [];
if (wallets.length !== ROLES.length) {
  throw new Error(`Expected ${ROLES.length} wallets, got ${wallets.length}`);
}

let envAppend = "\n# --- Circle wallet set + wallet addresses (created by scripts/create-wallets.ts) ---\n";
envAppend += `CIRCLE_WALLET_SET_ID=${walletSetId}\n`;

for (const [i, role] of ROLES.entries()) {
  const wallet = wallets[i];
  console.log(`\n${role}`);
  console.log(`  Wallet ID: ${wallet.id}`);
  console.log(`  Address:   ${wallet.address}`);
  envAppend += `CIRCLE_WALLET_ID_${role}=${wallet.id}\n`;
  envAppend += `CIRCLE_WALLET_ADDRESS_${role}=${wallet.address}\n`;
}

appendFileSync(".env", envAppend);

console.log("\nDone. Wallet IDs and addresses appended to .env.");
console.log("Next: fund the TREASURY and CUSTOMER wallet addresses via faucet.circle.com (Arc Testnet).");
