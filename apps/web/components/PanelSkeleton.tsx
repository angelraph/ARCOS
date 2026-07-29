export function PanelSkeleton({
  title,
  rows = 3,
  variant = "list",
}: {
  title: string;
  rows?: number;
  variant?: "list" | "grid";
}) {
  return (
    <section className="card p-5" aria-busy="true" aria-label={`${title} loading`}>
      <div className="h-3 w-32 rounded bg-surface-raised animate-pulse" />
      <div className={variant === "grid" ? "mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4" : "mt-4 space-y-3"}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-12 rounded-lg bg-surface-raised animate-pulse" />
        ))}
      </div>
    </section>
  );
}
