import "./loadEnv";
import { loadConfig } from "./config";
import { createSigners, type SignerBackend } from "./signers";
import { runFlow } from "./orchestrator";

function parseArgs() {
  const args = process.argv.slice(2);
  const backendArg = args.find((a) => a.startsWith("--backend="));
  const backend = (backendArg?.split("=")[1] ?? "circle") as SignerBackend;

  const paymentArg = args.find((a) => a.startsWith("--payment="));
  const paymentUsdc = paymentArg?.split("=")[1] ?? "20";

  const procurementArg = args.find((a) => a.startsWith("--procurement="));
  const procurementUsdc = procurementArg?.split("=")[1] ?? "2";

  const recipientArg = args.find((a) => a.startsWith("--recipient="));
  const recipientAddress = recipientArg?.split("=")[1] as `0x${string}` | undefined;

  return { backend, paymentUsdc, procurementUsdc, recipientAddress };
}

async function main() {
  const { backend, paymentUsdc, procurementUsdc, recipientAddress } = parseArgs();
  const env = loadConfig();

  console.log(`ARCOS agent orchestrator, signer backend: ${backend}`);
  const signers = createSigners(backend);

  await runFlow(
    signers,
    {
      treasuryPolicyAddress: env.TREASURY_POLICY_ADDRESS as `0x${string}`,
      escrowAddress: env.ESCROW_ADDRESS as `0x${string}`,
      ledgerAddress: env.DECISION_LEDGER_ADDRESS as `0x${string}`,
      gatewayBuyerPrivateKey: env.PROCUREMENT_GATEWAY_PRIVATE_KEY as `0x${string}` | undefined,
      quoteFeeUsdc: env.SUPPLIER_QUOTE_FEE_USDC,
    },
    paymentUsdc,
    procurementUsdc,
    (event) => {
      console.log(`\n[${event.step}/${event.totalSteps}] ${event.label}`);
      if (event.txHash) console.log(`      tx ${event.txHash}`);
    },
    recipientAddress,
  );
}

main().catch((err) => {
  console.error("\nFlow failed:", err);
  process.exit(1);
});
