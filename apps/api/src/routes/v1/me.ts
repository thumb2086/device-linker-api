// apps/api/src/routes/v1/me.ts

import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope } from "@repo/shared";
import { buildVipStatus } from "@repo/domain";
import { SessionRepository, UserRepository, OpsRepository, MetaRepository } from "@repo/infrastructure";

export async function meRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  
  
  const sessionRepo = new SessionRepository();
  const userRepo = new UserRepository();
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

  // ─── User Profile (Comprehensive) ────────────────────────────────────────

  typedFastify.get("/profile", async (request) => {
    const ctx = await getContext(request);
    if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED" } }, request.id);

    const address = ctx.session.address;
    const totalBet = await userRepo.getTotalBetByUserId(ctx.user.id);
    const vip = buildVipStatus(totalBet);

    const profile = await userRepo.getUserProfile(ctx.user.id);
    const activeTitleId = profile?.selectedTitleId || "newbie";
    const activeAvatarId = profile?.selectedAvatarId || "std_1";

    const catalog = await metaRepo.listRewardCatalog();
    const title = catalog.find((x: any) => x.type === "title" && x.itemId === activeTitleId);
    const avatar = catalog.find((x: any) => x.type === "avatar" && x.itemId === activeAvatarId);

    return createApiEnvelope({ 
       profile: {
         id: ctx.user.id,
         address,
         displayName: ctx.user.displayName || (ctx.session.accountId ? `@${ctx.session.accountId}` : address.slice(0, 6) + "..." + address.slice(-4)),
         totalBet,
         vipLevel: vip.vipLevel,
         maxBet: vip.maxBet,
         title: title?.name || "新手",
         avatar: avatar?.icon || "/assets/avatars/1.png",
         mode: ctx.session.mode,
         createdAt: ctx.user.createdAt
       }
    }, request.id);
  });

  // ─── Inventory Management ────────────────────────────────────────────────

  typedFastify.get("/inventory", async (request) => {
    const ctx = await getContext(request);
    if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED" } }, request.id);

    const profile = await userRepo.getUserProfile(ctx.user.id);
    const items = Array.isArray(profile?.inventory) ? profile.inventory : [];
    return createApiEnvelope({ items }, request.id);
  });

  typedFastify.post("/use-item", {
    schema: {
      body: z.object({
        sessionId: z.string(),
        itemId: z.string()
      })
    }
  }, async (request) => {
    const ctx = await getContext(request);
    if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED" } }, request.id);

    const { itemId } = request.body;
    const address = ctx.session.address;
    const profile = await userRepo.getUserProfile(ctx.user.id);
    const items = Array.isArray(profile?.inventory) ? [...profile.inventory] : [];
    const idx = items.findIndex((i: any) => i.id === itemId);

    if (idx < 0) return createApiEnvelope({ error: { message: "Item not found in inventory" } }, request.id);

    const [item] = items.splice(idx, 1);
    await userRepo.saveUserProfile(ctx.user.id, { inventory: items });

    await opsRepo.logEvent({
      channel: "inventory",
      severity: "info",
      source: "me_api",
      kind: "item_used",
      userId: ctx.user.id,
      address,
      message: `User used item ${item.label || itemId}`,
      meta: { item }
    });

    return createApiEnvelope({ success: true, message: `已使用 ${item.label || itemId}` }, request.id);
  });
}
