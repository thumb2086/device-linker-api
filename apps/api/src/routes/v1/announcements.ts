import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope } from "@repo/shared";
import { AnnouncementManager } from "@repo/domain";
import { AnnouncementRepository, kv } from "@repo/infrastructure";

function inferAnnouncementType(item: { title?: string | null; content?: string | null; isPinned?: boolean | null }) {
  const haystack = `${item.title || ""} ${item.content || ""}`.toLowerCase();
  if (item.isPinned || /urgent|critical|alert|緊急|重大|警報/.test(haystack)) return "urgent" as const;
  if (/maintenance|maintain|維護|停機|更新/.test(haystack)) return "warning" as const;
  return "info" as const;
}

export async function announcementRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const manager = new AnnouncementManager(kv);
  const repo = new AnnouncementRepository();

  typedFastify.get("/", async (request) => {
    // 先嘗試讀取所有公告（包含非活動中的歷史公告）
    const allAnnouncements = await repo.listAllAnnouncements(50);
    const list = allAnnouncements.length > 0
      ? allAnnouncements.map((item: any) => ({
          id: item.announcementId || item.id,
          title: item.title,
          content: item.content,
          type: inferAnnouncementType(item),
          createdAt: new Date(item.publishedAt || item.createdAt).toISOString(),
          active: item.isActive ?? true,
        }))
      : await manager.getActiveAnnouncements();
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
