import { formatUnits } from "viem";
import type { ContractSigner } from "../signers/types";
import { recordDecision, hashRationale } from "../ledger";
import { generateRationale } from "../rationale";
import { getSpendIdFromTx, getPaymentIdFromTx, publicClient } from "../chainReader";
import { ActionType, ARC_TESTNET_USDC, TreasuryPolicyAbi } from "@arcos/shared";

const PROCUREMENT_BUCKET_INDEX = 3; // Tax=0, Payroll=1, Operating=2, Procurement=3
// Below this, don't even attempt a spend -- not enough left to do anything meaningful with,
// and it's not worth surfacing a wei-sized "adjusted" spend to whoever's running the demo.
const DUST_THRESHOLD_ATOMIC = 10_000n; // $0.01 (USDC has 6 decimals)

export class ProcurementAgent {
  constructor(
    private signer: ContractSigner,
    private treasuryPolicyAddress: `0x${string}`,
    private escrowAddress: `0x${string}`,
    private ledgerAddress: `0x${string}`,
  ) {}

  /** Proposes moving `requestedAtomic` out of the Procurement bucket into this agent's own
   *  wallet. Auto-executes on-chain if under TreasuryPolicy's spendThreshold; otherwise
   *  the tx still lands (creating a PendingSpend) but funds don't move until governance
   *  approves it. Returns the spendId so the orchestrator can check/await approval.
   *
   *  The Procurement bucket is a shared balance across every run of this public demo (it
   *  only ever receives 20% of each customer payment, per the deployed bps split) --
   *  someone else's run can deplete it between when this page loaded and when this call
   *  fires. Rather than let TreasuryPolicy's `InsufficientBucketBalance` revert bubble up
   *  as a raw on-chain error, read the actual current balance first and clamp the spend
   *  down to what's really available, so the flow degrades gracefully instead of failing. */
  async proposeSpend(requestedAtomic: bigint, reason: string) {
    const bucket = (await publicClient.readContract({
      address: this.treasuryPolicyAddress,
      abi: TreasuryPolicyAbi,
      functionName: "buckets",
      args: [PROCUREMENT_BUCKET_INDEX],
    })) as readonly [string, number, bigint]; // [name, bps, balance]
    const available = bucket[2];

    if (available < DUST_THRESHOLD_ATOMIC) {
      throw new Error(
        `Procurement bucket is essentially empty right now ($${formatUnits(available, 6)} available) -- ` +
          `it's a shared balance across everyone running this public demo. Try again shortly, or run a ` +
          `larger customer payment first so more flows into it.`,
      );
    }

    const amountAtomic = requestedAtomic > available ? available : requestedAtomic;
    const wasClamped = amountAtomic < requestedAtomic;
    const amountUsdc = formatUnits(amountAtomic, 6);
    const rationale = await generateRationale(
      `Proposing a $${amountUsdc} USDC spend from the Procurement bucket to restock supplies. Reason: ${reason}` +
        (wasClamped ? ` (requested $${formatUnits(requestedAtomic, 6)}, but only $${amountUsdc} was available in the bucket.)` : ""),
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

    return { txHash, spendId, amountAtomic, wasClamped };
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
