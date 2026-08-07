<p align="center">
  <img src="docs/brand/arcos-logo.jpeg" alt="ARCOS" width="480" />
</p>

# ARCOS: Autonomous Treasury Commerce System

Submission for the **Stablecoins Commerce Stack Challenge** (Ignyte x Circle x Arc), Track 4: *Best Agentic Economy Experience on Arc*.

ARCOS is not an AI wallet or a payment app. It's a small set of autonomous agents that actually run part of a business on Arc. A **Treasury Agent** allocates incoming USDC into policy-defined buckets. A **Procurement Agent** negotiates and settles with a **Supplier Agent**. Delivery is confirmed before an escrow releases funds. Every decision (every allocation, every negotiation, every release) is written to an onchain **Decision Ledger** with a verifiable rationale hash, and any spend above a policy threshold pauses for a governance approval before it can execute, enforced by the contract itself, not a UI check.

Real Arc Testnet transactions throughout. Nothing in this build is mocked.

## Live site

Four pages, each with a job:
- **`/`**: the landing page. What ARCOS is, the problem it solves, and why it runs on Arc.
- **`/engine`**: how it actually works, contract by contract and agent by agent, with the architecture diagram.
- **`/run`**: trigger a real run yourself. Pick an amount, optionally pick a recipient address, and watch the agents execute live against Arc Testnet.
- **`/dashboard`**: live on-chain state. Treasury buckets, escrow payments, pending governance approvals, and the full Decision Ledger with client-side hash verification.

## Why this exists

For educational and testnet demo purposes only, per the challenge rules. See [`docs/circle-feedback.md`](docs/circle-feedback.md) for the required Circle Product Feedback write-up, kept up to date throughout the build rather than written after the fact.

## Architecture

```
Incoming USDC payment
  -> Treasury Agent        (allocates into policy buckets)
  -> Procurement Agent     (proposes a spend, negotiates with Supplier Agent)
  -> Governance gate       (any spend above threshold pauses for approval, enforced on-chain)
  -> Gateway nanopayment   (Procurement pays Supplier's quote endpoint gas-free via x402)
  -> Escrow                (opens for the recipient)
  -> delivery confirmation (AI-vision seam, reused from arc-escrow)
  -> Escrow release        (or refund by Governance if delivery fails)
  -> Decision Ledger       (every step above logged on-chain: agent, action, rationale hash, tx ref)
```

See [`docs/architecture.png`](docs/architecture.png) for the full diagram (also shown on the `/engine` page).

## Repo structure

```
apps/
  web/          Next.js site: landing, engine explainer, live execution page, dashboard
  agents/       Node/TS agent engine: Treasury, Procurement, Supplier, Governance
                  src/gateway/  Circle Gateway (x402) quote-fee server + client
                  src/bridge/   Circle Bridge Kit (CCTPv2) cross-chain treasury rebalance
contracts/      Foundry project: DecisionLedger.sol, TreasuryPolicy.sol, Escrow.sol
packages/
  shared/       ABIs, deployed addresses, Circle Wallets SDK wrapper, Supabase client, shared TS types
scripts/        One-time setup scripts (entity secret registration, wallet creation, Gateway deposit, bridge demo)
docs/
  brand/        ARCOS logo and brand assets
  architecture.png / architecture.mmd
  circle-feedback.md
```

