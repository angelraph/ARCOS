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
});

export type ArcosEnv = z.infer<typeof envSchema>;

export function loadConfig(): ArcosEnv {
  return envSchema.parse(process.env);
}
