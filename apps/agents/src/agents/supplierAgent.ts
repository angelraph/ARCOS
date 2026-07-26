import { formatUnits } from "viem";
import type { ContractSigner } from "../signers/types";
import { recordDecision } from "../ledger";
import { generateRationale } from "../rationale";
import { validateDelivery, type DeliveryEvidence } from "../deliveryValidation";
import { ActionType } from "@arcos/shared";

export class SupplierAgent {
  constructor(
    private signer: ContractSigner,
    private escrowAddress: `0x${string}`,
    private ledgerAddress: `0x${string}`,
  ) {}

  /** Pure off-chain negotiation step — no contract call yet. Returns a price quote and
   *  the rationale text, which ProcurementAgent.openEscrow later logs to the ledger keyed
   *  to the resulting escrow-open tx (there's no tx to reference until escrow opens). */
  async quote(itemDescription: string, amountAtomic: bigint): Promise<{ rationale: string }> {
    const amountUsdc = formatUnits(amountAtomic, 6);
    const rationale = await generateRationale(
      `Quoting $${amountUsdc} USDC for: ${itemDescription}. Confirm this is competitive and in stock.`,
      `Quoted $${amountUsdc} USDC for ${itemDescription}, in stock and ready to ship.`,
    );
    return { rationale };
  }

  /** Runs the delivery-confirmation oracle, then either releases escrow (this agent is
   *  the payment recipient, so it calls withdraw itself) or leaves it for governance to
   *  refund via refundByArbiter. Returns whether delivery was approved. */
  async confirmAndRelease(paymentId: bigint, evidence: DeliveryEvidence): Promise<{ approved: boolean; txHash?: `0x${string}` }> {
    const validation = await validateDelivery(evidence);

    if (!validation.approved) {
      return { approved: false };
    }

    const { txHash } = await this.signer.execute({
      contractAddress: this.escrowAddress,
      abiFunctionSignature: "withdraw(uint256[])",
      abiParameters: [[paymentId]],
    });

    const rationale = await generateRationale(
      `Delivery confirmed (${validation.reason}). Releasing escrow payment #${paymentId}.`,
      `Delivery confirmed: ${validation.reason}. Escrow payment #${paymentId} released.`,
    );

    await recordDecision({
      signer: this.signer,
      ledgerAddress: this.ledgerAddress,
      agentId: "SUPPLIER_AGENT",
      actionType: ActionType.ESCROW_RELEASE,
      rationale,
      txRef: txHash,
    });

    return { approved: true, txHash };
  }
}
