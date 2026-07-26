import { createPublicClient, http, decodeEventLog, type Hex } from "viem";
import { arcTestnet } from "viem/chains";
import { TreasuryPolicyAbi, EscrowAbi } from "@arcos/shared";

export const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(process.env.ARC_TESTNET_RPC_URL),
});

/** Reads back the spendId a proposeSpend tx generated, by decoding the SpendProposed
 *  event from its receipt. Needed because a broadcast tx doesn't return a function's
 *  return value directly — only Solidity callers (or eth_call) see that. */
export async function getSpendIdFromTx(txHash: Hex): Promise<bigint> {
  const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({ abi: TreasuryPolicyAbi, data: log.data, topics: log.topics });
      if (decoded.eventName === "SpendProposed") {
        return (decoded.args as { spendId: bigint }).spendId;
      }
    } catch {
      // log from a different event/contract — skip
    }
  }
  throw new Error(`SpendProposed event not found in tx ${txHash}`);
}

/** Reads back the paymentID an Escrow.pay() tx generated, by decoding PaymentCreated. */
export async function getPaymentIdFromTx(txHash: Hex): Promise<bigint> {
  const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
  for (const log of receipt.logs) {
    try {
      const decoded = decodeEventLog({ abi: EscrowAbi, data: log.data, topics: log.topics });
      if (decoded.eventName === "PaymentCreated") {
        return (decoded.args as { paymentID: bigint }).paymentID;
      }
    } catch {
      // log from a different event/contract — skip
    }
  }
  throw new Error(`PaymentCreated event not found in tx ${txHash}`);
}

/** Ground truth for whether a proposeSpend actually moved funds — never infer this from
 *  a locally cached threshold value, since that can drift from the deployed contract's
 *  actual `spendThreshold` (e.g. after an owner calls setSpendThreshold post-deploy). */
export async function isSpendExecuted(treasuryPolicyAddress: `0x${string}`, spendId: bigint): Promise<boolean> {
  const result = await publicClient.readContract({
    address: treasuryPolicyAddress,
    abi: TreasuryPolicyAbi,
    functionName: "pendingSpends",
    args: [spendId],
  });
  // pendingSpends returns the struct as a positional tuple: [to, amount, bucketIndex, rationaleHash, approved, executed]
  return (result as readonly unknown[])[5] as boolean;
}
