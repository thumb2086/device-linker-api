import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope, MARKET_SYMBOLS } from "@repo/shared";
import { MetaManager } from "@repo/domain";
import { MetaRepository, OpsRepository } from "@repo/infrastructure";

export async function marketRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const metaManager = new MetaManager();
  const metaRepo = new MetaRepository();
  const opsRepo = new OpsRepository();
  const mockUserId = "550e8400-e29b-41d4-a716-446655440000";

  typedFastify.get("/summary", async (request) => {
    const tick = Math.floor(Date.now() / 30000);
    const items = Object.entries(MARKET_SYMBOLS).map(([symbol, meta]) => {
      const price = metaManager.calculatePrice(symbol as any, tick);
      const prevPrice = metaManager.calculatePrice(symbol as any, tick - 1);
      const change = ((price - prevPrice) / prevPrice * 100).toFixed(2);
      return {
        symbol,
        name: meta.name,
        price: price.toFixed(4),
        change,
      };
    });
    return createApiEnvelope({ items }, request.id);
  });

  typedFastify.post("/orders", {
    schema: {
      body: z.object({
        symbol: z.string(),
        qty: z.number().positive(),
        side: z.enum(["buy", "sell"]),
      }),
    },
  }, async (request) => {
    const { symbol, qty, side } = request.body;
    const tick = Math.floor(Date.now() / 30000);
    const price = metaManager.calculatePrice(symbol as any, tick).toFixed(4);

    const order = metaManager.createMarketOrder(mockUserId, symbol, qty, price);
    order.status = "completed"; // Auto-fill for now

    try {
      await metaRepo.saveMarketOrder(order);
      await opsRepo.logEvent({
          channel: "market",
          severity: "info",
          source: "market_api",
          kind: "order_filled",
          userId: mockUserId,
          requestId: request.id,
          message: `Market ${side} order for ${qty} ${symbol} @ ${price} filled.`,
          meta: { symbol, qty, side, price }
      });
    } catch (err) {
      fastify.log.error(err);
    }

    return createApiEnvelope({ order }, request.id);
  });
}
