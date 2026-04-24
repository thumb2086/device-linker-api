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
} from "@repo/infrastructure";

export async function rewardRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  
  const rewardManager = new RewardManager();
  const sessionRepo = new SessionRepository();
  const userRepo = new UserRepository();
  const opsRepo = new OpsRepository();
  const metaRepo = new MetaRepository();
  const rewardCatalogRepo = new RewardCatalogRepository();

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
    const ownedAvatars = await kv.get<string[]>(`owned_avatars:${address}`) || ["std_1"];
    const activeTitle = await kv.get<string>(`active_title:${address}`) || "newbie";
    const activeAvatar = await kv.get<string>(`active_avatar:${address}`) || "std_1";

    return createApiEnvelope({ 
      ownedTitles, 
      ownedAvatars,
      activeTitle,
      activeAvatar
    }, request.id);
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
    
    if (!owned.includes(id) && id !== "newbie" && id !== "std_1") {
      return createApiEnvelope({ error: { message: "Not owned" } }, request.id);
    }

    const activeKey = type === "title" ? `active_title:${address}` : `active_avatar:${address}`;
    await kv.set(activeKey, id);

    return createApiEnvelope({ success: true, activeId: id }, request.id);
  });
}
