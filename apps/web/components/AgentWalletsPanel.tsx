"use client";

import { useState } from "react";
import type { AgentWallet } from "@/lib/chain";

const FAUCET_URL = "https://faucet.circle.com/?chain=ARC&token=USDC";

const ROLE_LABELS: Record<string, string> = {
  TREASURY: "Treasury",
  PROCUREMENT: "Procurement",
  SUPPLIER: "Supplier",
  GOVERNANCE: "Governance",
  CUSTOMER: "Customer",
};

function FundButton({ address }: { address: `0x${string}` }) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    // Circle's faucet form has no way to pre-fill the address via URL, so this is the
    // closest thing to one click: copy the address, then open the faucet in a new tab
    // ready to paste into.
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard permission denied or unavailable — the faucet still opens either way,
      // the address is right there in the row to copy by hand.
    }
    window.open(FAUCET_URL, "_blank", "noreferrer");
  }

  return (
    <button
      onClick={handleClick}
      className="rounded-md border border-border bg-surface-raised px-3 py-1.5 text-xs font-medium hover:bg-surface-raised/70 whitespace-nowrap"
      title="Copies the address, then opens Circle's testnet faucet in a new tab"
    >
      {copied ? "Copied ✓ — paste in faucet" : "Copy address & open faucet"}
    </button>
  );
}

export function AgentWalletsPanel({ wallets }: { wallets: AgentWallet[] }) {
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
              {w.address && <FundButton address={w.address} />}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
