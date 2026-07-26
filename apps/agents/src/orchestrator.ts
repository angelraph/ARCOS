import { parseUnits } from "viem";
import { TreasuryAgent } from "./agents/treasuryAgent";
import { ProcurementAgent } from "./agents/procurementAgent";
import { SupplierAgent } from "./agents/supplierAgent";
import { GovernanceAgent } from "./agents/governanceAgent";
import { isSpendExecuted } from "./chainReader";
import type { AgentSigners } from "./signers";

export interface OrchestratorConfig {
  treasuryPolicyAddress: `0x${string}`;
  escrowAddress: `0x${string}`;
  ledgerAddress: `0x${string}`;
}

export interface FlowStep {
  step: number;
  totalSteps: number;
  label: string;
  detail?: string;
  txHash?: `0x${string}`;
}

export type StepListener = (event: FlowStep) => void;

// Intentionally simplified: a real deployment would check a POS/inventory system. Out of
// scope for this build, see docs/circle-feedback.md and the plan's explicit scope cuts.
function isInventoryLow(): boolean {
  return true;
}

/** Runs one full ARCOS cycle: payment, treasury allocation, procurement negotiation,
 *  escrow, delivery confirmation, release, with decision ledger entries throughout and a
 *  governance gate on any above-threshold spend. Deterministic state machine with an
 *  LLM-generated rationale at each step, not a free-form autonomous loop.
 *  `onStep` is called after each real on-chain step completes, used by both the CLI
 *  (prints to stdout) and the dashboard's live execution page (streams to the browser
 *  over SSE) so there's exactly one implementation of the flow, not two.
 *  `recipientAddress`, if given, is a real address supplied by whoever is running the
 *  flow. Escrow.sol only lets the actual recipient wallet call withdraw(), so if this
 *  isn't ARCOS's own Supplier wallet, the flow opens a real, standing escrow payment to
 *  that address and stops there. Only that address's owner (with their own wallet) can
 *  release it, or Governance can refund it. It does not fake a release on their behalf. */
export async function runFlow(
  signers: AgentSigners,
  config: OrchestratorConfig,
  paymentUsdc: string,
  procurementUsdc: string,
  onStep: StepListener = () => {},
  recipientAddress?: `0x${string}`,
) {
  const TOTAL = 6;
  const treasuryAgent = new TreasuryAgent(signers.treasury, config.treasuryPolicyAddress, config.ledgerAddress);
  const procurementAgent = new ProcurementAgent(signers.procurement, config.treasuryPolicyAddress, config.escrowAddress, config.ledgerAddress);
  const supplierAgent = new SupplierAgent(signers.supplier, config.escrowAddress, config.ledgerAddress);
  const governanceAgent = new GovernanceAgent(signers.governance, config.treasuryPolicyAddress, config.escrowAddress, config.ledgerAddress);

  const recipient = recipientAddress ?? signers.supplier.address;
  const isCustomRecipient = recipient.toLowerCase() !== signers.supplier.address.toLowerCase();

  const paymentAtomic = parseUnits(paymentUsdc, 6);
  const procurementAtomic = parseUnits(procurementUsdc, 6);

  const payment = await treasuryAgent.receivePayment(signers.customer, paymentAtomic);
  onStep({ step: 1, totalSteps: TOTAL, label: `Customer paid $${paymentUsdc} USDC. Treasury Agent allocated it across policy buckets.`, txHash: payment.txHash });

  if (!isInventoryLow()) {
    onStep({ step: TOTAL, totalSteps: TOTAL, label: "Inventory not low, flow ends after treasury allocation." });
    return;
  }

  const proposal = await procurementAgent.proposeSpend(procurementAtomic, "Restocking low inventory item");
  const alreadyExecuted = await isSpendExecuted(config.treasuryPolicyAddress, proposal.spendId);

  if (!alreadyExecuted) {
    onStep({
      step: 2,
      totalSteps: TOTAL,
      label: `Procurement Agent proposed a $${procurementUsdc} USDC spend. It's above threshold, so it's paused for governance.`,
      txHash: proposal.txHash,
    });
    const approval = await governanceAgent.approveSpend(proposal.spendId, procurementAtomic);
    onStep({ step: 3, totalSteps: TOTAL, label: "Governance approved the spend.", txHash: approval.txHash });
  } else {
    onStep({
      step: 2,
      totalSteps: TOTAL,
      label: `Procurement Agent proposed and auto-executed a $${procurementUsdc} USDC spend (under threshold).`,
      txHash: proposal.txHash,
    });
    onStep({ step: 3, totalSteps: TOTAL, label: "No governance approval needed (under threshold)." });
  }

  const quote = await supplierAgent.quote("Fresh produce restock", procurementAtomic);
  onStep({ step: 4, totalSteps: TOTAL, label: `Supplier Agent quoted: "${quote.rationale}"` });

  const escrow = await procurementAgent.openEscrow(recipient, procurementAtomic, quote.rationale);
  onStep({
    step: 5,
    totalSteps: TOTAL,
    label: isCustomRecipient
      ? `Procurement Agent opened escrow (payment #${escrow.paymentId}) to your address.`
      : `Procurement Agent opened escrow (payment #${escrow.paymentId}).`,
    txHash: escrow.txHash,
  });

  if (isCustomRecipient) {
    onStep({
      step: 6,
      totalSteps: TOTAL,
      label: `Funds are now held in escrow for ${recipient}. Only that wallet can release them by calling withdraw, or Governance can refund the payer. ARCOS won't release it on your behalf.`,
    });
    return;
  }

  const release = await supplierAgent.confirmAndRelease(escrow.paymentId, { description: "Fresh produce restock delivered" });

  if (release.approved) {
    onStep({ step: 6, totalSteps: TOTAL, label: "Delivery confirmed. Escrow released to Supplier.", txHash: release.txHash });
  } else {
    const refund = await governanceAgent.refundEscrow(escrow.paymentId, "Delivery validation failed");
    onStep({ step: 6, totalSteps: TOTAL, label: "Delivery rejected. Governance refunded the payer.", txHash: refund.txHash });
  }
}
