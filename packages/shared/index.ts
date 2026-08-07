export * from "./addresses";
export * from "./circleClient";
export * from "./abi";
export * from "./supabaseClient";

// Arc Testnet's commerce USDC is an ERC-20 token (6 decimals) at this fixed address —
// distinct from the native 18-decimal gas token used only to pay transaction fees.
export const ARC_TESTNET_USDC = "0x3600000000000000000000000000000000000000" as const;

export enum ActionType {
  TREASURY_ALLOCATION = 0,
  PROCUREMENT_ORDER = 1,
  SUPPLIER_QUOTE = 2,
  ESCROW_OPEN = 3,
  ESCROW_RELEASE = 4,
  GOVERNANCE_OVERRIDE = 5,
}

export const AGENT_IDS = {
  TREASURY_AGENT: "TREASURY_AGENT",
  PROCUREMENT_AGENT: "PROCUREMENT_AGENT",
  SUPPLIER_AGENT: "SUPPLIER_AGENT",
} as const;
