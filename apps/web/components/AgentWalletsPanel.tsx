"use client";

import { useEffect, useState } from "react";
import type { AgentWallet } from "@/lib/chain";

const FAUCET_URL = "https://faucet.circle.com/?chain=ARC&token=USDC";

const ROLE_LABELS: Record<string, string> = {
  TREASURY: "Treasury",
  PROCUREMENT: "Procurement",
  SUPPLIER: "Supplier",
  GOVERNANCE: "Governance",
  CUSTOMER: "Customer",
};

function FundModal({ wallet, onClose }: { wallet: AgentWallet; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleCopy() {
    if (!wallet.address) return;
    try {
      await navigator.clipboard.writeText(wallet.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard permission denied or unavailable — the address is still right there,
      // selectable, to copy by hand.
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold">Fund the {ROLE_LABELS[wallet.role] ?? wallet.role} wallet</h3>
            <p className="mt-1 text-xs text-muted">
              Copy this address, then continue to Circle's testnet faucet and paste it into the &ldquo;Send to&rdquo; field.
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-md p-1 text-muted hover:bg-surface-raised hover:text-text"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-surface-raised px-3 py-3">
          <code className="mono flex-1 select-all break-all text-sm">{wallet.address}</code>
        </div>

        <div className="mt-3 flex items-center justify-between text-xs text-muted">
          <span>
            Currently ${parseFloat(wallet.usdcBalance).toFixed(2)} USDC · {parseFloat(wallet.nativeBalance).toFixed(2)} native gas
          </span>
          {wallet.low && <span className="font-medium text-warning">Below $10 — could use a top-up</span>}
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <button
            onClick={handleCopy}
            className="flex-1 rounded-lg border border-border bg-surface-raised px-4 py-2.5 text-sm font-medium hover:bg-surface-raised/70"
          >
            {copied ? "Copied ✓" : "Copy address"}
          </button>
          <a
            href={FAUCET_URL}
            target="_blank"
            rel="noreferrer"
            onClick={onClose}
            className="flex-1 rounded-lg bg-accent-2 px-4 py-2.5 text-center text-sm font-medium text-white hover:opacity-90"
          >
            Continue to Circle Faucet →
          </a>
        </div>
      </div>
    </div>
  );
}

export function AgentWalletsPanel({ wallets }: { wallets: AgentWallet[] }) {
  const [selected, setSelected] = useState<AgentWallet | null>(null);

  return (
    <section className="card p-5">
      <h2 className="text-sm font-medium text-muted uppercase tracking-wide">Agent Wallets</h2>
      <p className="mt-1 text-xs text-muted">
        Five real Circle Developer-Controlled Wallets on Arc Testnet, shared across everyone running this public demo. Customer is the only
        one that only ever drains — every run pulls its payment straight from there — so it's the one that needs occasional top-ups.
      </p>

      <div className="mt-4 space-y-2">
        {wallets.map((w) => (
          <div
            key={w.role}
            className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 ${
              w.low ? "border-warning/40 bg-warning/10" : "border-border bg-surface-raised"
            }`}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{ROLE_LABELS[w.role] ?? w.role}</span>
                {w.low && (
                  <span className="rounded-full bg-warning/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning">
                    Low
                  </span>
                )}
              </div>
              {w.address ? (
                <div className="mono mt-0.5 truncate text-xs text-muted">{w.address}</div>
              ) : (
                <div className="mt-0.5 text-xs text-muted">Address not configured</div>
              )}
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="tabular-nums text-sm font-medium">${parseFloat(w.usdcBalance).toFixed(2)}</div>
                <div className="text-[10px] text-muted">USDC</div>
              </div>
              <div className="text-right">
                <div className="tabular-nums text-sm text-muted">{parseFloat(w.nativeBalance).toFixed(2)}</div>
                <div className="text-[10px] text-muted">gas</div>
              </div>
              {w.address && (
                <button
                  onClick={() => setSelected(w)}
                  className="rounded-md border border-border bg-surface-raised px-3 py-1.5 text-xs font-medium hover:bg-surface-raised/70 whitespace-nowrap"
                >
                  Fund this wallet
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {selected && <FundModal wallet={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}
