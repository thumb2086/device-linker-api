// apps/api/src/routes/v1/me.ts

import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope } from "@repo/shared";
import { IdentityManager, RewardManager, VipManager } from "@repo/domain";
import { SessionRepository, UserRepository, kv, OpsRepository } from "@repo/infrastructure";

export async function meRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  
  const identityManager = new IdentityManager();
  const rewardManager = new RewardManager();
  const vipManager = new VipManager();
  
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

  // ─── User Profile (Comprehensive) ────────────────────────────────────────

  typedFastify.get("/profile", async (request) => {
    const ctx = await getContext(request);
    if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED" } }, request.id);

    const address = ctx.session.address;
    const totalBet = await kv.get<string>(`total_bet:${address}`) || "0";
    const vip = await vipManager.getVipStatus(address);
    
    const activeTitleId = await kv.get<string>(`active_title:${address}`) || "newbie";
    const activeAvatarId = await kv.get<string>(`active_avatar:${address}`) || "classic_chip";

    const title = rewardManager.getAvailableTitles().find(t => t.id === activeTitleId);
    const avatar = rewardManager.getAvailableAvatars().find(a => a.id === activeAvatarId);

    return createApiEnvelope({
       profile: {
         id: ctx.user.id,
         address,
         displayName: ctx.user.displayName || (ctx.session.accountId ? `@${ctx.session.accountId}` : address.slice(0, 6) + "..." + address.slice(-4)),
         totalBet,
         vipLevel: vip?.level?.label || "普通會員",
         maxBet: Number(vip?.level?.maxBet || 1000),
         title: title?.label || "新手",
         // Avatars are emoji-first now; fall back to url if provided for legacy entries.
         avatar: (avatar as any)?.icon || avatar?.url || "🪙",
         avatarId: activeAvatarId,
         titleId: activeTitleId,
         mode: ctx.session.mode,
         createdAt: ctx.user.createdAt
       }
    }, request.id);
  });

  // ─── Inventory Management ────────────────────────────────────────────────

  typedFastify.get("/inventory", async (request) => {
    const ctx = await getContext(request);
    if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED" } }, request.id);

    const address = ctx.session.address;
    const items = await kv.get<any[]>(`inventory:${address}`) || [];
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
    
    const items = await kv.get<any[]>(`inventory:${address}`) || [];
    const idx = items.findIndex(i => i.id === itemId);
    
    if (idx < 0) return createApiEnvelope({ error: { message: "Item not found in inventory" } }, request.id);

    // Consume item
    const [item] = items.splice(idx, 1);
    await kv.set(`inventory:${address}`, items);

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
