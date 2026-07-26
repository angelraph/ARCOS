import { formatUnits } from "viem";
import type { ContractSigner } from "../signers/types";
import { recordDecision } from "../ledger";
import { generateRationale } from "../rationale";
import { ActionType } from "@arcos/shared";

/** Stands in for a human/multisig approver. A single dev-controlled wallet, used
 *  deliberately as a simulated governance gate for this hackathon build — not real
 *  multisig governance. Every approval/refund it takes is still a real on-chain action,
 *  logged to DecisionLedger like any agent decision. */
export class GovernanceAgent {
  constructor(
    private signer: ContractSigner,
    private treasuryPolicyAddress: `0x${string}`,
    private escrowAddress: `0x${string}`,
    private ledgerAddress: `0x${string}`,
  ) {}

  async approveSpend(spendId: bigint, amountAtomic: bigint) {
    const { txHash } = await this.signer.execute({
      contractAddress: this.treasuryPolicyAddress,
      abiFunctionSignature: "approveSpend(uint256)",
      abiParameters: [spendId],
    });

    const rationale = await generateRationale(
      `Approving pending spend #${spendId} for $${formatUnits(amountAtomic, 6)} USDC — above the auto-execute threshold, requires governance sign-off.`,
      `Governance approved pending spend #${spendId} ($${formatUnits(amountAtomic, 6)} USDC, above auto-execute threshold).`,
    );

    await recordDecision({
      signer: this.signer,
      ledgerAddress: this.ledgerAddress,
      agentId: "TREASURY_AGENT",
      actionType: ActionType.GOVERNANCE_OVERRIDE,
      rationale,
      txRef: txHash,
    });

    return { txHash };
  }

  async refundEscrow(paymentId: bigint, reason: string) {
    const { txHash } = await this.signer.execute({
      contractAddress: this.escrowAddress,
      abiFunctionSignature: "refundByArbiter(uint256)",
      abiParameters: [paymentId],
    });

    const rationale = await generateRationale(
      `Refunding escrow payment #${paymentId}. Reason: ${reason}`,
      `Refunded escrow payment #${paymentId}: ${reason}`,
    );

    await recordDecision({
      signer: this.signer,
      ledgerAddress: this.ledgerAddress,
      agentId: "PROCUREMENT_AGENT",
      actionType: ActionType.GOVERNANCE_OVERRIDE,
      rationale,
      txRef: txHash,
    });

    return { txHash };
  }
}