Built on top of two official Circle sample repos rather than from scratch:
- [`circlefin/arc-nanopayments`](https://github.com/circlefin/arc-nanopayments): the pattern for x402-protected endpoints via `@circle-fin/x402-batching`, adapted so the Procurement Agent pays a real Circle Gateway micropayment for the Supplier Agent's quote (`apps/agents/src/gateway/`)
- [`circlefin/arc-escrow`](https://github.com/circlefin/arc-escrow): escrow and AI-validated deliverable release via `@circle-fin/developer-controlled-wallets`

`apps/web` reuses the agent engine directly (`@arcos/agents/orchestrator`) rather than shelling out to a CLI, so the live `/run` page executes the exact same code path as the command-line tool.

## Deployed contracts (Arc Testnet)

| Contract | Address |
|---|---|
| DecisionLedger | `0xe64f53388609d3a08fedfdca9ce0664ad94bcc18` |
| TreasuryPolicy | `0x7c209c4c6b0bd43104e4ef74627a919ed8e21aa1` |
| Escrow | `0x01ddc84d00d38852d73977f1241e2210c1c1bc38` |

## Setup

1. **Circle Developer Console**: sign up at [console.circle.com](https://console.circle.com), create an API key, then run `npm run register-entity-secret` to generate and register an entity secret (irreversible, do this once and keep the recovery file it produces somewhere safe).
2. **Arc Testnet**: RPC `https://rpc.drpc.testnet.arc.io` (chain ID `5042002`). Circle's own primary endpoint (`https://rpc.testnet.arc.network`) rate-limits hard under any kind of log-scanning load (observed directly — errors after 3-5 sequential `eth_getLogs` calls); dRPC's mirror handled 90 sequential calls with zero errors in testing. See [`docs/circle-feedback.md`](docs/circle-feedback.md).
3. `npm install` at the repo root (npm workspaces).
4. `npm run create-wallets` to create the five agent wallets (Treasury, Procurement, Supplier, Governance, Customer) on Arc Testnet. Fund them from the Developer Console's faucet (by wallet ID, not address) with both native gas and USDC.
5. Copy `.env.example` to `.env` and fill in values as each step above produces them.
6. **Supabase (rationale text store)**: create a free project at [supabase.com](https://supabase.com) (or run `vercel integration add supabase` if deploying to Vercel), then run the `create table rationales (...)` statement in `.env.example`'s Supabase section against it once. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env`. This holds the human-readable rationale text behind each Decision Ledger entry's on-chain hash — it has to be a real shared store, not a local file, because the orchestrator (writer) and the dashboard (reader) run as separate processes/serverless invocations that don't share a filesystem.
7. `cd contracts && forge build && forge test` to confirm the contract suite passes, then `forge script script/Deploy.s.sol:Deploy --rpc-url arc_testnet --broadcast` to deploy.
8. **Circle Gateway (x402 nanopayments), optional but recommended**: generate a fresh local key (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`, prefixed with `0x`), fund its address with a couple dollars of USDC + native gas via [faucet.circle.com](https://faucet.circle.com), set it as `PROCUREMENT_GATEWAY_PRIVATE_KEY` in `.env`, then run `npm run setup-gateway` to deposit it into Gateway. This has to be a raw local key rather than a Circle wallet — see [`docs/circle-feedback.md`](docs/circle-feedback.md) for why. Leave it blank to skip this leg; the flow still runs, just without the paid-quote step.
9. **Circle Bridge Kit (CCTPv2), optional stretch demo**: generate another fresh local key the same way, fund it on Arc Testnet via [faucet.circle.com](https://faucet.circle.com), set it as `TREASURY_BRIDGE_PRIVATE_KEY` in `.env`, then run `npm run bridge-treasury-demo -- --amount=1.00 --to=Base_Sepolia` to rebalance idle treasury USDC cross-chain via Circle's Orbit relayer — no destination-chain gas wallet needed. This is a standalone demonstration, separate from the core payment→escrow flow.
10. `npm run dev:web` to run the site locally, or `npm run dev:agents` / `npm run start -w apps/agents` to run the agent engine from the command line.

## Verification

- All 18 Foundry tests pass across the three contracts.
- The full flow (payment, allocation, procurement spend, governance approval, supplier quote, escrow open, delivery confirmation, release) has been run multiple times end to end against real Circle Developer-Controlled Wallets on Arc Testnet, with every step's ground truth checked directly against contract state, not just trusted from logs.
- The dashboard sources every value live from the chain — nothing is mocked — and recomputes each Decision Ledger entry's rationale hash client-side to verify it against the on-chain value. Reads are cached durably (Next's Data Cache, not in-process memory) and invalidated on-demand the moment a run completes, so it stays both fast (~1.5-2s typical) and never stale by more than one request behind a real change.
- Rationale text (the human-readable "why" behind each on-chain hash) is written to Supabase by the orchestrator and read back by the dashboard from a genuinely separate process — verified by triggering a real production run via `/api/run` and confirming its exact rationale text, and a "✓ hash verified" badge, render on the live `/dashboard` afterward.
- The Circle Gateway (x402) nanopayment leg settles for real: verified independently by watching `GatewayClient.getBalances().gateway.available` drop by the exact fee after `pay()`, and confirming the resulting transfer via Circle's transfer-search API. See `docs/circle-feedback.md` for two SDK/config bugs found and fixed along the way.
- The Bridge Kit (CCTPv2) treasury rebalance demo has been run for real: $1.00 USDC bridged from Arc Testnet to Base Sepolia, with the destination balance independently confirmed via a direct `balanceOf` RPC call (not just the SDK's own report) — see `docs/circle-feedback.md` for the exact transaction hashes and numbers.

## Status

Core flow complete and verified end to end. See `docs/circle-feedback.md` for what worked well and what could be improved in the Circle/Arc developer experience.
