"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { explorerTxUrl } from "@/lib/format";

interface StepEvent {
  type: "started" | "step" | "done" | "error";
  step?: number;
  totalSteps?: number;
  label?: string;
  txHash?: string;
  message?: string;
  paymentUsdc?: string;
  procurementUsdc?: string;
}

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

export function RunClient() {
  const [payment, setPayment] = useState("2");
  const [procurement, setProcurement] = useState("1.2");
  const [recipient, setRecipient] = useState("");
  const [running, setRunning] = useState(false);
  const [events, setEvents] = useState<StepEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  const recipientTrimmed = recipient.trim();
  const recipientInvalid = recipientTrimmed.length > 0 && !ADDRESS_PATTERN.test(recipientTrimmed);

  function start() {
    if (running || recipientInvalid) return;
    setEvents([]);
    setError(null);
    setRunning(true);

    const params = new URLSearchParams({ payment, procurement });
    if (recipientTrimmed) params.set("recipient", recipientTrimmed);

    const source = new EventSource(`/api/run?${params.toString()}`);
    sourceRef.current = source;

    source.onmessage = (msg) => {
      const data = JSON.parse(msg.data) as StepEvent;
      setEvents((prev) => [...prev, data]);
      if (data.type === "done" || data.type === "error") {
        if (data.type === "error") setError(data.message ?? "Something went wrong.");
        source.close();
        setRunning(false);
      }
    };

    source.onerror = () => {
      setError("Connection to the agent engine dropped.");
      source.close();
      setRunning(false);
    };
  }

  const steps = events.filter((e) => e.type === "step");
  const done = events.some((e) => e.type === "done");

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl sm:text-2xl font-semibold">Run the engine, for real</h1>
      <p className="mt-3 text-sm text-muted">
        This triggers ARCOS&apos;s actual agents against real Circle Developer-Controlled Wallets on Arc Testnet. A
        real payment, a real governance decision, a real escrow settlement. Amounts are capped between $0.10 and $5
        so the demo wallets stay funded for everyone.
      </p>

      <div className="mt-6 card p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="text-muted">Customer payment (USDC)</span>
            <input
              type="number"
              min={0.1}
              max={5}
              step={0.1}
              value={payment}
              onChange={(e) => setPayment(e.target.value)}
              disabled={running}
              className="mt-1 w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="text-muted">Procurement spend (USDC)</span>
            <input
              type="number"
              min={0.1}
              max={5}
              step={0.1}
              value={procurement}
              onChange={(e) => setProcurement(e.target.value)}
              disabled={running}
              className="mt-1 w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm"
            />
          </label>
        </div>

        <label className="mt-4 block text-sm">
          <span className="text-muted">Recipient address (optional)</span>
          <input
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            disabled={running}
            placeholder="0x... leave blank to use ARCOS's demo supplier wallet"
            spellCheck={false}
            className="mono mt-1 w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm"
          />
          {recipientInvalid ? (
            <span className="mt-1 block text-xs text-danger">That doesn&apos;t look like a valid address (0x followed by 40 characters).</span>
          ) : (
            <span className="mt-1 block text-xs text-muted">
              This is where the procurement payment settles. If you put your own address here, the funds go into a
              real escrow held for you. Only your own wallet can release it (or Governance can refund it); ARCOS
              can&apos;t release it on your behalf.
            </span>
          )}
        </label>

        <button
          onClick={start}
          disabled={running || recipientInvalid}
          className="mt-5 w-full rounded-lg bg-accent-2 px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {running ? "Running..." : "Run ARCOS engine"}
        </button>
      </div>

      {error && <div className="mt-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>}

      {steps.length > 0 && (
        <>
        <p className="mt-6 text-xs text-muted">
          Each &quot;view tx&quot; link opens Arc Testnet&apos;s block explorer. That explorer sometimes lags or fails
          to index a transaction even though it&apos;s already confirmed on-chain. If a link shows an error, the
          transaction still happened; you can confirm it yourself by checking the live{" "}
          <Link href="/dashboard" className="text-accent hover:underline">dashboard</Link>, which reads directly from
          the chain rather than through that explorer.
        </p>
        <ol className="mt-3 space-y-3">
          {steps.map((s, i) => (
            <li key={i} className="card p-4">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>
                  Step {s.step} of {s.totalSteps}
                </span>
                {s.txHash && (
                  <a href={explorerTxUrl(s.txHash)} target="_blank" rel="noreferrer" className="mono text-accent hover:underline">
                    view tx
                  </a>
                )}
              </div>
              <p className="mt-1 text-sm">{s.label}</p>
            </li>
          ))}
        </ol>
        </>
      )}

      {done && (
        <div className="mt-6 rounded-lg border border-success/40 bg-success/10 px-4 py-3 text-sm text-success">
          Flow complete. Every step above is now permanently recorded in the Decision Ledger.{" "}
          <Link href="/dashboard" className="underline">
            View it on the live dashboard
          </Link>
        </div>
      )}
    </div>
  );
}
