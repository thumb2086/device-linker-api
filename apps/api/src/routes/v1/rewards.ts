// apps/api/src/routes/v1/rewards.ts

import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope } from "@repo/shared";
import { RewardManager, TITLES, AVATARS } from "@repo/domain";
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
import { randomUUID } from "crypto";
import {
  grantBundleToUser,
  loadInventoryState,
  rollbackGrantBundle,
  computeNewlyAdded,
  type ProfileInventoryState,
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
    // Merge code-defined TITLES/AVATARS with admin-managed reward_catalog rows
    // so custom avatars/titles stored via the admin panel show up in the
    // client's ItemsTab alongside the built-in ones.
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

    return createApiEnvelope({
      titles: [...TITLES, ...customTitles],
      avatars: [...AVATARS, ...customAvatars],
      customItems: customRows.filter(
        (r: any) => r.type !== "avatar" && r.type !== "title"
      ),
      chests: [
        { id: "bronze", label: "青銅寶箱", price: "1000", rarity: "common" },
        { id: "silver", label: "白銀寶箱", price: "5000", rarity: "rare" },
        { id: "gold", label: "黃金寶箱", price: "25000", rarity: "epic" }
      ]
    }, request.id);
  });

  // ─── User Rewards (Owned titles, avatars) ────────────────────────────────

  typedFastify.get("/me", async (request) => {
    const ctx = await getContext(request);
    if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED" } }, request.id);

    const address = ctx.session.address;
    const ownedTitles = await kv.get<string[]>(`owned_titles:${address}`) || ["newbie"];
    const ownedAvatars = await kv.get<string[]>(`owned_avatars:${address}`) || ["classic_chip"];
    const activeTitle = await kv.get<string>(`active_title:${address}`) || "newbie";
    const activeAvatar = await kv.get<string>(`active_avatar:${address}`) || "classic_chip";

    return createApiEnvelope({ 
      ownedTitles, 
      ownedAvatars,
      activeTitle,
      activeAvatar
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
  });

  // List my own submissions
  typedFastify.get("/submissions/me", async (request) => {
    const ctx = await getContext(request);
    if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED" } }, request.id);
    const items = await submissionRepo.listByUser(ctx.user.id, 50);
    return createApiEnvelope({ submissions: items }, request.id);
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
    
    // Check balance
    const prices = { bronze: 1000, silver: 5000, gold: 25000 };
    const price = prices[chestType];
    const balanceStr = await kv.get<string>(`balance:${address}`) || "0";
    const balance = parseFloat(balanceStr);

    if (balance < price) {
      return createApiEnvelope({ error: { message: "Insufficient balance" } }, request.id);
    }

    // Deduct
    await kv.set(`balance:${address}`, (balance - price).toString());

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
    const address = ctx.session.address;
    
    const ownedKey = type === "title" ? `owned_titles:${address}` : `owned_avatars:${address}`;
    const owned = await kv.get<string[]>(ownedKey) || [];

    const defaultId = type === "title" ? "newbie" : "classic_chip";
    if (!owned.includes(id) && id !== defaultId) {
      return createApiEnvelope({ error: { message: "Not owned" } }, request.id);
    }

    const activeKey = type === "title" ? `active_title:${address}` : `active_avatar:${address}`;
    await kv.set(activeKey, id);

    return createApiEnvelope({ success: true, activeId: id }, request.id);
  });

  // ─── Public Campaigns (events) ───────────────────────────────────────────

  typedFastify.get("/campaigns", async (request) => {
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
  });

  typedFastify.post("/campaigns/:campaignId/claim", async (request) => {
    const ctx = await getContext(request);
    if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED" } }, request.id);
    const { campaignId } = request.params as { campaignId: string };
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
    const address = String(ctx.user.address || "").toLowerCase();

    // Atomically check the claim limit and record the claim inside a transaction
    // guarded by a pg_advisory_xact_lock on (campaignId, userId). Concurrent
    // requests from the same user serialize on the lock and only the first
    // `limit` successful inserts return true — the rest return false without
    // any reward being granted.
    const ok = await campaignRepo.tryClaim({
      campaignId,
      userId: ctx.user.id,
      address,
      limit,
    });
    if (!ok) {
      return createApiEnvelope({ error: { code: "LIMIT_REACHED", message: "已達領取上限" } }, request.id);
    }

    const rewards = (campaign.rewards as any) || {};
    const bundleSummary: any = {
      items: rewards.items || [],
      avatars: rewards.avatars || [],
      titles: rewards.titles || [],
    };

    // tryClaim already committed the claim row. If any reward-granting step
    // below throws we MUST fully unwind the partial grant (DB inventory,
    // KV-synced owned lists, ZXC/YJC balance credits) AND delete the claim row
    // so the user can retry. Without this, the user either gets locked out
    // with no reward OR retries succeed and double-dip on items / balance.
    //
    // Strategy: snapshot inventory BEFORE the grant, track the "newly added"
    // avatars/titles, track exactly how many ZXC/YJC were credited — then in
    // catch, restore the snapshot via rollbackGrantBundle, subtract the
    // credited balances, and deleteLatestClaim.
    const hasBundle = Boolean(
      (rewards.items?.length ?? 0) || (rewards.avatars?.length ?? 0) || (rewards.titles?.length ?? 0),
    );
    let preState: ProfileInventoryState | null = null;
    let addedAvatars: string[] = [];
    let addedTitles: string[] = [];
    let bundleGranted = false;
    let zxcCredited = 0;
    let yjcCredited = 0;
    try {
      if (hasBundle) {
        preState = await loadInventoryState(ctx.user.id);
        ({ addedAvatars, addedTitles } = computeNewlyAdded(preState, {
          items: rewards.items,
          avatars: rewards.avatars,
          titles: rewards.titles,
        }));
        await grantBundleToUser(
          ctx.user.id,
          {
            items: rewards.items,
            avatars: rewards.avatars,
            titles: rewards.titles,
          },
          address,
        );
        bundleGranted = true;
      }
      if (typeof rewards.zxc === "number" && rewards.zxc > 0) {
        const key = `balance:${address}`;
        const current = parseFloat((await kv.get<string>(key)) || "0");
        await kv.set(key, (current + rewards.zxc).toString());
        zxcCredited = rewards.zxc;
        bundleSummary.zxc = rewards.zxc;
      }
      if (typeof rewards.yjc === "number" && rewards.yjc > 0) {
        const key = `balance_yjc:${address}`;
        const current = parseFloat((await kv.get<string>(key)) || "0");
        await kv.set(key, (current + rewards.yjc).toString());
        yjcCredited = rewards.yjc;
        bundleSummary.yjc = rewards.yjc;
      }
    } catch (err) {
      // 1. Reverse the items / avatars / titles grant.
      if (bundleGranted && preState) {
        try {
          await rollbackGrantBundle(ctx.user.id, preState, address, addedAvatars, addedTitles);
        } catch {
          // swallow - captured below via ops log
        }
      }
      // 2. Reverse any balance credits that were already applied.
      if (zxcCredited > 0) {
        try {
          const key = `balance:${address}`;
          const current = parseFloat((await kv.get<string>(key)) || "0");
          await kv.set(key, Math.max(0, current - zxcCredited).toString());
        } catch {
          // swallow - captured below via ops log
        }
      }
      if (yjcCredited > 0) {
        try {
          const key = `balance_yjc:${address}`;
          const current = parseFloat((await kv.get<string>(key)) || "0");
          await kv.set(key, Math.max(0, current - yjcCredited).toString());
        } catch {
          // swallow - captured below via ops log
        }
      }
      // 3. Delete the claim row so the user can retry.
      try {
        await campaignRepo.deleteLatestClaim(campaignId, ctx.user.id);
      } catch (rollbackErr) {
        await opsRepo.logEvent({
          channel: "rewards",
          severity: "error",
          source: "campaign_claim",
          kind: "campaign_claim_rollback_failed",
          userId: ctx.user.id,
          address,
          message: `Failed to roll back claim for ${campaignId}`,
          meta: { campaignId, err: String(rollbackErr) },
        }).catch(() => {});
      }
      await opsRepo.logEvent({
        channel: "rewards",
        severity: "error",
        source: "campaign_claim",
        kind: "campaign_claim_grant_failed",
        userId: ctx.user.id,
        address,
        message: `Grant failed for campaign ${campaignId} — rolled back`,
        meta: {
          campaignId,
          err: String(err),
          bundleGranted,
          addedAvatars,
          addedTitles,
          zxcCredited,
          yjcCredited,
        },
      }).catch(() => {});
      throw err;
    }
    // Claim + rewards already committed at this point. Audit logs (logGrant +
    // logEvent) are best-effort — swallow their failures so a transient DB
    // error doesn't surface as a 500 and permanently lock the user out
    // (tryClaim would reject the retry).
    await campaignRepo
      .logGrant({
        targetAddress: address,
        operatorAddress: null,
        source: "campaign",
        note: campaign.title,
        bundle: { campaignId, ...bundleSummary },
      })
      .catch(() => {});
    await opsRepo
      .logEvent({
        channel: "rewards",
        severity: "info",
        source: "campaign_claim",
        kind: "campaign_claim",
        userId: ctx.user.id,
        address,
        message: `Claimed campaign ${campaignId}`,
        meta: { campaignId, bundle: bundleSummary },
      })
      .catch(() => {});
    return createApiEnvelope({ success: true, bundle: bundleSummary }, request.id);
  });
}
