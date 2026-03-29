// apps/api/src/routes/v1/admin.ts

import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope } from "@repo/shared";
import { SupportManager, IdentityManager } from "@repo/domain";
import { AnnouncementRepository, SessionRepository, UserRepository, kv, OpsRepository } from "@repo/infrastructure";

export async function adminRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  
  const supportManager = new SupportManager();
  const identityManager = new IdentityManager();
  
  const sessionRepo = new SessionRepository();
  const userRepo = new UserRepository();
  const opsRepo = new OpsRepository();
  const announcementRepo = new AnnouncementRepository();

  const ADMIN_ADDRESS = process.env.ADMIN_ADDRESS?.toLowerCase();

  const getAdminContext = async (req: any) => {
    const sessionId = req.headers["x-session-id"] || req.query?.sessionId || req.body?.sessionId;
    if (!sessionId) return null;
    const session = await sessionRepo.getSessionById(sessionId as string);
    if (!session || session.status !== "authorized") return null;
    
    // Admin check
    if (session.address.toLowerCase() !== ADMIN_ADDRESS) return null;
    
    const user = await userRepo.getUserById(session.userId);
    return { session, user };
  };

  // ─── System Controls ──────────────────────────────────────────────────────

  typedFastify.get("/ops/health", async (request) => {
    const maintenance = await kv.get<boolean>("system:maintenance") || false;
    return createApiEnvelope({ status: "ok", maintenance }, request.id);
  });

  typedFastify.post("/maintenance", {
    schema: {
      body: z.object({ sessionId: z.string(), enabled: z.boolean() })
    }
  }, async (request) => {
    const ctx = await getAdminContext(request);
    if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED" } }, request.id);

    const { enabled } = request.body;
    await kv.set("system:maintenance", enabled);
    
    await opsRepo.logEvent({
      channel: "admin",
      severity: "important",
      source: "admin_api",
      kind: "maintenance_toggled",
      userId: ctx.user.id,
      message: `Maintenance mode ${enabled ? 'enabled' : 'disabled'} by admin ${ctx.session.address}`,
      meta: { enabled }
    });

    return createApiEnvelope({ success: true, enabled }, request.id);
  });

  // ─── Blacklist ────────────────────────────────────────────────────────────

  typedFastify.post("/blacklist", {
    schema: {
      body: z.object({
        sessionId: z.string(),
        address: z.string(),
        reason: z.string().optional(),
        action: z.enum(["add", "remove"])
      })
    }
  }, async (request) => {
    const ctx = await getAdminContext(request);
    if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED" } }, request.id);

    const { address, reason, action } = request.body;
    const normalized = identityManager.tryNormalizeAddress(address);
    if (!normalized) return createApiEnvelope({ error: { message: "Invalid address" } }, request.id);

    if (action === "add") {
      await kv.set(`blacklist:${normalized}`, { reason, blacklistedAt: new Date(), by: ctx.session.address });
    } else {
      await kv.del(`blacklist:${normalized}`);
    }

    await opsRepo.logEvent({
      channel: "admin",
      severity: "info",
      source: "admin_api",
      kind: action === "add" ? "user_blacklisted" : "user_unblacklisted",
      userId: ctx.user.id,
      message: `User ${normalized} ${action === 'add' ? 'blacklisted' : 'unblacklisted'}`,
      meta: { address: normalized, reason }
    });

    return createApiEnvelope({ success: true, address: normalized }, request.id);
  });

  // ─── User Management ──────────────────────────────────────────────────────

  typedFastify.post("/adjust-balance", {
    schema: {
      body: z.object({
        sessionId: z.string(),
        address: z.string(),
        amount: z.string(), // positive or negative
        token: z.enum(["zhixi", "yjc"]).default("zhixi"),
        reason: z.string()
      })
    }
  }, async (request) => {
    const ctx = await getAdminContext(request);
    if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED" } }, request.id);

    const { address, amount, token, reason } = request.body;
    const normalized = identityManager.tryNormalizeAddress(address);
    if (!normalized) return createApiEnvelope({ error: { message: "Invalid address" } }, request.id);

    const balanceKey = token === "yjc" ? `balance_yjc:${normalized}` : `balance:${normalized}`;
    const current = parseFloat(await kv.get<string>(balanceKey) || "0");
    const delta = parseFloat(amount);
    const result = Math.max(0, current + delta).toString();
    
    await kv.set(balanceKey, result);

    await opsRepo.logEvent({
      channel: "admin",
      severity: "important",
      source: "manual_adjustment",
      kind: "balance_adjusted",
      userId: ctx.user.id,
      address: normalized,
      message: `Manual balance adjustment for ${normalized}: ${amount} ${token}. Reason: ${reason}`,
      meta: { from: current, to: result, delta, token, reason }
    });

    return createApiEnvelope({ success: true, newBalance: result }, request.id);
  });

  // ─── Announcement Management ─────────────────────────────────────────────

  typedFastify.post("/announcements", {
    schema: {
      body: z.object({
        sessionId: z.string(),
        title: z.string(),
        content: z.string(),
        isPinned: z.boolean().optional(),
        isActive: z.boolean().optional()
      })
    }
  }, async (request) => {
    const ctx = await getAdminContext(request);
    if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED" } }, request.id);

    const input = supportManager.sanitizeAnnouncementInput(request.body);
    const ann = supportManager.createAnnouncement({ ...input, publishedBy: ctx.session.address });

    await announcementRepo.saveAnnouncement(ann);

    const list = await kv.get<any[]>("announcements:list") || [];
    list.unshift(ann);
    await kv.set("announcements:list", list);

    return createApiEnvelope({ success: true, announcement: ann }, request.id);
  });

  // ─── Events & Monitoring ──────────────────────────────────────────────────

  typedFastify.get("/ops/events", async (request) => {
    const ctx = await getAdminContext(request);
    if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED" } }, request.id);
    
    const events = await opsRepo.listEvents({ limit: 100 });
    return createApiEnvelope({ events }, request.id);
  });
}
