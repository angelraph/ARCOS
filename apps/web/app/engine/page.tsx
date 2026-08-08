import Image from "next/image";
import Link from "next/link";
import { addresses } from "@arcos/shared";
import { explorerAddressUrl } from "@/lib/format";
import { ExplorerLink } from "@/components/ExplorerLink";

export default function EnginePage() {
  return (
    <main className="flex-1 px-4 sm:px-6 py-10 sm:py-12">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-xl sm:text-2xl font-semibold">How ARCOS actually works</h1>
        <p className="mt-3 text-sm text-muted">
          This isn&apos;t a chatbot calling an API and hoping for the best. It&apos;s four agents and three smart
          contracts running one fixed sequence, and every arrow in the diagram below is a real Arc Testnet
          transaction, not a mock.
        </p>

        <div className="card mt-8 overflow-x-auto p-2">
          <Image src="/architecture.png" alt="ARCOS architecture diagram" width={1800} height={1000} className="w-full h-auto" />
        </div>

        <section className="mt-10 space-y-6">
          <div className="card p-6">
            <h2 className="font-medium">1. TreasuryPolicy.sol: where money lands and gets divided</h2>
            <p className="mt-2 text-sm text-muted">
              A customer payment is pulled in with <code className="mono">receivePayment(amount)</code> and split by
              basis points into four buckets: Tax, Payroll, Operating, and Procurement. When an agent wants to spend
              from a bucket, it calls <code className="mono">proposeSpend(...)</code>. If the amount is at or under
              the contract&apos;s <code className="mono">spendThreshold</code>, it executes immediately. If it&apos;s
              over, the funds simply don&apos;t move. The contract itself waits for{" "}
              <code className="mono">approveSpend(...)</code> from the governance address. This isn&apos;t a UI
              permission check that could be bypassed. It&apos;s enforced in the contract&apos;s own state machine.
            </p>
            <p className="mt-2 text-xs text-muted">
              Contract: <ExplorerLink href={explorerAddressUrl(addresses.treasuryPolicy)} value={addresses.treasuryPolicy} />
            </p>
          </div>

          <div className="card p-6">
            <h2 className="font-medium">2. The four agents: a fixed sequence, not a free-form loop</h2>
            <p className="mt-2 text-sm text-muted">
              The <strong className="text-foreground">Treasury Agent</strong> allocates incoming payments and
              explains why. The <strong className="text-foreground">Procurement Agent</strong> proposes spends and
              opens escrow with suppliers. The <strong className="text-foreground">Supplier Agent</strong> quotes
              orders and releases escrow once delivery is confirmed. The{" "}
              <strong className="text-foreground">Governance Agent</strong> stands in for a human or multisig
              approver. In this build it&apos;s a single dev-controlled wallet, stated plainly, not real multisig
              governance. Each agent owns its own Circle Developer-Controlled Wallet and signs its own transactions,
              so no agent process ever holds a raw private key. The flow itself is a fixed sequence with an
              LLM-generated rationale at each step, not an open-ended autonomous loop. That&apos;s a deliberate choice
              for reliability over improvisation.
            </p>
          </div>

          <div className="card p-6">
            <h2 className="font-medium">3. Circle Gateway (x402): the Supplier&apos;s quote is a real, paid nanopayment</h2>
            <p className="mt-2 text-sm text-muted">
              Before the Procurement Agent opens escrow, it pays the Supplier Agent&apos;s quote endpoint a real,
              sub-cent, gas-free micropayment over the x402 protocol via <code className="mono">@circle-fin/x402-batching</code>.
              The Supplier Agent&apos;s side is a throwaway local HTTP endpoint gated by{" "}
              <code className="mono">gateway.require(...)</code>; the money movement itself is not local at all,
              it&apos;s signed with an EIP-3009 authorization and settled by Circle&apos;s real Gateway facilitator. This
              is the one leg of ARCOS that deliberately isn&apos;t a Circle Developer-Controlled Wallet: x402 payments
              need client-side signing, so a small, purpose-scoped local key handles only this sub-cent negotiation
              fee and never touches treasury funds. If no Gateway key is configured, or if Circle&apos;s facilitator
              doesn&apos;t settle the payment, the flow falls back to an in-process (unpaid) quote rather than
              failing — see <Link href="https://github.com/angelraph/ARCOS/blob/main/docs/circle-feedback.md" className="text-accent hover:underline">circle-feedback.md</Link> for
              a specific settlement rejection we hit and reported.
            </p>
          </div>

          <div className="card p-6">
            <h2 className="font-medium">4. Escrow.sol: funds don&apos;t move until delivery is confirmed</h2>
            <p className="mt-2 text-sm text-muted">
              Adapted from Circle&apos;s own <code className="mono">arc-escrow</code> sample. The Procurement Agent
              opens a payment naming a recipient and a refund address. The Supplier Agent can only withdraw once
              delivery is confirmed (an AI-vision check in Circle&apos;s original sample, a documented seam in this
              build; see <Link href="https://github.com/circlefin/arc-escrow" className="text-accent hover:underline">circlefin/arc-escrow</Link>).
              If delivery fails validation, the Governance Agent can refund the payer directly through the
              contract&apos;s arbiter role.
            </p>
            <p className="mt-2 text-xs text-muted">
              Contract: <ExplorerLink href={explorerAddressUrl(addresses.escrow)} value={addresses.escrow} />
            </p>
          </div>

          <div className="card p-6">
            <h2 className="font-medium">5. DecisionLedger.sol: the part that makes this trustworthy</h2>
            <p className="mt-2 text-sm text-muted">
              Every decision above (a treasury allocation, a procurement order, a supplier quote, an escrow open or
              release, a governance override) gets one on-chain event: which agent, what kind of action, a keccak256
              hash of the full rationale text, and a reference to the transaction it describes. The full rationale
              text itself lives off-chain; only its hash is pinned on Arc. The{" "}
              <Link href="/dashboard" className="text-accent hover:underline">live dashboard</Link> recomputes that
              hash for every entry and checks it against the on-chain value. So the claim &quot;the agent said X, and
              here&apos;s proof it actually recorded X&quot; is something you can verify yourself, not something you
              have to take on faith.
            </p>
            <p className="mt-2 text-xs text-muted">
              Contract: <ExplorerLink href={explorerAddressUrl(addresses.decisionLedger)} value={addresses.decisionLedger} />
            </p>
          </div>

          <div className="card p-6">
            <h2 className="font-medium">Stretch: Circle Bridge Kit (CCTPv2) treasury rebalance</h2>
            <p className="mt-2 text-sm text-muted">
              A standalone demo, separate from the core payment→escrow sequence above: a Treasury rebalance that
              bridges idle Arc Testnet USDC to another CCTPv2-supported chain via <code className="mono">@circle-fin/bridge-kit</code>&apos;s
              <code className="mono"> kit.bridge()</code>, using Circle&apos;s Orbit relayer so no destination-chain
              gas wallet is needed. Run for real (not just coded against the docs): approve, burn, attestation, and
              a forwarded mint all reported success, and the destination balance was independently confirmed via a
              plain <code className="mono">balanceOf</code> RPC call on Base Sepolia, not just trusted from the
              SDK&apos;s own report. See <code className="mono">apps/agents/src/bridge/</code> and{" "}
              <code className="mono">scripts/bridge-treasury-demo.ts</code>.
            </p>
          </div>
        </section>

        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link href="/run" className="rounded-lg bg-accent-2 px-5 py-2.5 text-sm font-medium text-white hover:opacity-90">
            Trigger a real run
          </Link>
          <Link href="/dashboard" className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium hover:bg-surface">
            View live state
          </Link>
        </div>
      </div>
    </main>
  );
}
