import { PanelSkeleton } from "@/components/PanelSkeleton";

export default function DashboardLoading() {
  return (
    <main className="flex-1 px-4 sm:px-6 py-6 space-y-6 max-w-7xl w-full mx-auto">
      <div>
        <div className="h-6 w-40 rounded bg-surface-raised animate-pulse" />
        <div className="mt-2 h-4 w-72 rounded bg-surface-raised animate-pulse" />
      </div>

      <PanelSkeleton title="Treasury Buckets" rows={4} variant="grid" />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <PanelSkeleton title="Escrow" rows={3} />
        <PanelSkeleton title="Governance" rows={3} />
      </div>

      <PanelSkeleton title="Decision Ledger" rows={4} />
    </main>
  );
}
