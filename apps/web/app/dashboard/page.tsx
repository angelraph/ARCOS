import { Suspense } from "react";
import { BucketsPanel } from "@/components/BucketsPanel";
import { EscrowPanel } from "@/components/EscrowPanel";
import { GovernancePanel } from "@/components/GovernancePanel";
import { DecisionLedgerPanel } from "@/components/DecisionLedgerPanel";
import { AgentWalletsPanel } from "@/components/AgentWalletsPanel";
import { PanelSkeleton } from "@/components/PanelSkeleton";
import {
  getBuckets,
  getDecisions,
  getEscrowPayments,
  getPendingSpends,
  getAgentWallets,
  type BucketState,
  type DecisionRow,
  type EscrowPayment,
  type PendingSpendRow,
  type AgentWallet,
} from "@/lib/chain";
import { getRationales } from "@/lib/rationales";
import { addresses } from "@arcos/shared";
import { explorerAddressUrl } from "@/lib/format";
import { ExplorerLink } from "@/components/ExplorerLink";

export const revalidate = 0;

async function BucketsPanelAsync({ promise }: { promise: Promise<BucketState[]> }) {
  return <BucketsPanel buckets={await promise} />;
}

async function EscrowPanelAsync({ promise }: { promise: Promise<EscrowPayment[]> }) {
  return <EscrowPanel payments={await promise} />;
}

async function GovernancePanelAsync({ promise }: { promise: Promise<PendingSpendRow[]> }) {
  return <GovernancePanel spends={await promise} />;
}

async function DecisionLedgerPanelAsync({ promise }: { promise: Promise<DecisionRow[]> }) {
  const [decisions, rationales] = await Promise.all([promise, getRationales()]);
  return <DecisionLedgerPanel decisions={decisions} rationales={rationales} />;
}

async function AgentWalletsPanelAsync({ promise }: { promise: Promise<AgentWallet[]> }) {
  return <AgentWalletsPanel wallets={await promise} />;
}

export default function DashboardPage() {
  // Sequential, not Promise.all — Arc Testnet's default RPC endpoint rate-limits under
  // concurrent load (observed directly), even with per-call multicall batching. Each promise
  // still only starts once the previous one settles (same RPC load as before); wrapping each
  // panel in its own Suspense boundary lets it stream in as soon as its own data resolves
  // instead of blocking the whole page behind the slowest fetch.
  const bucketsPromise = getBuckets();
  const decisionsPromise = bucketsPromise.then(() => getDecisions());
  const paymentsPromise = decisionsPromise.then(() => getEscrowPayments());
  const pendingPromise = paymentsPromise.then(() => getPendingSpends());
  const walletsPromise = pendingPromise.then(() => getAgentWallets());

  return (
    <main
      className="flex-1 px-4 sm:px-6 py-6 space-y-6 max-w-7xl w-full mx-auto"
      style={{ "--gradient-angle": "160deg" } as React.CSSProperties}
    >
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

      <Suspense fallback={<PanelSkeleton title="Treasury Buckets" rows={4} variant="grid" />}>
        <BucketsPanelAsync promise={bucketsPromise} />
      </Suspense>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Suspense fallback={<PanelSkeleton title="Escrow" rows={3} />}>
          <EscrowPanelAsync promise={paymentsPromise} />
        </Suspense>
        <Suspense fallback={<PanelSkeleton title="Governance" rows={3} />}>
          <GovernancePanelAsync promise={pendingPromise} />
        </Suspense>
      </div>

      <Suspense fallback={<PanelSkeleton title="Decision Ledger" rows={4} />}>
        <DecisionLedgerPanelAsync promise={decisionsPromise} />
      </Suspense>

      <Suspense fallback={<PanelSkeleton title="Agent Wallets" rows={5} />}>
        <AgentWalletsPanelAsync promise={walletsPromise} />
      </Suspense>
    </main>
  );
}
