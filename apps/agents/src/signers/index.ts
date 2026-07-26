import type { ContractSigner } from "./types";
import { createCircleSigner } from "./circleSigner";
import { createLocalSigner } from "./localSigner";
import type { Hex } from "viem";

export type SignerBackend = "circle" | "local";

export interface AgentSigners {
  treasury: ContractSigner;
  procurement: ContractSigner;
  supplier: ContractSigner;
  governance: ContractSigner;
  customer: ContractSigner;
}

/** Builds the five role signers for either backend. "circle" (default) uses Circle
 *  Developer-Controlled Wallets end to end — the real ARCOS architecture. "local" uses
 *  plain viem private keys for a fast dry run against Arc Testnet directly, without
 *  needing wallet IDs wired up yet. */
export function createSigners(backend: SignerBackend): AgentSigners {
  if (backend === "local") {
    const keys = {
      treasury: process.env.LOCAL_KEY_TREASURY as Hex,
      procurement: process.env.LOCAL_KEY_PROCUREMENT as Hex,
      supplier: process.env.LOCAL_KEY_SUPPLIER as Hex,
      governance: process.env.LOCAL_KEY_GOVERNANCE as Hex,
      customer: process.env.LOCAL_KEY_CUSTOMER as Hex,
    };
    for (const [role, key] of Object.entries(keys)) {
      if (!key) throw new Error(`Missing LOCAL_KEY_${role.toUpperCase()} for local signer backend`);
    }
    const rpcUrl = process.env.ARC_TESTNET_RPC_URL!;
    return {
      treasury: createLocalSigner(keys.treasury, rpcUrl),
      procurement: createLocalSigner(keys.procurement, rpcUrl),
      supplier: createLocalSigner(keys.supplier, rpcUrl),
      governance: createLocalSigner(keys.governance, rpcUrl),
      customer: createLocalSigner(keys.customer, rpcUrl),
    };
  }

  const need = (name: string) => {
    const value = process.env[name];
    if (!value) throw new Error(`Missing ${name} — run scripts/create-wallets.ts first`);
    return value;
  };

  return {
    treasury: createCircleSigner(need("CIRCLE_WALLET_ID_TREASURY"), need("CIRCLE_WALLET_ADDRESS_TREASURY") as Hex),
    procurement: createCircleSigner(need("CIRCLE_WALLET_ID_PROCUREMENT"), need("CIRCLE_WALLET_ADDRESS_PROCUREMENT") as Hex),
    supplier: createCircleSigner(need("CIRCLE_WALLET_ID_SUPPLIER"), need("CIRCLE_WALLET_ADDRESS_SUPPLIER") as Hex),
    governance: createCircleSigner(need("CIRCLE_WALLET_ID_GOVERNANCE"), need("CIRCLE_WALLET_ADDRESS_GOVERNANCE") as Hex),
    customer: createCircleSigner(need("CIRCLE_WALLET_ID_CUSTOMER"), need("CIRCLE_WALLET_ADDRESS_CUSTOMER") as Hex),
  };
}
