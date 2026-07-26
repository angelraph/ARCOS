import { formatUnits } from "viem";
import type { ContractSigner } from "../signers/types";
import { recordDecision, hashRationale } from "../ledger";
import { generateRationale } from "../rationale";
import { getSpendIdFromTx, getPaymentIdFromTx } from "../chainReader";
import { ActionType, ARC_TESTNET_USDC } from "@arcos/shared";

const PROCUREMENT_BUCKET_INDEX = 3; // Tax=0, Payroll=1, Operating=2, Procurement=3

export class ProcurementAgent {
  constructor(
    private signer: ContractSigner,
    private treasuryPolicyAddress: `0x${string}`,
    private escrowAddress: `0x${string}`,
    private ledgerAddress: `0x${string}`,
  ) {}

  /** Proposes moving `amountAtomic` out of the Procurement bucket into this agent's own
   *  wallet. Auto-executes on-chain if under TreasuryPolicy's spendThreshold; otherwise
   *  the tx still lands (creating a PendingSpend) but funds don't move until governance
   *  approves it. Returns the spendId so the orchestrator can check/await approval. */
  async proposeSpend(amountAtomic: bigint, reason: string) {
    const amountUsdc = formatUnits(amountAtomic, 6);
    const rationale = await generateRationale(
      `Proposing a $${amountUsdc} USDC spend from the Procurement bucket to restock supplies. Reason: ${reason}`,
      `Proposed a $${amountUsdc} USDC procurement spend: ${reason}`,
    );
    const rationaleHash = hashRationale(rationale);

    const { txHash } = await this.signer.execute({
      contractAddress: this.treasuryPolicyAddress,
      abiFunctionSignature: "proposeSpend(uint8,uint256,address,bytes32)",
      abiParameters: [PROCUREMENT_BUCKET_INDEX, amountAtomic, this.signer.address, rationaleHash],
    });

    const spendId = await getSpendIdFromTx(txHash);

    await recordDecision({
      signer: this.signer,
      ledgerAddress: this.ledgerAddress,
      agentId: "PROCUREMENT_AGENT",
      actionType: ActionType.PROCUREMENT_ORDER,
      rationale,
      txRef: txHash,
    });

    return { txHash, spendId };
  }

  /** Approves the Escrow contract to pull `amountAtomic` USDC from this agent's own
   *  wallet (which must already hold that much, e.g. from an executed proposeSpend),
   *  then opens escrow for the supplier. */
  async openEscrow(supplierAddress: `0x${string}`, amountAtomic: bigint, quoteRationale: string) {
    await this.signer.execute({
      contractAddress: ARC_TESTNET_USDC,
      abiFunctionSignature: "approve(address,uint256)",
      abiParameters: [this.escrowAddress, amountAtomic],
    });

    const { txHash } = await this.signer.execute({
      contractAddress: this.escrowAddress,
      abiFunctionSignature: "pay(address,uint256,address)",
      abiParameters: [supplierAddress, amountAtomic, this.signer.address],
    });

    const paymentId = await getPaymentIdFromTx(txHash);

    const rationale = await generateRationale(
      `Opened escrow for a $${formatUnits(amountAtomic, 6)} USDC order with the supplier. Supplier quote context: ${quoteRationale}`,
      `Opened escrow for a $${formatUnits(amountAtomic, 6)} USDC supplier order.`,
    );

    await recordDecision({
      signer: this.signer,
      ledgerAddress: this.ledgerAddress,
      agentId: "PROCUREMENT_AGENT",
      actionType: ActionType.ESCROW_OPEN,
      rationale,
      txRef: txHash,
    });

    // Also record the Supplier's quote decision, attributed to SUPPLIER_AGENT but keyed
    // to this same escrow-open tx — both decisions describe the same on-chain action
    // from each agent's own side of the negotiation.
    await recordDecision({
      signer: this.signer,
      ledgerAddress: this.ledgerAddress,
      agentId: "SUPPLIER_AGENT",
      actionType: ActionType.SUPPLIER_QUOTE,
      rationale: quoteRationale,
      txRef: txHash,
    });

    return { txHash, paymentId };
  }
}
