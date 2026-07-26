import { formatUnits } from "viem";
import type { ContractSigner } from "../signers/types";
import { recordDecision } from "../ledger";
import { generateRationale } from "../rationale";
import { ActionType, ARC_TESTNET_USDC } from "@arcos/shared";

export class TreasuryAgent {
  constructor(
    private signer: ContractSigner,
    private treasuryPolicyAddress: `0x${string}`,
    private ledgerAddress: `0x${string}`,
  ) {}

  /** The customer wallet must already hold at least `amountAtomic` USDC. Approves
   *  TreasuryPolicy to pull it, then calls receivePayment to pull and allocate it across
   *  policy buckets, then records the Treasury Agent's rationale on-chain. */
  async receivePayment(customerSigner: ContractSigner, amountAtomic: bigint) {
    await customerSigner.execute({
      contractAddress: ARC_TESTNET_USDC,
      abiFunctionSignature: "approve(address,uint256)",
      abiParameters: [this.treasuryPolicyAddress, amountAtomic],
    });

    const { txHash } = await customerSigner.execute({
      contractAddress: this.treasuryPolicyAddress,
      abiFunctionSignature: "receivePayment(uint256)",
      abiParameters: [amountAtomic],
    });

    const rationale = await generateRationale(
      `A customer payment of $${formatUnits(amountAtomic, 6)} USDC was received and split across the Tax/Payroll/Operating/Procurement buckets per the configured policy percentages.`,
      `Allocated a $${formatUnits(amountAtomic, 6)} USDC payment across policy buckets per configured basis points.`,
    );

    await recordDecision({
      signer: this.signer,
      ledgerAddress: this.ledgerAddress,
      agentId: "TREASURY_AGENT",
      actionType: ActionType.TREASURY_ALLOCATION,
      rationale,
      txRef: txHash,
    });

    return { txHash };
  }
}
