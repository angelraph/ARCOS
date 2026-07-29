import express from "express";
import type { Server } from "node:http";
import { createGatewayMiddleware } from "@circle-fin/x402-batching/server";
import type { SupplierAgent } from "../agents/supplierAgent";

export interface QuoteServerHandle {
  url: string;
  close: () => Promise<void>;
}

/** Exposes the Supplier Agent's quote as a real x402-protected resource, gated by Circle
 *  Gateway (`gateway.require`), on a throwaway local port for the lifetime of one flow
 *  run. The HTTP resource server itself is local and ephemeral, but `gateway.require`
 *  still calls Circle's real Gateway facilitator to verify and settle the payment — the
 *  money movement isn't mocked, only the "supplier storefront" hosting is simplified for
 *  the demo. `sellerAddress` is the Supplier's existing wallet address; Gateway settles
 *  to it without that wallet ever needing to sign anything itself. */
export async function startQuoteServer(
  supplierAgent: SupplierAgent,
  sellerAddress: `0x${string}`,
  feeUsdc: string,
): Promise<QuoteServerHandle> {
  const app = express();
  app.use(express.json());

  const gateway = createGatewayMiddleware({ sellerAddress, networks: "eip155:5042002" });

  app.post("/quote", gateway.require(feeUsdc), async (req, res) => {
    const { itemDescription, amountAtomic } = req.body as { itemDescription: string; amountAtomic: string };
    const { rationale } = await supplierAgent.quote(itemDescription, BigInt(amountAtomic));
    res.json({ rationale });
  });

  const server = await new Promise<Server>((resolve) => {
    const s: Server = app.listen(0, "127.0.0.1", () => resolve(s));
  });

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  return {
    url: `http://127.0.0.1:${port}/quote`,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}
