import { z } from "zod";

const envSchema = z.object({
  ARC_TESTNET_RPC_URL: z.string().url(),
  ARC_TESTNET_CHAIN_ID: z.coerce.number(),
  ARC_TESTNET_EXPLORER_URL: z.string().url().optional(),

  DECISION_LEDGER_ADDRESS: z.string().startsWith("0x"),
  TREASURY_POLICY_ADDRESS: z.string().startsWith("0x"),
  ESCROW_ADDRESS: z.string().startsWith("0x"),

  GOVERNANCE_ADDRESS: z.string().startsWith("0x"),

  CIRCLE_API_KEY: z.string().optional(),
  CIRCLE_ENTITY_SECRET: z.string().optional(),

  CIRCLE_WALLET_ID_TREASURY: z.string().optional(),
  CIRCLE_WALLET_ID_PROCUREMENT: z.string().optional(),
  CIRCLE_WALLET_ID_SUPPLIER: z.string().optional(),
  CIRCLE_WALLET_ID_GOVERNANCE: z.string().optional(),
  CIRCLE_WALLET_ID_CUSTOMER: z.string().optional(),

  OPENAI_API_KEY: z.string().optional(),

  // A small, purpose-scoped local EOA that pays the Supplier Agent's quote endpoint via
  // Circle Gateway (x402) — see apps/agents/src/gateway/quoteClient.ts. Optional: when
  // unset, the flow falls back to an in-process quote with no real payment.
  PROCUREMENT_GATEWAY_PRIVATE_KEY: z.string().startsWith("0x").optional(),
  SUPPLIER_QUOTE_FEE_USDC: z.string().default("0.02"),
});

export type ArcosEnv = z.infer<typeof envSchema>;

export function loadConfig(): ArcosEnv {
  return envSchema.parse(process.env);
}
