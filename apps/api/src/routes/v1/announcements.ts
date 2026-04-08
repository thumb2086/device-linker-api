import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope } from "@repo/shared";
import { AnnouncementRepository } from "@repo/infrastructure";
import { randomUUID } from "crypto";

function inferAnnouncementType(item: { title?: string | null; content?: string | null; isPinned?: boolean | null }) {
  const haystack = `${item.title || ""} ${item.content || ""}`.toLowerCase();
  if (item.isPinned || /urgent|critical|alert|緊急|重大|警報/.test(haystack)) return "urgent" as const;
  if (/maintenance|maintain|維護|停機|更新/.test(haystack)) return "warning" as const;
  return "info" as const;
}

export async function announcementRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const repo = new AnnouncementRepository();

  typedFastify.get("/", async (request) => {
    const activeAnnouncements = await repo.listActiveAnnouncements();
    const list = activeAnnouncements.map((item: any) => ({
      id: item.announcementId || item.id,
      title: item.title,
      content: item.content,
      type: inferAnnouncementType(item),
      createdAt: new Date(item.publishedAt || item.createdAt).toISOString(),
      active: item.isActive ?? true,
    }));

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
    const now = new Date();
    await repo.saveAnnouncement({
      id: randomUUID(),
      announcementId: `ann_${Date.now()}_${randomUUID().slice(0, 8)}`,
      title: request.body.title,
      content: request.body.content,
      isPinned: request.body.type === "urgent",
      isActive: true,
      publishedBy: "system",
      updatedBy: "system",
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    return createApiEnvelope({ success: true }, request.id);
  });
}
