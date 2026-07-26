import { BucketsPanel } from "@/components/BucketsPanel";
import { EscrowPanel } from "@/components/EscrowPanel";
import { GovernancePanel } from "@/components/GovernancePanel";
import { DecisionLedgerPanel } from "@/components/DecisionLedgerPanel";
import { getBuckets, getDecisions, getEscrowPayments, getPendingSpends } from "@/lib/chain";
import { getRationales } from "@/lib/rationales";
import { addresses } from "@arcos/shared";
import { explorerAddressUrl } from "@/lib/format";
import { ExplorerLink } from "@/components/ExplorerLink";

export const revalidate = 0;

export default async function DashboardPage() {
  // Sequential, not Promise.all — Arc Testnet's default RPC endpoint rate-limits under
  // concurrent load (observed directly), even with per-call multicall batching. This data
  // volume is small enough that sequential fetches cost little.
  const buckets = await getBuckets();
  const decisions = await getDecisions();
  const payments = await getEscrowPayments();
  const pendingSpends = await getPendingSpends();
  const rationales = getRationales();

  return (
    <main className="flex-1 px-4 sm:px-6 py-6 space-y-6 max-w-7xl w-full mx-auto" style={{ "--gradient-angle": "160deg" } as React.CSSProperties}>
      <div>
        <h1 className="text-xl font-semibold">Live dashboard</h1>
        <p className="mt-1 text-sm text-muted">
          Real state read directly from Arc Testnet. Nothing on this page is mocked. Contracts:{" "}
          <ExplorerLink href={explorerAddressUrl(addresses.treasuryPolicy)} value={addresses.treasuryPolicy} chars={4} />
          {" · "}
          <ExplorerLink href={explorerAddressUrl(addresses.escrow)} value={addresses.escrow} chars={4} />
          {" · "}
          <ExplorerLink href={explorerAddressUrl(addresses.decisionLedger)} value={addresses.decisionLedger} chars={4} />
        </p>
      </div>

      <BucketsPanel buckets={buckets} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <EscrowPanel payments={payments} />
        <GovernancePanel spends={pendingSpends} />
      </div>

      <DecisionLedgerPanel decisions={decisions} rationales={rationales} />
    </main>
  );
}
