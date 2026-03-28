import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope } from "@repo/shared";
import { AnnouncementManager } from "@repo/domain";
import { kv } from "@repo/infrastructure";

export async function announcementRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const manager = new AnnouncementManager(kv);

  typedFastify.get("/", async (request) => {
    const list = await manager.getActiveAnnouncements();
    return createApiEnvelope(list, request.id);
  });

  // Admin only - simplified
  typedFastify.post("/add", {
    schema: {
      body: z.object({
        title: z.string(),
        content: z.string(),
        type: z.enum(["info", "warning", "urgent"])
      })
    }
  }, async (request) => {
    await manager.addAnnouncement(request.body);
    return createApiEnvelope({ success: true }, request.id);
  });
}
