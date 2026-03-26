import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope } from "@repo/shared";
import { OpsRepository } from "@repo/infrastructure";

export async function adminRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const opsRepo = new OpsRepository();
  const mockUserId = "550e8400-e29b-41d4-a716-446655440000";

  typedFastify.get("/ops/health", async (request) => {
    // In real app, check maintenance state in KV
    return createApiEnvelope({ status: "ok", maintenance: false }, request.id);
  });

  typedFastify.get("/ops/events", async (request) => {
    const events = await opsRepo.listEvents({ limit: 50 });
    return createApiEnvelope({ events }, request.id);
  });

  typedFastify.post("/maintenance", {
      schema: {
          body: z.object({
              enabled: z.boolean()
          })
      }
  }, async (request) => {
      const { enabled } = request.body;
      await opsRepo.logEvent({
          channel: "admin",
          severity: "info",
          source: "admin_api",
          kind: "maintenance_toggled",
          userId: mockUserId,
          message: `Maintenance mode ${enabled ? 'enabled' : 'disabled'} by admin.`,
          meta: { enabled }
      });
      return createApiEnvelope({ success: true, enabled }, request.id);
  });

  typedFastify.post("/blacklist", {
      schema: {
          body: z.object({
              address: z.string(),
              reason: z.string().optional()
          })
      }
  }, async (request) => {
      const { address, reason } = request.body;
      await opsRepo.logEvent({
          channel: "admin",
          severity: "info",
          source: "admin_api",
          kind: "user_blacklisted",
          userId: mockUserId,
          message: `User ${address} blacklisted: ${reason || 'No reason'}`,
          meta: { address, reason }
      });
      return createApiEnvelope({ success: true, address }, request.id);
  });
}
