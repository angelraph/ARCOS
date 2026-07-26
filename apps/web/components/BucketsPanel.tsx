import type { BucketState } from "@/lib/chain";

const BUCKET_COLORS: Record<string, string> = {
  Tax: "bg-warning",
  Payroll: "bg-accent-2",
  Operating: "bg-success",
  Procurement: "bg-accent",
};

export function BucketsPanel({ buckets }: { buckets: BucketState[] }) {
  const total = buckets.reduce((sum, b) => sum + parseFloat(b.balanceUsdc), 0);

  return (
    <section className="card p-5">
      <h2 className="text-sm font-medium text-muted uppercase tracking-wide">Treasury Buckets</h2>
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {buckets.map((b) => (
          <div key={b.name}>
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${BUCKET_COLORS[b.name] ?? "bg-muted"}`} />
              <span className="text-sm text-muted">{b.name}</span>
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">${b.balanceUsdc}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-surface-raised">
        <div className="flex h-full">
          {buckets.map((b) => (
            <div
              key={b.name}
              className={BUCKET_COLORS[b.name] ?? "bg-muted"}
              style={{ width: total > 0 ? `${(parseFloat(b.balanceUsdc) / total) * 100}%` : "0%" }}
            />
          ))}
        </div>
      </div>
      <div className="mt-2 text-right text-xs text-muted">Total: ${total.toFixed(2)} USDC under management</div>
    </section>
  );
}
