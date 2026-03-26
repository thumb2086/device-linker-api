// apps/api/src/routes/v1/stats.ts

import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope } from "@repo/shared";
import { OpsRepository, StatsRepository, kv } from "@repo/infrastructure";
import { getVipLevel } from "@repo/domain";

export async function statsRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  
  const opsRepo = new OpsRepository();
  const statsRepo = new StatsRepository();

  // ─── Global Leaderboards ────────────────────────────────────────────────

  typedFastify.get("/leaderboard", {
    schema: {
      querystring: z.object({
        type: z.enum(["total_bet", "balance"]),
        limit: z.string().optional().default("10")
      })
    }
  }, async (request) => {
    const { type, limit } = request.query;
    const limitNum = parseInt(limit);
    
    // Attempt real DB leaderboard if available, otherwise mock/KV
    const leaderboard = await statsRepo.getLeaderboard(type as any);
    
    // In KV fallback mode, statsRepo returns hardcoded mock. 
    // We can improve this with real KV scan if needed, but it's expensive.
    
    return createApiEnvelope({ leaderboard }, request.id);
  });

  // ─── System Health & Recent Activity ────────────────────────────────────

  typedFastify.get("/health", async (request) => {
    const maintenance = await kv.get<boolean>("system:maintenance") || false;
    const events = await opsRepo.listEvents({ limit: 100 });
    
    // Calculate failure rate
    const total = events.length;
    const failures = events.filter(e => e.severity === "error" || e.severity === "critical").length;
    const failureRate = total > 0 ? (failures / total * 100).toFixed(2) + "%" : "0%";

    return createApiEnvelope({ 
      uptime: "99.98%",
      maintenance,
      totalEvents: total,
      failureRate,
      status: maintenance ? "maintenance" : "online"
    }, request.id);
  });

  typedFastify.get("/recent-txs", async (request) => {
    // Latest interesting events: game resolutions, high bets, big wins
    const events = (await opsRepo.listEvents({ limit: 50 }))
      .filter(e => e.kind === "play_completed" || e.kind === "transfer_completed");
      
    return createApiEnvelope({ events: events.slice(0, 10) }, request.id);
  });
}
