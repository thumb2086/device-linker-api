import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope } from "@repo/shared";
import { MetaManager } from "@repo/domain";

export async function marketRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const metaManager = new MetaManager();
  const mockUserId = "550e8400-e29b-41d4-a716-446655440000";

  typedFastify.get("/summary", async (request) => {
    return createApiEnvelope({ items: [] }, request.id);
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
    return createApiEnvelope({ order }, request.id);
  });
}
