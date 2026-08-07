import { parseUnits, formatUnits, type Hex } from "viem";
import { TreasuryAgent } from "./agents/treasuryAgent";
import { ProcurementAgent } from "./agents/procurementAgent";
import { SupplierAgent } from "./agents/supplierAgent";
import { GovernanceAgent } from "./agents/governanceAgent";
import { isSpendExecuted } from "./chainReader";
import { startQuoteServer } from "./gateway/quoteServer";
import { requestPaidQuote } from "./gateway/quoteClient";
import type { AgentSigners } from "./signers";

export interface OrchestratorConfig {
  treasuryPolicyAddress: `0x${string}`;
  escrowAddress: `0x${string}`;
  ledgerAddress: `0x${string}`;
  /** See gateway/quoteClient.ts. Omit to skip the paid-quote leg entirely. */
  gatewayBuyerPrivateKey?: Hex;
  quoteFeeUsdc?: string;
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
  const TOTAL = 7;
  const treasuryAgent = new TreasuryAgent(signers.treasury, config.treasuryPolicyAddress, config.ledgerAddress);
  const procurementAgent = new ProcurementAgent(signers.procurement, config.treasuryPolicyAddress, config.escrowAddress, config.ledgerAddress);
  const supplierAgent = new SupplierAgent(signers.supplier, config.escrowAddress, config.ledgerAddress);
  const governanceAgent = new GovernanceAgent(signers.governance, config.treasuryPolicyAddress, config.escrowAddress, config.ledgerAddress);

  const recipient = recipientAddress ?? signers.supplier.address;
  const isCustomRecipient = recipient.toLowerCase() !== signers.supplier.address.toLowerCase();

  const paymentAtomic = parseUnits(paymentUsdc, 6);
  // let, not const: proposeSpend below may clamp this down to what the (shared, public-demo)
  // Procurement bucket actually has available -- every later step has to move that same
  // real amount, not the originally requested one.
  let procurementAtomic = parseUnits(procurementUsdc, 6);

  const payment = await treasuryAgent.receivePayment(signers.customer, paymentAtomic);
  onStep({ step: 1, totalSteps: TOTAL, label: `Customer paid $${paymentUsdc} USDC. Treasury Agent allocated it across policy buckets.`, txHash: payment.txHash });

  if (!isInventoryLow()) {
    onStep({ step: TOTAL, totalSteps: TOTAL, label: "Inventory not low, flow ends after treasury allocation." });
    return;
  }

  const proposal = await procurementAgent.proposeSpend(procurementAtomic, "Restocking low inventory item");
  // The Procurement bucket is a shared balance across every run of this public demo, so
  // proposeSpend may have clamped the request down to whatever was actually available --
  // every step after this one has to move the same amount that was actually proposed
  // on-chain (procurementAtomic below is now stale if a clamp happened), or a later step
  // (approve/pay in openEscrow) would try to move more than the agent's wallet received.
  procurementAtomic = proposal.amountAtomic;
  procurementUsdc = formatUnits(proposal.amountAtomic, 6);
  const alreadyExecuted = await isSpendExecuted(config.treasuryPolicyAddress, proposal.spendId);

  const clampNote = proposal.wasClamped
    ? ` (the Procurement bucket is a shared demo balance and didn't have the full amount available, so this was reduced to what it could actually cover)`
    : "";

  if (!alreadyExecuted) {
    onStep({
      step: 2,
      totalSteps: TOTAL,
      label: `Procurement Agent proposed a $${procurementUsdc} USDC spend${clampNote}. It's above threshold, so it's paused for governance.`,
      txHash: proposal.txHash,
    });
    const approval = await governanceAgent.approveSpend(proposal.spendId, procurementAtomic);
    onStep({ step: 3, totalSteps: TOTAL, label: "Governance approved the spend.", txHash: approval.txHash });
  } else {
    onStep({
      step: 2,
      totalSteps: TOTAL,
      label: `Procurement Agent proposed and auto-executed a $${procurementUsdc} USDC spend (under threshold)${clampNote}.`,
      txHash: proposal.txHash,
    });
    onStep({ step: 3, totalSteps: TOTAL, label: "No governance approval needed (under threshold)." });
  }

  let quote: { rationale: string };
  if (config.gatewayBuyerPrivateKey) {
    const feeUsdc = config.quoteFeeUsdc ?? "0.02";
    const quoteServer = await startQuoteServer(supplierAgent, signers.supplier.address, feeUsdc);
    try {
      const paid = await requestPaidQuote(quoteServer.url, "Fresh produce restock", procurementAtomic, config.gatewayBuyerPrivateKey);
      quote = { rationale: `${paid.rationale} (Quote paid for with a $${paid.feeUsdc} USDC gas-free Circle Gateway/x402 micropayment.)` };
      onStep({
        step: 4,
        totalSteps: TOTAL,
        label: `Procurement Agent paid $${feeUsdc} USDC gas-free via Circle Gateway (x402) for the Supplier Agent's quote.`,
        txHash: /^0x[a-fA-F0-9]{64}$/.test(paid.settlementRef) ? (paid.settlementRef as `0x${string}`) : undefined,
      });
    } catch (err) {
      // Gateway is a live third-party settlement network the flow doesn't control — a
      // rejected/unavailable payment (insufficient Gateway balance, a facilitator hiccup,
      // etc.) degrades to the unpaid quote rather than failing the whole run. Settlement
      // itself is confirmed working end to end on Arc Testnet as of x402-batching@3.2.0 —
      // see docs/circle-feedback.md for two SDK/facilitator-config bugs found and fixed
      // along the way.
      const message = err instanceof Error ? err.message : String(err);
      quote = await supplierAgent.quote("Fresh produce restock", procurementAtomic);
      onStep({
        step: 4,
        totalSteps: TOTAL,
        label: `Circle Gateway payment for the quote didn't settle (${message}) — falling back to an unpaid quote.`,
      });
    } finally {
      await quoteServer.close();
    }
  } else {
    quote = await supplierAgent.quote("Fresh produce restock", procurementAtomic);
    onStep({ step: 4, totalSteps: TOTAL, label: "No Gateway buyer key configured — skipping the paid-quote leg." });
  }
  onStep({ step: 5, totalSteps: TOTAL, label: `Supplier Agent quoted: "${quote.rationale}"` });

  const escrow = await procurementAgent.openEscrow(recipient, procurementAtomic, quote.rationale);
  onStep({
    step: 6,
    totalSteps: TOTAL,
    label: isCustomRecipient
      ? `Procurement Agent opened escrow (payment #${escrow.paymentId}) to your address.`
      : `Procurement Agent opened escrow (payment #${escrow.paymentId}).`,
    txHash: escrow.txHash,
  });

  if (isCustomRecipient) {
    onStep({
      step: 7,
      totalSteps: TOTAL,
      label: `Funds are now held in escrow for ${recipient}. Only that wallet can release them by calling withdraw, or Governance can refund the payer. ARCOS won't release it on your behalf.`,
    });
    return;
  }

  const release = await supplierAgent.confirmAndRelease(escrow.paymentId, { description: "Fresh produce restock delivered" });

  if (release.approved) {
    onStep({ step: 7, totalSteps: TOTAL, label: "Delivery confirmed. Escrow released to Supplier.", txHash: release.txHash });
  } else {
    const refund = await governanceAgent.refundEscrow(escrow.paymentId, "Delivery validation failed");
    onStep({ step: 7, totalSteps: TOTAL, label: "Delivery rejected. Governance refunded the payer.", txHash: refund.txHash });
  }
}
