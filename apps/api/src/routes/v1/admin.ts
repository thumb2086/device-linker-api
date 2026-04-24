// apps/api/src/routes/v1/admin.ts

import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope } from "@repo/shared";
import { SupportManager, IdentityManager } from "@repo/domain";
import {
  AnnouncementRepository,
  SessionRepository,
  UserRepository,
  kv,
  OpsRepository,
  RewardCatalogRepository,
  RewardSubmissionRepository,
  RewardCampaignRepository,
} from "@repo/infrastructure";
import { grantBundleToUser } from "../../utils/inventory.js";

export async function adminRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  
  const supportManager = new SupportManager();
  const identityManager = new IdentityManager();
  
  const sessionRepo = new SessionRepository();
  const userRepo = new UserRepository();
  const opsRepo = new OpsRepository();
  const announcementRepo = new AnnouncementRepository();
  const rewardCatalogRepo = new RewardCatalogRepository();
  const submissionRepo = new RewardSubmissionRepository();
  const campaignRepo = new RewardCampaignRepository();

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

  // List all announcements (active + inactive, with pin status)
  typedFastify.get("/announcements", async (request) => {
    const ctx = await getAdminContext(request);
    if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED" } }, request.id);
    const items = await announcementRepo.listAllAnnouncements(100);
    return createApiEnvelope({ announcements: items }, request.id);
  });

  // Patch announcement: toggle isActive, isPinned, or edit title/content
  typedFastify.patch("/announcements/:announcementId", {
    schema: {
      body: z.object({
        sessionId: z.string(),
        title: z.string().optional(),
        content: z.string().optional(),
        isPinned: z.boolean().optional(),
        isActive: z.boolean().optional(),
      }),
    },
  }, async (request) => {
    const ctx = await getAdminContext(request);
    if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED" } }, request.id);

    const { announcementId } = request.params as { announcementId: string };
    const { title, content, isPinned, isActive } = request.body as any;

    await announcementRepo.updateFields(announcementId, {
      title,
      content,
      isPinned,
      isActive,
      updatedBy: ctx.session.address,
    });

    // Rebuild KV cache from fresh DB state so public GET /support/announcements
    // fallback does not serve stale data.
    const activeAfter = await announcementRepo.listActiveAnnouncements();
    await kv.set("announcements:list", activeAfter);

    await opsRepo.logEvent({
      channel: "admin",
      severity: "info",
      source: "admin_api",
      kind: "announcement_updated",
      userId: ctx.user.id,
      message: `Announcement ${announcementId} updated`,
      meta: { announcementId, title, isPinned, isActive },
    });

    return createApiEnvelope({ success: true, announcementId }, request.id);
  });

  // Delete announcement
  typedFastify.delete("/announcements/:announcementId", {
    schema: {
      body: z.object({ sessionId: z.string() }),
    },
  }, async (request) => {
    const ctx = await getAdminContext(request);
    if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED" } }, request.id);

    const { announcementId } = request.params as { announcementId: string };
    await announcementRepo.deleteAnnouncement(announcementId);

    // Rebuild KV cache after deletion so removed items don't resurface via
    // the KV fallback path in /support/announcements.
    const activeAfter = await announcementRepo.listActiveAnnouncements();
    await kv.set("announcements:list", activeAfter);

    await opsRepo.logEvent({
      channel: "admin",
      severity: "info",
      source: "admin_api",
      kind: "announcement_deleted",
      userId: ctx.user.id,
      message: `Announcement ${announcementId} deleted`,
      meta: { announcementId },
    });

    return createApiEnvelope({ success: true, announcementId }, request.id);
  });

  // ─── Reward Catalog (custom avatars / titles / other collectibles) ───────

  typedFastify.get("/reward-catalog", async (request) => {
    const ctx = await getAdminContext(request);
    if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED" } }, request.id);
    const query = request.query as { type?: string; includeInactive?: string };
    const items = await rewardCatalogRepo.listItems({
      type: query?.type,
      includeInactive: true,
    });
    return createApiEnvelope({ items }, request.id);
  });

  typedFastify.post("/reward-catalog", {
    schema: {
      body: z.object({
        sessionId: z.string(),
        itemId: z.string().min(1),
        type: z.enum(["avatar", "title", "buff", "chest", "key", "collectible"]),
        name: z.string().min(1),
        rarity: z.enum(["common", "rare", "epic", "legendary", "mythic", "vip"]),
        source: z.string().optional(),
        description: z.string().optional(),
        icon: z.string().optional(),
        price: z.union([z.string(), z.number()]).optional(),
        isActive: z.boolean().optional(),
      }),
    },
  }, async (request) => {
    const ctx = await getAdminContext(request);
    if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED" } }, request.id);

    const body = request.body as any;
    const saved = await rewardCatalogRepo.upsertItem({
      itemId: body.itemId,
      type: body.type,
      name: body.name,
      rarity: body.rarity,
      source: body.source || "admin",
      description: body.description,
      icon: body.icon,
      price: body.price,
      isActive: body.isActive,
    });

    await opsRepo.logEvent({
      channel: "admin",
      severity: "info",
      source: "admin_api",
      kind: "reward_catalog_upserted",
      userId: ctx.user.id,
      message: `Reward catalog item upserted: ${body.itemId}`,
      meta: { itemId: body.itemId, type: body.type },
    });

    return createApiEnvelope({ success: true, item: saved }, request.id);
  });

  typedFastify.patch("/reward-catalog/:itemId", {
    schema: {
      body: z.object({
        sessionId: z.string(),
        isActive: z.boolean(),
      }),
    },
  }, async (request) => {
    const ctx = await getAdminContext(request);
    if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED" } }, request.id);
    const { itemId } = request.params as { itemId: string };
    const { isActive } = request.body as any;
    const updated = await rewardCatalogRepo.setActive(itemId, isActive);
    return createApiEnvelope({ success: true, item: updated }, request.id);
  });

  typedFastify.delete("/reward-catalog/:itemId", {
    schema: { body: z.object({ sessionId: z.string() }) },
  }, async (request) => {
    const ctx = await getAdminContext(request);
    if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED" } }, request.id);
    const { itemId } = request.params as { itemId: string };
    await rewardCatalogRepo.deleteItem(itemId);
    await opsRepo.logEvent({
      channel: "admin",
      severity: "info",
      source: "admin_api",
      kind: "reward_catalog_deleted",
      userId: ctx.user.id,
      message: `Reward catalog item deleted: ${itemId}`,
      meta: { itemId },
    });
    return createApiEnvelope({ success: true, itemId }, request.id);
  });

  // ─── Reward Submissions Review (admin approve / reject user submissions) ─

  typedFastify.get("/submissions", async (request) => {
    const ctx = await getAdminContext(request);
    if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED" } }, request.id);
    const q = request.query as { status?: string };
    const items = await submissionRepo.listByStatus(q?.status ?? null, 100);
    return createApiEnvelope({ submissions: items }, request.id);
  });

  typedFastify.post("/submissions/:submissionId/approve", {
    schema: {
      body: z.object({
        sessionId: z.string(),
        reviewNote: z.string().optional(),
        rarityOverride: z.string().optional(),
      }),
    },
  }, async (request) => {
    const ctx = await getAdminContext(request);
    if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED" } }, request.id);

    const { submissionId } = request.params as { submissionId: string };
    const { reviewNote, rarityOverride } = request.body as any;

    const sub = await submissionRepo.getById(submissionId);
    if (!sub) return createApiEnvelope({ error: { code: "NOT_FOUND" } }, request.id);
    if (sub.status !== "pending") return createApiEnvelope({ error: { code: "ALREADY_REVIEWED" } }, request.id);

    // Promote to reward_catalog
    const itemId = `user_${sub.type}_${submissionId.slice(0, 8)}`;
    await rewardCatalogRepo.upsertItem({
      itemId,
      type: sub.type,
      name: sub.name,
      rarity: rarityOverride ?? sub.rarity ?? "common",
      source: "user",
      description: sub.description ?? undefined,
      icon: sub.icon ?? undefined,
      isActive: true,
      meta: { submissionId, submittedBy: sub.address },
    });

    await submissionRepo.updateStatus(submissionId, {
      status: "approved",
      reviewedBy: ctx.session.address,
      reviewNote,
      approvedItemId: itemId,
    });

    await opsRepo.logEvent({
      channel: "admin",
      severity: "info",
      source: "admin_api",
      kind: "submission_approved",
      userId: ctx.user.id,
      message: `Submission ${submissionId} approved as ${itemId}`,
      meta: { submissionId, itemId, type: sub.type },
    });

    return createApiEnvelope({ success: true, submissionId, itemId }, request.id);
  });

  typedFastify.post("/submissions/:submissionId/reject", {
    schema: {
      body: z.object({
        sessionId: z.string(),
        reviewNote: z.string().optional(),
      }),
    },
  }, async (request) => {
    const ctx = await getAdminContext(request);
    if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED" } }, request.id);

    const { submissionId } = request.params as { submissionId: string };
    const { reviewNote } = request.body as any;

    const sub = await submissionRepo.getById(submissionId);
    if (!sub) return createApiEnvelope({ error: { code: "NOT_FOUND" } }, request.id);
    if (sub.status !== "pending") return createApiEnvelope({ error: { code: "ALREADY_REVIEWED" } }, request.id);

    await submissionRepo.updateStatus(submissionId, {
      status: "rejected",
      reviewedBy: ctx.session.address,
      reviewNote,
    });

    await opsRepo.logEvent({
      channel: "admin",
      severity: "info",
      source: "admin_api",
      kind: "submission_rejected",
      userId: ctx.user.id,
      message: `Submission ${submissionId} rejected`,
      meta: { submissionId },
    });

    return createApiEnvelope({ success: true, submissionId }, request.id);
  });

  // ─── User management (inspect / win bias) ────────────────────────────────

  // Inspect a user by address - returns profile + balances-like info
  typedFastify.get("/users/:address", async (request) => {
    const ctx = await getAdminContext(request);
    if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED" } }, request.id);
    const { address } = request.params as { address: string };
    const addrLower = String(address || "").toLowerCase();
    const user = await userRepo.getUserByAddress(addrLower);
    if (!user) return createApiEnvelope({ error: { code: "NOT_FOUND", message: "User not found" } }, request.id);
    const profile = await userRepo.getUserProfile(user.id).catch(() => null);
    return createApiEnvelope({
      user: {
        id: user.id,
        address: user.address,
        displayName: (user as any).displayName ?? null,
        createdAt: (user as any).createdAt ?? null,
      },
      profile,
    }, request.id);
  });

  // Set user win bias (0-1). Body bias=null clears it.
  typedFastify.post("/users/:address/win-bias", {
    schema: {
      body: z.object({
        sessionId: z.string(),
        bias: z.number().min(0).max(1).nullable(),
      }),
    },
  }, async (request) => {
    const ctx = await getAdminContext(request);
    if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED" } }, request.id);
    const { address } = request.params as { address: string };
    const { bias } = request.body as any;
    const addrLower = String(address || "").toLowerCase();
    const user = await userRepo.getUserByAddress(addrLower);
    if (!user) return createApiEnvelope({ error: { code: "NOT_FOUND", message: "User not found" } }, request.id);

    await userRepo.saveUserProfile(user.id, {
      winBias: bias === null ? null : String(bias),
    } as any);

    await opsRepo.logEvent({
      channel: "admin",
      severity: "warn",
      source: "admin_api",
      kind: "user_win_bias_set",
      userId: ctx.user.id,
      message: `Set win_bias=${bias} for ${addrLower}`,
      meta: { targetAddress: addrLower, bias },
    });

    return createApiEnvelope({ success: true, address: addrLower, bias }, request.id);
  });

  // ─── Campaigns / Events Management ────────────────────────────────────────

  typedFastify.get("/campaigns", async (request) => {
    const ctx = await getAdminContext(request);
    if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED" } }, request.id);
    const campaigns = await campaignRepo.listAll(200);
    return createApiEnvelope({ campaigns }, request.id);
  });

  typedFastify.post("/campaigns", {
    schema: {
      body: z.object({
        sessionId: z.string(),
        campaignId: z.string().optional(),
        title: z.string().min(1).max(120),
        description: z.string().max(600).optional(),
        isActive: z.boolean().optional(),
        startAt: z.string().nullable().optional(),
        endAt: z.string().nullable().optional(),
        claimLimitPerUser: z.number().int().min(1).max(100).optional(),
        minLevel: z.string().optional(),
        rewards: z
          .object({
            zxc: z.number().optional(),
            yjc: z.number().optional(),
            items: z.array(z.object({ id: z.string(), qty: z.number().optional() })).optional(),
            avatars: z.array(z.string()).optional(),
            titles: z.array(z.string()).optional(),
          })
          .default({}),
      }),
    },
  }, async (request) => {
    const ctx = await getAdminContext(request);
    if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED" } }, request.id);
    const body = request.body as any;
    const campaignId = String(body.campaignId || "").trim() || `cmp_${Date.now().toString(36)}`;
    const toDate = (v: any) => (v ? new Date(v) : null);
    const record = await campaignRepo.upsert({
      campaignId,
      title: body.title,
      description: body.description ?? null,
      isActive: body.isActive !== undefined ? body.isActive : true,
      startAt: toDate(body.startAt),
      endAt: toDate(body.endAt),
      claimLimitPerUser: body.claimLimitPerUser ?? 1,
      minLevel: body.minLevel ?? null,
      rewards: body.rewards || {},
      createdBy: ctx.session.address,
    });
    await opsRepo.logEvent({
      channel: "admin",
      severity: "info",
      source: "admin_api",
      kind: "campaign_upsert",
      userId: ctx.user.id,
      message: `Campaign ${campaignId} saved`,
      meta: { campaignId, title: body.title, isActive: record?.isActive },
    });
    return createApiEnvelope({ campaign: record }, request.id);
  });

  typedFastify.delete("/campaigns/:campaignId", async (request) => {
    const ctx = await getAdminContext(request);
    if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED" } }, request.id);
    const { campaignId } = request.params as { campaignId: string };
    await campaignRepo.delete(campaignId);
    return createApiEnvelope({ success: true }, request.id);
  });

  // Admin grant bundle directly to a user
  typedFastify.post("/grant", {
    schema: {
      body: z.object({
        sessionId: z.string(),
        address: z.string(),
        zxc: z.number().optional(),
        yjc: z.number().optional(),
        items: z.array(z.object({ id: z.string(), qty: z.number().optional() })).optional(),
        avatars: z.array(z.string()).optional(),
        titles: z.array(z.string()).optional(),
        note: z.string().max(240).optional(),
      }),
    },
  }, async (request) => {
    const ctx = await getAdminContext(request);
    if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED" } }, request.id);
    const body = request.body as any;
    const normalized = identityManager.tryNormalizeAddress(body.address);
    if (!normalized) return createApiEnvelope({ error: { message: "Invalid address" } }, request.id);

    const user = await userRepo.getUserByAddress(normalized);
    if (!user) return createApiEnvelope({ error: { code: "NOT_FOUND", message: "User not found" } }, request.id);

    // Adjust balances (if provided)
    const bundleSummary: any = { items: body.items || [], avatars: body.avatars || [], titles: body.titles || [] };
    if (typeof body.zxc === "number" && body.zxc !== 0) {
      const key = `balance:${normalized}`;
      const current = parseFloat((await kv.get<string>(key)) || "0");
      const next = Math.max(0, current + body.zxc).toString();
      await kv.set(key, next);
      bundleSummary.zxc = body.zxc;
    }
    if (typeof body.yjc === "number" && body.yjc !== 0) {
      const key = `balance_yjc:${normalized}`;
      const current = parseFloat((await kv.get<string>(key)) || "0");
      const next = Math.max(0, current + body.yjc).toString();
      await kv.set(key, next);
      bundleSummary.yjc = body.yjc;
    }

    // Grant items / avatars / titles
    if ((body.items?.length ?? 0) || (body.avatars?.length ?? 0) || (body.titles?.length ?? 0)) {
      await grantBundleToUser(
        user.id,
        {
          items: body.items,
          avatars: body.avatars,
          titles: body.titles,
        },
        normalized,
      );
    }

    await campaignRepo.logGrant({
      targetAddress: normalized,
      operatorAddress: ctx.session.address,
      source: "admin",
      note: body.note ?? null,
      bundle: bundleSummary,
    });
    await opsRepo.logEvent({
      channel: "admin",
      severity: "important",
      source: "admin_grant",
      kind: "admin_grant",
      userId: ctx.user.id,
      address: normalized,
      message: `Admin granted rewards to ${normalized}`,
      meta: { ...bundleSummary, note: body.note ?? null },
    });

    return createApiEnvelope({ success: true, bundle: bundleSummary }, request.id);
  });

  typedFastify.get("/grant-logs", async (request) => {
    const ctx = await getAdminContext(request);
    if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED" } }, request.id);
    const logs = await campaignRepo.listGrantLogs(100);
    return createApiEnvelope({ logs }, request.id);
  });

  // ─── Events & Monitoring ──────────────────────────────────────────────────

  typedFastify.get("/ops/events", async (request) => {
    const ctx = await getAdminContext(request);
    if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED" } }, request.id);
    
    const events = await opsRepo.listEvents({ limit: 100 });
    return createApiEnvelope({ events }, request.id);
  });
}


