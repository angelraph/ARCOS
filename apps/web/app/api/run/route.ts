import "@/lib/loadServerEnv";
import { NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { runFlow } from "@arcos/agents/orchestrator";
import { createSigners } from "@arcos/agents/signers";
import { addresses } from "@arcos/shared";
import { DECISIONS_TAG, ESCROW_PAYMENTS_TAG } from "@/lib/chain";

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

        // New decisions/escrow payments now exist on-chain — invalidate the dashboard's
        // durable log-scan cache so the very next visit reflects this run instead of
        // waiting up to LOG_SCAN_REVALIDATE_SECONDS for the time-based safety net.
        // { expire: 0 } forces an immediate hard revalidation rather than Next 16's default
        // stale-while-revalidate profile behavior — the next dashboard read must see fresh
        // data, not a serve-stale-then-refresh-in-background window.
        revalidateTag(DECISIONS_TAG, { expire: 0 });
        revalidateTag(ESCROW_PAYMENTS_TAG, { expire: 0 });

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
