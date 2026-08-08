import Image from "next/image";
import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="flex-1">
      {/* Hero */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 pt-12 sm:pt-16 pb-10 sm:pb-12 text-center">
        <Image src="/logo.png" alt="ARCOS" width={640} height={160} className="mx-auto h-20 sm:h-28 w-auto" priority />
        <h1 className="mt-8 text-2xl sm:text-3xl md:text-4xl font-semibold tracking-tight">
          An autonomous back office for real businesses,
          <br className="hidden sm:block" /> running on real USDC.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-sm sm:text-base text-muted">
          ARCOS is a small team of AI agents (Treasury, Procurement, Supplier, and Governance) that actually run a
          business&apos;s money operations. They allocate incoming revenue, restock inventory, negotiate and pay
          suppliers, and settle every transaction, on their own, on Arc.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/run" className="rounded-lg bg-accent-2 px-5 py-2.5 text-sm font-medium text-white hover:opacity-90">
            Run It Yourself
          </Link>
          <Link href="/engine" className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium hover:bg-surface">
            How It Works
          </Link>
          <Link href="/dashboard" className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium hover:bg-surface">
            View Live Dashboard
          </Link>
        </div>
      </section>

      {/* Problem / Solution */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 py-10 sm:py-12 grid grid-cols-1 gap-6 sm:gap-8 md:grid-cols-2">
        <div className="card p-6">
          <h2 className="text-sm font-medium uppercase tracking-wide text-danger">The problem</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Running a business&apos;s money operations means noticing low stock, negotiating with suppliers,
            approving payments, and reconciling the books. It&apos;s slow, manual, and hard to follow after the fact.
            AI agents could do all of this continuously instead of a person checking in once a day, but almost nobody
            actually lets AI agents move real money on their own, because there&apos;s no way to trust it. What stops
            an agent from making a bad call, and how would you even know why it did what it did afterward?
          </p>
        </div>
        <div className="card p-6">
          <h2 className="text-sm font-medium uppercase tracking-wide text-success">The ARCOS answer</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Two guarantees are built directly into the smart contracts, not added on as policy afterward. Every agent
            decision is permanently recorded on-chain with a verifiable rationale, so you can recompute the hash
            yourself and check it matches. And any spend above a policy threshold is{" "}
            <strong className="text-foreground">physically incapable of executing</strong> until a governance wallet
            approves it. The agents move fast and act on their own, but the money is never unaccountable.
          </p>
        </div>
      </section>

      {/* Why Arc */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 py-10 sm:py-12">
        <h2 className="text-center text-sm font-medium uppercase tracking-wide text-muted">Why this runs on Arc</h2>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:gap-6 sm:grid-cols-3">
          <div className="card p-5">
            <div className="text-2xl font-semibold text-accent">$</div>
            <h3 className="mt-2 text-sm font-medium">Dollar-denominated fees</h3>
            <p className="mt-1 text-xs text-muted">
              Gas is paid in USDC itself, not a volatile token, so an autonomous agent spending real business money
              can actually predict its own operating costs.
            </p>
          </div>
          <div className="card p-5">
            <div className="text-2xl font-semibold text-accent-2">⚡</div>
            <h3 className="mt-2 text-sm font-medium">Real-time finality</h3>
            <p className="mt-1 text-xs text-muted">
              Sub-second settlement means a payment, a procurement negotiation, and an escrow release can all happen
              in one continuous flow instead of a multi-day back-office cycle.
            </p>
          </div>
          <div className="card p-5">
            <div className="text-2xl font-semibold text-success">◎</div>
            <h3 className="mt-2 text-sm font-medium">USDC-native by design</h3>
            <p className="mt-1 text-xs text-muted">
              Arc is built for stablecoin commerce, with Circle&apos;s Wallets, Gateway, and Nanopayments stack
              available natively. Those are exactly the rails an autonomous business needs.
            </p>
          </div>
        </div>
      </section>

      {/* How it works, short */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 py-10 sm:py-12">
        <h2 className="text-center text-sm font-medium uppercase tracking-wide text-muted">The flow, in short</h2>
        <ol className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          {[
            ["1", "A customer pays", "USDC lands in TreasuryPolicy and is split across Tax, Payroll, Operating, and Procurement buckets."],
            ["2", "Procurement acts", "When stock runs low, the Procurement Agent proposes a spend and negotiates with a Supplier Agent."],
            ["3", "Governance gates it", "Any spend above the policy threshold pauses until a governance wallet approves it, for real, on-chain, not simulated."],
            ["4", "Escrow settles it", "Funds sit in escrow until delivery is confirmed, then release to the supplier. Every step is logged for good."],
          ].map(([n, title, body]) => (
            <li key={n} className="card p-5">
              <div className="text-xs font-mono text-accent">STEP {n}</div>
              <div className="mt-1 font-medium">{title}</div>
              <p className="mt-1 text-xs text-muted">{body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-center text-sm text-muted">
          <Link href="/engine" className="text-accent hover:underline">
            Read the full mechanism →
          </Link>
        </p>
      </section>

      <footer className="border-t border-border px-4 sm:px-6 py-6 text-center text-xs text-muted">
        Built on Arc Testnet for the Stablecoins Commerce Stack Challenge, Track 4: Best Agentic Economy Experience.
        Educational and testnet demo only.
      </footer>
    </main>
  );
}
