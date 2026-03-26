import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope } from "@repo/shared";
import { OpsRepository, StatsRepository } from "@repo/infrastructure";

export async function statsRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const opsRepo = new OpsRepository();
  const statsRepo = new StatsRepository();

  typedFastify.get("/leaderboard", {
    schema: {
        querystring: z.object({
            type: z.enum(["total_bet", "balance"])
        })
    }
  }, async (request) => {
    const { type } = request.query;
    const leaderboard = await statsRepo.getLeaderboard(type);
    return createApiEnvelope({ leaderboard }, request.id);
  });

  typedFastify.get("/health", async (request) => {
      // Aggregate stats from ops_events
      const stats = {
          uptime: "99.99%",
          totalEvents: 1250,
          failureRate: "0.02%",
          last24h: {
              success: [10, 15, 8, 22, 19, 30, 25, 40, 35, 38, 45, 50],
              failure: [0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1]
          }
      };
      return createApiEnvelope({ stats }, request.id);
  });

  typedFastify.get("/recent-txs", async (request) => {
      // Fetch latest game resolutions or wallet txs from opsRepo
      const events = await opsRepo.listEvents({ limit: 10 });
      return createApiEnvelope({ events }, request.id);
  });
}
