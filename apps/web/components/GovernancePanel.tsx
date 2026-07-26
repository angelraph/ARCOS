import type { PendingSpendRow } from "@/lib/chain";
import { explorerAddressUrl } from "@/lib/format";
import { ExplorerLink } from "./ExplorerLink";

const BUCKET_NAMES = ["Tax", "Payroll", "Operating", "Procurement"];

export function GovernancePanel({ spends }: { spends: PendingSpendRow[] }) {
  const pending = spends.filter((s) => !s.executed);
  const resolved = spends.filter((s) => s.executed).slice(0, 5);

  return (
    <section className="card p-5">
      <h2 className="text-sm font-medium text-muted uppercase tracking-wide">Governance</h2>

      {pending.length > 0 && (
        <div className="mt-4 space-y-2">
          {pending.map((s) => (
            <div key={s.spendId} className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3">
              <div className="text-sm font-medium text-warning">Awaiting approval: Spend #{s.spendId}</div>
              <div className="text-xs text-muted">
                ${s.amountUsdc} USDC from {BUCKET_NAMES[s.bucketIndex]} to{" "}
                <ExplorerLink href={explorerAddressUrl(s.to)} value={s.to} />
              </div>
            </div>
          ))}
        </div>
      )}

      {pending.length === 0 && <p className="mt-4 text-sm text-muted">No spends currently awaiting approval.</p>}

      {resolved.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <div className="text-xs text-muted mb-2">Recently resolved</div>
          <div className="space-y-1">
            {resolved.map((s) => (
              <div key={s.spendId} className="flex justify-between text-xs">
                <span>Spend #{s.spendId} · {BUCKET_NAMES[s.bucketIndex]}</span>
                <span className="text-success">${s.amountUsdc} executed</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
