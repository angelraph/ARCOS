import { GatewayClient } from "@circle-fin/x402-batching/client";
import type { Hex } from "viem";

export interface PaidQuoteResult {
  rationale: string;
  feeUsdc: string;
  settlementRef: string;
}

/** Pays the Supplier Agent's quote endpoint gas-free via Circle Gateway (x402), signed by
 *  a small, purpose-scoped local EOA — never a Circle Developer-Controlled Wallet, since
 *  Gateway/x402 payments require client-side EIP-3009 signing that Circle's custodied
 *  wallets don't expose. That key should only ever hold a couple dollars of Gateway
 *  deposit balance for these negotiation micropayments; treasury funds never touch it. */
export async function requestPaidQuote(
  quoteUrl: string,
  itemDescription: string,
  amountAtomic: bigint,
  buyerPrivateKey: Hex,
): Promise<PaidQuoteResult> {
  const client = new GatewayClient({ chain: "arcTestnet", privateKey: buyerPrivateKey });

  const result = await client.pay<{ rationale: string }>(quoteUrl, {
    method: "POST",
    body: { itemDescription, amountAtomic: amountAtomic.toString() },
  });

  return { rationale: result.data.rationale, feeUsdc: result.formattedAmount, settlementRef: result.transaction };
}
