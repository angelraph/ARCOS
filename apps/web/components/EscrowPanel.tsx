import type { EscrowPayment } from "@/lib/chain";
import { explorerAddressUrl } from "@/lib/format";
import { ExplorerLink } from "./ExplorerLink";

export function EscrowPanel({ payments }: { payments: EscrowPayment[] }) {
  return (
    <section className="card p-5">
      <h2 className="text-sm font-medium text-muted uppercase tracking-wide">Escrow</h2>
      <div className="mt-4 space-y-3">
        {payments.length === 0 && <p className="text-sm text-muted">No escrow payments yet.</p>}
        {payments.map((p) => (
          <div key={p.paymentId} className="flex items-center justify-between rounded-lg bg-surface-raised px-4 py-3">
            <div>
              <div className="text-sm font-medium">Payment #{p.paymentId}: ${p.amountUsdc} USDC</div>
              <div className="text-xs text-muted">
                to <ExplorerLink href={explorerAddressUrl(p.to)} value={p.to} />
              </div>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                p.refunded
                  ? "bg-danger/20 text-danger"
                  : p.withdrawn
                    ? "bg-success/20 text-success"
                    : "bg-warning/20 text-warning"
              }`}
            >
              {p.refunded ? "Refunded" : p.withdrawn ? "Released" : "Pending delivery"}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
