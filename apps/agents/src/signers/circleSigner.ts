import { executeContract, circleDeveloperSdk } from "@arcos/shared";
import type { ContractSigner } from "./types";

// Circle's API expects JSON-serializable ABI params — recursively stringify bigints
// (including inside arrays, e.g. withdraw(uint256[])'s payment ID list).
function stringifyBigints(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(stringifyBigints);
  return value;
}

/** Signs contract calls through a Circle Developer-Controlled Wallet — no raw private
 *  key is ever held by the agent process. This is ARCOS's primary signer for
 *  TreasuryPolicy / Escrow / DecisionLedger calls (contract-execution transactions),
 *  matching the pattern in Circle's own arc-escrow sample (lib/utils/executeContract.ts). */
export function createCircleSigner(walletId: string, walletAddress: `0x${string}`): ContractSigner {
  return {
    address: walletAddress,
    async execute({ contractAddress, abiFunctionSignature, abiParameters }) {
      const { transactionId } = await executeContract({
        walletId,
        contractAddress,
        abiFunctionSignature,
        abiParameters: abiParameters.map(stringifyBigints) as (string | number | boolean)[],
      });

      // Poll until Circle reports the transaction as confirmed on-chain and returns the
      // real tx hash. Confirmed against the installed SDK's top-level wrapper type +
      // doc example (developer-controlled-wallets.d.ts) — takes `{ id }`, not a positional
      // string (a different, lower-level API layer in the same package uses that shape).
      const maxAttempts = 30;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const res = await circleDeveloperSdk.getTransaction({ id: transactionId });
        const transaction = res.data?.transaction;
        if (transaction?.state === "COMPLETE" && transaction.txHash) {
          return { txHash: transaction.txHash as `0x${string}` };
        }
        if (transaction?.state === "FAILED") {
          throw new Error(`Circle transaction ${transactionId} failed`);
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      throw new Error(`Timed out waiting for Circle transaction ${transactionId} to confirm`);
    },
  };
}
