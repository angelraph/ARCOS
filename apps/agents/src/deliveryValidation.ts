// Delivery confirmation oracle. Stubbed today (always approves) — swap this for
// arc-escrow's OpenAI-vision deliverable check (lib/utils in that sample repo) once the
// dashboard's delivery-evidence upload flow exists. Kept behind one function so that swap
// touches nothing else in the orchestrator.
export interface DeliveryEvidence {
  description: string;
  /** Path or URL to a photo of the delivered goods, once the real vision check is wired in. */
  imageRef?: string;
}

export async function validateDelivery(evidence: DeliveryEvidence): Promise<{ approved: boolean; reason: string }> {
  return {
    approved: true,
    reason: `Mock validation (no vision model wired up yet): accepted "${evidence.description}" on trust.`,
  };
}
