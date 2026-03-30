// apps/api/src/routes/v1/rewards.ts

import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope } from "@repo/shared";
import { RewardManager } from "@repo/domain";
import { SessionRepository, UserRepository, OpsRepository, MetaRepository, WalletRepository } from "@repo/infrastructure";

const DEFAULT_REWARD_CATALOG = [
  { itemId: "newbie", type: "title", name: "初出茅廬", description: "剛加入的新手", rarity: "common", source: "system" },
  { itemId: "high_roller", type: "title", name: "豪氣干雲", description: "單次下注超過 1,000,000", rarity: "rare", source: "system" },
  { itemId: "gambling_god", type: "title", name: "賭聖", description: "總贏得金額超過 100,000,000", rarity: "mythic", source: "system" },
  { itemId: "std_1", type: "avatar", name: "基本頭像 1", description: "預設頭像", rarity: "common", source: "system", icon: "/assets/avatars/1.png" },
  { itemId: "vip_1", type: "avatar", name: "VIP 專屬 1", description: "VIP 專用頭像", rarity: "rare", source: "system", icon: "/assets/avatars/v1.png" },
  { itemId: "bronze", type: "chest", name: "青銅寶箱", description: "基本寶箱", rarity: "common", source: "shop", price: "1000" },
  { itemId: "silver", type: "chest", name: "白銀寶箱", description: "進階寶箱", rarity: "rare", source: "shop", price: "5000" },
  { itemId: "gold", type: "chest", name: "黃金寶箱", description: "高級寶箱", rarity: "epic", source: "shop", price: "25000" },
  { itemId: "repair_kit", type: "consumable", name: "修復工具包", description: "恢復耐久度", rarity: "common", source: "system" },
  { itemId: "boost_10x", type: "buff", name: "10x 增幅器", description: "短時間倍率提升", rarity: "epic", source: "system" },
];

export async function rewardRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();

  const rewardManager = new RewardManager();
  const sessionRepo = new SessionRepository();
  const userRepo = new UserRepository();
  const walletRepo = new WalletRepository();
  const opsRepo = new OpsRepository();
  const metaRepo = new MetaRepository();

  const getContext = async (req: any) => {
    const sessionId = req.headers["x-session-id"] || req.query?.sessionId || req.body?.sessionId;
    if (!sessionId) return null;
    const session = await sessionRepo.getSessionById(sessionId as string);
    if (!session || session.status !== "authorized") return null;
    const user = await userRepo.getUserById(session.userId);
    return { session, user };
  };

  const ensureCatalog = async () => {
    await metaRepo.syncRewardCatalogFromLegacy();
    await metaRepo.ensureRewardCatalogSeed(DEFAULT_REWARD_CATALOG);
    return await metaRepo.listRewardCatalog();
  };

  typedFastify.get("/catalog", async (request) => {
    const catalog = await ensureCatalog();
    const titles = catalog.filter((x: any) => x.type === "title");
    const avatars = catalog.filter((x: any) => x.type === "avatar");
    const chests = catalog.filter((x: any) => x.type === "chest");
    const items = catalog.filter((x: any) => x.type === "buff" || x.type === "consumable" || x.type === "collectible");

    return createApiEnvelope({ titles, avatars, chests, items }, request.id);
  });


  typedFastify.post("/catalog/sync-legacy", async (request) => {
    const syncResult = await metaRepo.syncRewardCatalogFromLegacy();
    const catalog = await metaRepo.listRewardCatalog();
    return createApiEnvelope({ syncResult, total: catalog.length }, request.id);
  });


  typedFastify.post("/catalog/import", {
    schema: {
      body: z.object({
        items: z.array(z.object({
          itemId: z.string(),
          type: z.string(),
          name: z.string(),
          description: z.string().optional(),
          rarity: z.string().optional(),
          source: z.string().optional(),
          icon: z.string().optional(),
          price: z.string().optional(),
          meta: z.any().optional(),
          isActive: z.boolean().optional(),
        }))
      })
    }
  }, async (request) => {
    const { items } = request.body;
    await metaRepo.ensureRewardCatalogSeed(items);
    const catalog = await metaRepo.listRewardCatalog();
    return createApiEnvelope({ imported: items.length, total: catalog.length }, request.id);
  });

  typedFastify.get("/me", async (request) => {
    const ctx = await getContext(request);
    if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED" } }, request.id);

    const catalog = await ensureCatalog();
    const defaultTitle = catalog.find((x: any) => x.type === "title")?.itemId || "newbie";
    const defaultAvatar = catalog.find((x: any) => x.type === "avatar")?.itemId || "std_1";

    const profile = await userRepo.getUserProfile(ctx.user.id);
    const ownedTitles = Array.isArray(profile?.ownedTitles) && profile.ownedTitles.length > 0 ? profile.ownedTitles : [defaultTitle];
    const ownedAvatars = Array.isArray(profile?.ownedAvatars) && profile.ownedAvatars.length > 0 ? profile.ownedAvatars : [defaultAvatar];
    const activeTitle = profile?.selectedTitleId || ownedTitles[0];
    const activeAvatar = profile?.selectedAvatarId || ownedAvatars[0];

    if (!profile) {
      await userRepo.saveUserProfile(ctx.user.id, {
        ownedTitles,
        ownedAvatars,
        selectedTitleId: activeTitle,
        selectedAvatarId: activeAvatar,
      });
    }

    return createApiEnvelope({ ownedTitles, ownedAvatars, activeTitle, activeAvatar }, request.id);
  });

  typedFastify.post("/chests/open", {
    schema: {
      body: z.object({
        sessionId: z.string(),
        chestType: z.string(),
      })
    }
  }, async (request) => {
    const ctx = await getContext(request);
    if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED" } }, request.id);

    const { chestType } = request.body;
    const address = ctx.session.address;
    const catalog = await ensureCatalog();

    const chest = catalog.find((x: any) => x.type === "chest" && x.itemId === chestType);
    if (!chest) return createApiEnvelope({ error: { message: "Chest type not found" } }, request.id);

    const price = Number(chest.price || 0);
    const balance = Number(await walletRepo.getBalance(address, "zhixi"));
    if (balance < price) return createApiEnvelope({ error: { message: "Insufficient balance" } }, request.id);

    await walletRepo.updateBalance(address, (balance - price).toString(), "zhixi");

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
    const profile = await userRepo.getUserProfile(ctx.user.id);

    const owned = type === "title" ? (profile?.ownedTitles || []) : (profile?.ownedAvatars || []);
    if (!owned.includes(id)) return createApiEnvelope({ error: { message: "Not owned" } }, request.id);

    await userRepo.saveUserProfile(ctx.user.id, type === "title" ? { selectedTitleId: id } : { selectedAvatarId: id });

    return createApiEnvelope({ success: true, activeId: id }, request.id);
  });
}
