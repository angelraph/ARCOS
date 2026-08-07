import "@/lib/loadServerEnv";
import { NextRequest } from "next/server";
import { runFlow } from "@arcos/agents/orchestrator";
import { createSigners } from "@arcos/agents/signers";
import { addresses } from "@arcos/shared";

export const runtime = "nodejs";

// Real testnet funds, triggered from a public page. Clamp so one click can't drain the
// demo wallets. This is a hackathon demo money limit, not a production pattern.
const MIN_USDC = 0.1;
const MAX_USDC = 5;
const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

function clamp(value: number): number {
  return Math.min(MAX_USDC, Math.max(MIN_USDC, value));
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const paymentUsdc = clamp(Number(url.searchParams.get("payment") ?? "2")).toString();
  const procurementUsdc = clamp(Number(url.searchParams.get("procurement") ?? "1.2")).toString();

  const recipientParam = url.searchParams.get("recipient")?.trim();
  if (recipientParam && !ADDRESS_PATTERN.test(recipientParam)) {
    return new Response(JSON.stringify({ error: "Recipient must be a valid 0x address." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const recipientAddress = recipientParam as `0x${string}` | undefined;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        send({ type: "started", paymentUsdc, procurementUsdc, recipientAddress });

        const signers = createSigners("circle");
        await runFlow(
          signers,
          {
            treasuryPolicyAddress: addresses.treasuryPolicy as `0x${string}`,
            escrowAddress: addresses.escrow as `0x${string}`,
            ledgerAddress: addresses.decisionLedger as `0x${string}`,
            gatewayBuyerPrivateKey: process.env.PROCUREMENT_GATEWAY_PRIVATE_KEY as `0x${string}` | undefined,
            quoteFeeUsdc: process.env.SUPPLIER_QUOTE_FEE_USDC,
          },
          paymentUsdc,
          procurementUsdc,
          (event) => send({ type: "step", ...event }),
          recipientAddress,
        );

        // No manual cache invalidation needed here: apps/web/lib/chain.ts keys
        // getDecisions()/getEscrowPayments() on decisionCount() (a cheap, always-fresh
        // on-chain read), and this run just changed that count on-chain. The very next
        // dashboard read picks up a new cache key automatically -- tried
        // revalidateTag(tag, { expire: 0 }) here first, but verified directly against
        // production that it doesn't actually invalidate an unstable_cache-tagged entry
        // on this Next.js version, so correctness no longer depends on it.
        send({ type: "done" });
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
