import type { DecisionRow } from "@/lib/chain";
import type { RationaleEntry } from "@/lib/rationales";
import { verifyRationale } from "@/lib/rationales";
import { explorerTxUrl } from "@/lib/format";
import { ExplorerLink } from "./ExplorerLink";
import { formatActionType } from "@/lib/format";

const AGENT_COLORS: Record<string, string> = {
  TREASURY_AGENT: "text-accent-2",
  PROCUREMENT_AGENT: "text-accent",
  SUPPLIER_AGENT: "text-success",
};

export function DecisionLedgerPanel({ decisions, rationales }: { decisions: DecisionRow[]; rationales: RationaleEntry[] }) {
  const rationaleByHash = new Map(rationales.map((r) => [r.rationaleHash, r.rationale]));

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted uppercase tracking-wide">Decision Ledger</h2>
        <span className="text-xs text-muted">{decisions.length} decisions recorded on-chain</span>
      </div>
      <div className="mt-4 space-y-2 max-h-[420px] overflow-y-auto">
        {decisions.length === 0 && <p className="text-sm text-muted">No decisions recorded yet.</p>}
        {decisions.map((d) => {
          const rationale = rationaleByHash.get(d.rationaleHash);
          const verified = rationale ? verifyRationale(rationale, d.rationaleHash) : null;

          return (
            <div key={`${d.decisionId}-${d.ledgerTxHash}`} className="rounded-lg bg-surface-raised px-4 py-3">
              <div className="flex items-center justify-between">
                <span className={`text-xs font-semibold ${AGENT_COLORS[d.agentId] ?? "text-muted"}`}>{d.agentId}</span>
                <span className="text-xs text-muted">{formatActionType(d.actionType)}</span>
              </div>
              {rationale && <p className="mt-1 text-sm">{rationale}</p>}
              <div className="mt-2 flex items-center justify-between text-xs">
                <span>
                  ledger tx <ExplorerLink href={explorerTxUrl(d.ledgerTxHash)} value={d.ledgerTxHash} />
                  {" · "}
                  ref <ExplorerLink href={explorerTxUrl(d.txRef)} value={d.txRef} />
                </span>
                {verified !== null && (
                  <span className={verified ? "text-success" : "text-danger"}>
                    {verified ? "✓ hash verified" : "✗ hash mismatch"}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
