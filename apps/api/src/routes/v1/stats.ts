import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope } from "@repo/shared";
import { StatsRepository, kv, OpsRepository } from "@repo/infrastructure";

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
      const opsRepo = new OpsRepository();
      const events: { createdAt: Date | string; severity: string; address?: string }[] = await opsRepo.listEvents({ limit: 1000 });
      
      // Filter events from last 24 hours
      const now = Date.now();
      const oneDayMs = 24 * 60 * 60 * 1000;
      const last24h = events.filter((e) => {
        const eventTime = new Date(e.createdAt).getTime();
        return now - eventTime < oneDayMs;
      });
      
      // Aggregate statistics
      const total = last24h.length;
      const errors = last24h.filter((e) => e.severity === 'error' || e.severity === 'fatal').length;
      const successRate = total > 0 ? ((total - errors) / total * 100).toFixed(2) : null;
      
      // Generate hourly data for the chart (last 24 hours)
      const hourly = Array.from({ length: 24 }, (_, i) => {
        const hourStart = new Date(now - (23 - i) * 60 * 60 * 1000);
        const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);
        
        const hourEvents = last24h.filter((e) => {
          const eventTime = new Date(e.createdAt);
          return eventTime >= hourStart && eventTime < hourEnd;
        });
        
        return {
          success: hourEvents.filter((e) => e.severity !== 'error' && e.severity !== 'fatal').length,
          failure: hourEvents.filter((e) => e.severity === 'error' || e.severity === 'fatal').length
        };
      });
      
      // Count active game sessions (unique addresses in last hour)
      const lastHour = events.filter((e) => {
        const eventTime = new Date(e.createdAt).getTime();
        return now - eventTime < 60 * 60 * 1000;
      });
      const uniqueAddresses = new Set(lastHour.map((e) => e.address).filter(Boolean));
      const activeNodes = uniqueAddresses.size;
      
      const stats = {
        uptime: successRate ? `${successRate}%` : null,
        failureRate: total > 0 ? `${(errors / total * 100).toFixed(2)}%` : null,
        nodes: activeNodes > 0 ? `${activeNodes} ACTIVE` : null,
        secureLayer: 'AES-256',
        last24h: {
          success: hourly.map((h) => h.success),
          failure: hourly.map((h) => h.failure)
        }
      };
      
      return createApiEnvelope({ stats }, request.id);
    } catch (e: any) {
      return createApiEnvelope(null, request.id, false, e.message);
    }
  });
}
