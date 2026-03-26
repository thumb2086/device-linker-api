import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope, MARKET_SYMBOLS } from "@repo/shared";
import { MetaManager } from "@repo/domain";
import { MetaRepository } from "@repo/infrastructure";

export async function marketRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const metaManager = new MetaManager();
  const metaRepo = new MetaRepository();
  const mockUserId = "550e8400-e29b-41d4-a716-446655440000";

  typedFastify.get("/summary", async (request) => {
    const tick = Math.floor(Date.now() / 30000);
    const items = Object.keys(MARKET_SYMBOLS).map((symbol) => ({
      symbol,
      price: metaManager.calculatePrice(symbol as any, tick).toFixed(4),
    }));
    return createApiEnvelope({ items }, request.id);
  });

  typedFastify.post("/orders", {
    schema: {
      body: z.object({
        itemId: z.string(),
        quantity: z.number().positive(),
        price: z.string(),
      }),
    },
  }, async (request) => {
    const { itemId, quantity, price } = request.body;
    const order = metaManager.createMarketOrder(mockUserId, itemId, quantity, price);

    try {
      await metaRepo.saveMarketOrder(order);
    } catch (err) {
      fastify.log.error(err);
    }

    return createApiEnvelope({ order }, request.id);
  });
}
