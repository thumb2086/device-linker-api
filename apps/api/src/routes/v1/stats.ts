import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope } from "@repo/shared";
import { StatsRepository, kv } from "@repo/infrastructure";

export async function statsRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const statsRepo = new StatsRepository();

  typedFastify.get("/leaderboard", {
    schema: {
      querystring: z.object({ type: z.enum(["total_bet", "balance"]).optional().default("total_bet") }),
    },
  }, async (request) => {
    const { type } = request.query;
    try {
      const cacheKey = `stats:leaderboard:${type}`;
      const cached = await kv.get<any[]>(cacheKey);
      if (cached) return createApiEnvelope({ leaderboard: cached }, request.id);
      const leaderboard = await statsRepo.getLeaderboard(type);
      await kv.set(cacheKey, leaderboard, { ex: 300 });
      return createApiEnvelope({ leaderboard }, request.id);
    } catch (e: any) {
      return createApiEnvelope(null, request.id, false, e.message);
    }
  });

  typedFastify.get("/health", async (request) => {
    try {
      const stats = await kv.get(`platform:stats:24h`) || { successRate: 99.9, latency: 45 };
      return createApiEnvelope({ stats }, request.id);
    } catch (e: any) {
      return createApiEnvelope(null, request.id, false, e.message);
    }
  });
}
