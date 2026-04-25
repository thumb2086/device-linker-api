// apps/api/src/routes/v1/danmaku.ts
import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope } from "@repo/shared";
import { DanmakuManager } from "@repo/domain/danmaku/danmaku-manager.js";
import { requireDb } from "@repo/infrastructure/db/index.js";

export async function danmakuRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();

  // GET /api/v1/danmaku/events - Get recent danmaku events
  typedFastify.get("/events", {
    schema: {
      querystring: z.object({
        limit: z.coerce.number().min(1).max(100).default(50),
      }),
    },
  }, async (request) => {
    const { limit } = request.query as { limit: number };

    try {
      const db = await requireDb();
      const manager = new DanmakuManager(db);
      const events = await manager.getRecentEvents(limit);

      return createApiEnvelope({ success: true, data: events }, request.id);
    } catch (err: any) {
      console.error("[danmaku] error:", err);
      return createApiEnvelope(
        { success: false, error: { code: "INTERNAL_ERROR", message: err.message } },
        request.id
      );
    }
  });
}
