// apps/api/src/routes/v1/rewards.ts

import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope } from "@repo/shared";
import { RewardManager, TITLES } from "@repo/domain";
import {
  SessionRepository,
  UserRepository,
  kv,
  OpsRepository,
  MetaRepository,
  RewardCatalogRepository,
  RewardSubmissionRepository,
  RewardCampaignRepository,
  } from "@repo/infrastructure";
import { requireDb } from "@repo/infrastructure";
import { randomUUID } from "crypto";
import {
  grantBundleToUser,
  ALL_ITEMS,
} from "../../utils/inventory.js";

export async function rewardRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  
  const rewardManager = new RewardManager();
  const sessionRepo = new SessionRepository();
  const userRepo = new UserRepository();
  const opsRepo = new OpsRepository();
  const metaRepo = new MetaRepository();
  const rewardCatalogRepo = new RewardCatalogRepository();
  const submissionRepo = new RewardSubmissionRepository();
  const campaignRepo = new RewardCampaignRepository();

  const getContext = async (req: any) => {
    const sessionId = req.headers["x-session-id"] || req.query?.sessionId || req.body?.sessionId;
    if (!sessionId) return null;
    const session = await sessionRepo.getSessionById(sessionId as string);
    if (!session || session.status !== "authorized") return null;
    const user = await userRepo.getUserById(session.userId);
    return { session, user };
  };

  // ─── Rewards Catalog ──────────────────────────────────────────────────────

  typedFastify.get("/catalog", async (request) => {
    const cacheKey = "rewards:catalog";
    const cached = await kv.get<string>(cacheKey);
    if (cached) {
      try { return createApiEnvelope(JSON.parse(cached), request.id); } catch {}
    }

    const customRows = await rewardCatalogRepo.listItems({});
    const customAvatars = customRows
      .filter((r: any) => r.type === "avatar")
      .map((r: any) => ({
        id: r.itemId,
        name: r.name,
        label: r.name,
        description: r.description,
        icon: r.icon,
        rarity: r.rarity,
        source: r.source || "admin",
      }));
    const customTitles = customRows
      .filter((r: any) => r.type === "title")
      .map((r: any) => ({
        id: r.itemId,
        name: r.name,
        label: r.name,
        description: r.description,
        icon: r.icon,
        rarity: r.rarity,
        source: r.source || "admin",
      }));

    const data = {
      titles: [...TITLES, ...customTitles],
      avatars: [...customAvatars],
      customItems: customRows.filter(
        (r: any) => r.type !== "avatar" && r.type !== "title"
      ),
      chests: [
        { id: "bronze", label: "青銅寶箱", price: "1000", rarity: "common" },
        { id: "silver", label: "白銀寶箱", price: "5000", rarity: "rare" },
        { id: "gold", label: "黃金寶箱", price: "25000", rarity: "epic" }
      ]
    };

    await kv.set(cacheKey, JSON.stringify(data), { ex: 60 });
    return createApiEnvelope(data, request.id);
  });

  // ─── User Rewards (Owned titles, avatars) ────────────────────────────────

  typedFastify.get("/me", async (request) => {
    const ctx = await getContext(request);
    if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED" } }, request.id);

    const invState = await (await import("../../utils/inventory.js")).loadInventoryState(ctx.user.id);
    return createApiEnvelope({ 
      ownedTitles: invState.ownedTitles, 
      ownedAvatars: invState.ownedAvatars,
      activeTitle: invState.activeTitle || "",
      activeAvatar: invState.activeAvatar,
    }, request.id);
  });

  // ─── User Submissions (propose custom avatars / titles) ──────────────────

  // Submit a new proposal (emoji + name + description, no file uploads)
  typedFastify.post("/submissions", {
    schema: {
      body: z.object({
        sessionId: z.string(),
        type: z.enum(["avatar", "title"]),
        name: z.string().min(1).max(32),
        icon: z.string().max(16).optional(), // emoji for avatars
        description: z.string().max(240).optional(),
        rarity: z.enum(["common", "rare", "epic", "legendary", "mythic"]).optional(),
      }),
    },
  }, async (request) => {
    try {
      const ctx = await getContext(request);
      if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED" } }, request.id);

      const { type, name, icon, description, rarity } = request.body;

      // Basic rate-limit: max 3 pending per user
      const mine = await submissionRepo.listByUser(ctx.user.id, 50);
      const pending = mine.filter((s: any) => s.status === "pending");
      if (pending.length >= 3) {
        return createApiEnvelope(
          { error: { code: "TOO_MANY_PENDING", message: "您目前已有 3 份待審核的投稿，請等審核後再提交" } },
          request.id,
        );
      }

      const submissionId = randomUUID();
      await submissionRepo.create({
        submissionId,
        userId: ctx.user.id,
        address: ctx.session.address,
        type,
        name,
        icon: icon ?? null,
        description: description ?? null,
        rarity: rarity ?? "common",
      });

      await opsRepo.logEvent({
        channel: "rewards",
        severity: "info",
        source: "user_submission",
        kind: "submission_created",
        userId: ctx.user.id,
        address: ctx.session.address,
        message: `User submitted ${type}: ${name}`,
        meta: { submissionId, type, name, icon, rarity },
      });

      return createApiEnvelope({ success: true, submissionId }, request.id);
    } catch (err: any) {
      return createApiEnvelope({ error: { message: err?.message || "Submission failed" } }, request.id);
    }
  });

  // List my own submissions
  typedFastify.get("/submissions/me", async (request) => {
    try {
      const ctx = await getContext(request);
      if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED" } }, request.id);
      const items = await submissionRepo.listByUser(ctx.user.id, 50);
      return createApiEnvelope({ submissions: items }, request.id);
    } catch (err: any) {
      return createApiEnvelope({ error: { message: err?.message || "list submissions failed" } }, request.id);
    }
  });

  // ─── Chest Opening ────────────────────────────────────────────────────────

  typedFastify.post("/chests/open", {
    schema: {
      body: z.object({
        sessionId: z.string(),
        chestType: z.enum(["bronze", "silver", "gold"])
      })
    }
  }, async (request) => {
    const ctx = await getContext(request);
    if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED" } }, request.id);

    const { chestType } = request.body;
    const address = ctx.session.address;
    
    // Check balance via DB
    const { gameSettlement } = await import("../../utils/game-settlement.js");
    const prices = { bronze: 1000, silver: 5000, gold: 25000 };
    const price = prices[chestType];
    const balance = parseFloat(await gameSettlement.getBalance(address, "zhixi"));

    if (balance < price) {
      return createApiEnvelope({ error: { message: "Insufficient balance" } }, request.id);
    }

    // Deduct
    await gameSettlement.setBalance(address, "zhixi", (balance - price).toString());

    // Logic for randomized reward (stubbed in RewardManager for now)
    const seed = `${address}:${Date.now()}:${Math.random()}`;
    const result = rewardManager.openChest(chestType, seed);

    await opsRepo.logEvent({
      channel: "rewards",
      severity: "info",
      source: "chest_op",
      kind: "chest_opened",
      userId: ctx.user.id,
      address,
      message: `User opened ${chestType} chest`,
      meta: { chestType, price, result }
    });

    return createApiEnvelope({ success: true, result, balance: (balance - price).toString() }, request.id);
  });

  // ─── Select Title/Avatar ───────────────────────────────────────────────────

  typedFastify.post("/equip", {
    schema: {
      body: z.object({
        sessionId: z.string(),
        type: z.enum(["title", "avatar"]),
        id: z.string()
      })
    }
  }, async (request) => {
    const ctx = await getContext(request);
    if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED" } }, request.id);

    const { type, id } = request.body;
    const invState = await (await import("../../utils/inventory.js")).loadInventoryState(ctx.user.id);

    const owned = type === "title" ? invState.ownedTitles : invState.ownedAvatars;
    const defaultId = type === "title" ? "title_newbie" : "classic_chip";
    if (!owned.includes(id) && id !== defaultId) {
      return createApiEnvelope({ error: { message: "不擁有此物品" } }, request.id);
    }

    const userRepo = new UserRepository();
    if (type === "title") {
      await userRepo.saveUserProfile(ctx.user.id, { selectedTitleId: id });
    } else {
      await userRepo.saveUserProfile(ctx.user.id, { selectedAvatarId: id });
    }

    return createApiEnvelope({ success: true, activeId: id }, request.id);
  });

  // ─── Public Campaigns (events) ───────────────────────────────────────────

  typedFastify.get("/campaigns", async (request) => {
    try {
      const ctx = await getContext(request);
      const now = Date.now();
      const all = await campaignRepo.listActive(50);
      const campaigns = (all || []).filter((c: any) => {
        if (c.startAt && new Date(c.startAt).getTime() > now) return false;
        if (c.endAt && new Date(c.endAt).getTime() < now) return false;
        return true;
      });

      let claimedSet = new Set<string>();
      if (ctx?.user?.id) {
        for (const c of campaigns) {
          const n = await campaignRepo.countClaims(c.campaignId, ctx.user.id);
          if (n >= ((c as any).maxClaimsPerUser ?? 1)) claimedSet.add(c.campaignId);
        }
      }
      const enriched = campaigns.map((c: any) => ({
        ...c,
        claimed: claimedSet.has(c.campaignId),
      }));
      return createApiEnvelope({ campaigns: enriched }, request.id);
    } catch (err: any) {
      return createApiEnvelope({ error: { message: err?.message || "campaigns fetch failed" } }, request.id);
    }
  });

  typedFastify.post("/campaigns/:campaignId/claim", async (request) => {
    const handlerCtx = await getContext(request);
    if (!handlerCtx) return createApiEnvelope({ error: { code: "UNAUTHORIZED" } }, request.id);
    const { campaignId } = request.params as { campaignId: string };
    try {
      const campaign = await campaignRepo.getById(campaignId);
      if (!campaign) return createApiEnvelope({ error: { code: "NOT_FOUND", message: "活動不存在" } }, request.id);
      if (!campaign.isActive) return createApiEnvelope({ error: { code: "INACTIVE", message: "活動已停用" } }, request.id);
      const now = Date.now();
      if (campaign.startAt && new Date(campaign.startAt).getTime() > now) {
        return createApiEnvelope({ error: { code: "NOT_STARTED", message: "活動尚未開始" } }, request.id);
      }
      if (campaign.endAt && new Date(campaign.endAt).getTime() < now) {
        return createApiEnvelope({ error: { code: "ENDED", message: "活動已結束" } }, request.id);
      }
      const limit = (campaign as any).maxClaimsPerUser ?? 1;
      const address = String(handlerCtx.user.address || "").toLowerCase();
      const ok = await campaignRepo.tryClaim({ campaignId, userId: handlerCtx.user.id, address, limit });
      if (!ok) {
        return createApiEnvelope({ error: { code: "LIMIT_REACHED", message: "已達領取上限" } }, request.id);
      }
      const rewards = (campaign.rewards as any) || {};
      const resolveName = (id: string) => {
        const def = ALL_ITEMS[id];
        if (def) return def.name || def.nameEn || id;
        if (id.startsWith('chest_key_')) {
          const typeName = id.replace('chest_key_', '');
          return ({ common: '普通', rare: '稀有', epic: '史詩', legendary: '傳奇', mythic: '神話' } as Record<string, string>)[typeName] + '寶箱鑰匙' || id;
        }
        return id;
      };
      const bundleSummary: any = {
        items: (rewards.items || []).map((it: any) => ({ ...it, name: resolveName(it.id) })),
        avatars: (rewards.avatars || []).map((a: string) => ({ id: a, name: resolveName(a) })),
        titles: (rewards.titles || []).map((t: string) => ({ id: t, name: resolveName(t) })),
      };
      let grantErr: Error | null = null;
      try {
        if (rewards.items?.length || rewards.avatars?.length || rewards.titles?.length) {
          await grantBundleToUser(handlerCtx.user.id, { items: rewards.items, avatars: rewards.avatars, titles: rewards.titles }, address);
        }
        if (typeof rewards.zxc === "number" && rewards.zxc > 0) {
          const { gameSettlement } = await import("../../utils/game-settlement.js");
          const current = parseFloat(await gameSettlement.getBalance(address, "zhixi"));
          await gameSettlement.setBalance(address, "zhixi", (current + rewards.zxc).toString());
          bundleSummary.zxc = rewards.zxc;
        }
        if (typeof rewards.yjc === "number" && rewards.yjc > 0) {
          const { gameSettlement } = await import("../../utils/game-settlement.js");
          const current = parseFloat(await gameSettlement.getBalance(address, "yjc"));
          await gameSettlement.setBalance(address, "yjc", (current + rewards.yjc).toString());
          bundleSummary.yjc = rewards.yjc;
        }
      } catch (grantErrInner: any) {
        grantErr = grantErrInner;
        // Rollback claim row so user can retry
        try {
          const rollbackConn = await requireDb();
          await rollbackConn.execute?.(
            `DELETE FROM reward_grants WHERE campaign_id = $1 AND user_id = $2 AND source = 'campaign'`,
            [campaignId, handlerCtx.user.id]
          );
        } catch {}
      }
      if (grantErr) {
        await opsRepo.logEvent({
          channel: "rewards", severity: "error", source: "campaign_claim", kind: "campaign_claim_grant_failed",
          userId: handlerCtx.user.id, address, message: `Grant failed for campaign ${campaignId}: ${grantErr.message}`,
          meta: { campaignId, err: String(grantErr) },
        }).catch(() => {});
        return createApiEnvelope({ error: { code: "GRANT_FAILED", message: `發放獎勵失敗，請重新領取` } }, request.id);
      }
      await campaignRepo.logGrant({ targetAddress: address, operatorAddress: null, source: "campaign", note: campaign.title, bundle: { campaignId, ...bundleSummary } }).catch(() => {});
      await opsRepo.logEvent({
        channel: "rewards", severity: "info", source: "campaign_claim", kind: "campaign_claim",
        userId: handlerCtx.user.id, address, message: `Claimed campaign ${campaignId}`, meta: { campaignId, bundle: bundleSummary },
      }).catch(() => {});
      return createApiEnvelope({ success: true, bundle: bundleSummary }, request.id);
    } catch (outerErr: any) {
      await opsRepo.logEvent({
        channel: "rewards", severity: "error", source: "campaign_claim", kind: "campaign_claim_fatal",
        userId: handlerCtx?.user?.id, message: `Fatal error claiming campaign ${campaignId}: ${outerErr?.message || String(outerErr)}`,
        meta: { campaignId, stack: outerErr?.stack },
      }).catch(() => {});
      return createApiEnvelope({ error: { code: "CLAIM_FAILED", message: `領取失敗: ${outerErr?.message || "未知錯誤"}` } }, request.id);
    }
  });
}
