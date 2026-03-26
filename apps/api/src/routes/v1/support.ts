// apps/api/src/routes/v1/support.ts

import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope } from "@repo/shared";
import { SupportManager, IdentityManager } from "@repo/domain";
import { SessionRepository, UserRepository, kv, OpsRepository } from "@repo/infrastructure";

export async function supportRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  
  const supportManager = new SupportManager();
  const identityManager = new IdentityManager();
  
  const sessionRepo = new SessionRepository();
  const userRepo = new UserRepository();
  const opsRepo = new OpsRepository();

  const getContext = async (req: any) => {
    const sessionId = req.headers["x-session-id"] || req.query?.sessionId || req.body?.sessionId;
    if (!sessionId) return null;
    const session = await sessionRepo.getSessionById(sessionId as string);
    if (!session || session.status !== "authorized") return null;
    const user = await userRepo.getUserById(session.userId);
    return { session, user };
  };

  // ─── Announcements ────────────────────────────────────────────────────────

  typedFastify.get("/announcements", async (request) => {
    const announcements = await kv.get<any[]>("announcements:list") || [];
    // Filter active ones for regular users
    const active = announcements.filter(a => a.isActive).sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    });
    return createApiEnvelope({ announcements: active }, request.id);
  });

  // ─── Ticketing (Feedback/Reports) ────────────────────────────────────────

  typedFastify.post("/tickets", {
    schema: {
      body: z.object({
        sessionId: z.string(),
        title: z.string(),
        category: z.string(),
        message: z.string(),
        contact: z.string().optional(),
        pageUrl: z.string().optional(),
      })
    }
  }, async (request) => {
    const ctx = await getContext(request);
    if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED" } }, request.id);

    const input = supportManager.sanitizeIssueInput(request.body);
    const validationError = supportManager.validateIssueInput(input);
    if (validationError) {
      return createApiEnvelope({ error: { message: validationError } }, request.id);
    }

    const ticket = supportManager.createTicket({
      ...input,
      address: ctx.session.address,
      displayName: ctx.user.displayName,
      platform: ctx.session.platform,
      clientType: ctx.session.clientType,
      deviceId: ctx.session.deviceId,
      appVersion: ctx.session.appVersion,
      mode: ctx.session.mode
    });

    // Save ticket (KV for now, PG repo later)
    await kv.set(`support:ticket:${ticket.reportId}`, ticket);
    await kv.lpush(`user:tickets:${ctx.session.address}`, ticket.reportId);

    await opsRepo.logEvent({
      channel: "support",
      severity: "info",
      source: "ticketing",
      kind: "ticket_created",
      userId: ctx.user.id,
      address: ctx.session.address,
      message: `Support ticket created: ${ticket.title}`,
      meta: { reportId: ticket.reportId, category: ticket.category }
    });

    return createApiEnvelope({ success: true, reportId: ticket.reportId }, request.id);
  });

  // ─── Chat Logic ──────────────────────────────────────────────────────────

  typedFastify.get("/chat/messages", async (request) => {
    const messages = await kv.get<any[]>("chat:global:messages") || [];
    return createApiEnvelope({ messages }, request.id);
  });

  typedFastify.post("/chat/messages", {
    schema: {
      body: z.object({
        sessionId: z.string(),
        text: z.string().min(1).max(500),
      })
    }
  }, async (request) => {
    const ctx = await getContext(request);
    if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED" } }, request.id);

    const newMessage = {
      id: crypto.randomUUID(),
      userId: ctx.user.id,
      address: ctx.session.address,
      displayName: ctx.user.displayName || "匿名玩家",
      text: request.body.text,
      createdAt: Date.now()
    };

    const messages: any[] = await kv.get("chat:global:messages") || [];
    messages.push(newMessage);
    if (messages.length > 50) messages.shift();

    await kv.set("chat:global:messages", messages);

    return createApiEnvelope({ message: newMessage }, request.id);
  });
}
