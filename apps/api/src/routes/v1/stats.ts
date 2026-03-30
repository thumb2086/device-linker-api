import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope } from "@repo/shared";
import { StatsRepository } from "@repo/infrastructure";

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
      const leaderboard = await statsRepo.getLeaderboard(type);
      return createApiEnvelope({ leaderboard }, request.id);
    } catch (e: any) {
      return createApiEnvelope(null, request.id, false, e.message);
    }
  });


  typedFastify.get("/leaderboard/history", {
    schema: {
      querystring: z.object({ limit: z.coerce.number().int().min(1).max(100).optional().default(20) }),
    },
  }, async (request) => {
    const { limit } = request.query;
    try {
      const history = await statsRepo.getLeaderboardSettlementHistory(limit);
      return createApiEnvelope({ history }, request.id);
    } catch (e: any) {
      return createApiEnvelope(null, request.id, false, e.message);
    }
  });

  typedFastify.get("/health", async (request) => {
    try {
      const stats = { successRate: 99.9, latency: 45 };
      return createApiEnvelope({ stats }, request.id);
    } catch (e: any) {
      return createApiEnvelope(null, request.id, false, e.message);
    }
  });
}
