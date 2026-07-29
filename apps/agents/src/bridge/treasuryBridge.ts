import { BridgeKit, type BridgeResult, type BridgeChainIdentifier } from "@circle-fin/bridge-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";

export interface TreasuryBridgeParams {
  /** A small, purpose-scoped local EOA — the same deliberate exception as the Gateway
   *  nanopayment leg (apps/agents/src/gateway/), never the real treasury's Circle
   *  Developer-Controlled Wallet funds. CCTPv2 burn/mint needs client-side signing that
   *  Circle's custodied wallets don't expose. */
  privateKey: Hex;
  amountUsdc: string;
  toChain: BridgeChainIdentifier;
  /** Defaults to the same address on the destination chain (a self-rebalance). */
  recipientAddress?: `0x${string}`;
}

/** Rebalances idle Arc Testnet USDC to another CCTPv2-supported chain via Circle's Bridge
 *  Kit, using Circle's Orbit relayer (`useForwarder: true`) so no destination-chain gas
 *  wallet is needed — the relayer submits the mint transaction on `toChain` itself. This
 *  is a standalone demonstration of the cross-chain treasury capability described in
 *  docs/circle-feedback.md, not part of ARCOS's core payment→escrow flow. */
export async function bridgeTreasuryFunds(params: TreasuryBridgeParams): Promise<BridgeResult> {
  const account = privateKeyToAccount(params.privateKey);
  const kit = new BridgeKit();
  const adapter = createViemAdapterFromPrivateKey({ privateKey: params.privateKey });

  return kit.bridge({
    from: { adapter, chain: "Arc_Testnet" },
    to: {
      recipientAddress: params.recipientAddress ?? account.address,
      chain: params.toChain,
      useForwarder: true,
    },
    amount: params.amountUsdc,
  });
}
