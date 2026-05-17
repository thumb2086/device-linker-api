import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope } from "@repo/shared";
import { SessionRepository, UserRepository, OpsRepository, kv } from "@repo/infrastructure";
import { gameSettlement } from "../../utils/game-settlement.js";
import { getSessionContext } from "../../utils/auth.js";
import { loadInventoryState, persistInventoryState, ALL_ITEMS, grantBundleToUser } from "../../utils/inventory.js";

export async function giftRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const sessionRepo = new SessionRepository();
  const userRepo = new UserRepository();
  const opsRepo = new OpsRepository();

  const getContext = (req: any) => getSessionContext(req, sessionRepo);

  typedFastify.post("/send", {
    schema: {
      body: z.object({
        sessionId: z.string(),
        toAddress: z.string(),
        zxc: z.number().min(0).optional(),
        itemId: z.string().optional(),
        quantity: z.number().int().min(1).max(9999).optional().default(1),
        note: z.string().max(240).optional(),
      }),
    },
  }, async (request) => {
    const ctx = await getContext(request);
    if (!ctx) return createApiEnvelope({ error: { code: "UNAUTHORIZED" } }, request.id);

    const body = request.body as any;
    const toAddr = body.toAddress.toLowerCase().trim();
    const fromAddr = ctx.address.toLowerCase();
    const sender = await userRepo.getUserById(ctx.userId);
    const senderName = sender?.displayName || fromAddr.slice(0, 6);

    if (toAddr === fromAddr) {
      return createApiEnvelope({ error: { message: "不能贈送給自己" } }, request.id);
    }

    const recipient = await userRepo.getUserByAddress(toAddr);
    if (!recipient) {
      return createApiEnvelope({ error: { message: "接收者不存在" } }, request.id);
    }

    const hasZxc = typeof body.zxc === "number" && body.zxc > 0;
    const hasItem = body.itemId && String(body.itemId).trim();

    if (!hasZxc && !hasItem) {
      return createApiEnvelope({ error: { message: "請至少贈送 ZXC 或道具" } }, request.id);
    }

    const bundleSummary: string[] = [];

    if (hasZxc) {
      const senderBalance = await gameSettlement.getBalance(fromAddr, "zhixi");
      if (Number(senderBalance) < body.zxc) {
        return createApiEnvelope({ error: { message: `ZXC 餘額不足，目前 ${Number(senderBalance).toLocaleString()}` } }, request.id);
      }
      const newSender = (Number(senderBalance) - body.zxc).toFixed(4);
      await gameSettlement.setBalance(fromAddr, "zhixi", newSender);

      const recipientBalance = await gameSettlement.getBalance(toAddr, "zhixi");
      const newRecipient = (Number(recipientBalance) + body.zxc).toFixed(4);
      await gameSettlement.setBalance(toAddr, "zhixi", newRecipient);

      bundleSummary.push(`${body.zxc.toLocaleString()} ZXC`);
    }

    if (hasItem) {
      const itemId = String(body.itemId).trim();
      const qty = Math.max(1, Math.floor(Number(body.quantity) || 1));
      const def = ALL_ITEMS[itemId];

      if (def?.type === "avatar" || def?.type === "title" || itemId.startsWith("token_yjc")) {
        return createApiEnvelope({ error: { message: "頭像、稱號、YJC 無法贈送" } }, request.id);
      }

      const state = await loadInventoryState(ctx.userId);
      const owned = state.inventory[itemId] || 0;
      if (owned < qty) {
        return createApiEnvelope({ error: { message: `道具 ${def?.name || itemId} 數量不足，持有 ${owned} 個` } }, request.id);
      }

      const nextState = { ...state, inventory: { ...state.inventory } };
      nextState.inventory[itemId] = owned - qty;
      if (nextState.inventory[itemId] <= 0) delete nextState.inventory[itemId];
      await persistInventoryState(ctx.userId, nextState);

      const defName = def?.name || itemId;
      await grantBundleToUser(recipient.id, { items: [{ id: itemId, qty }] }, toAddr);

      bundleSummary.push(`${defName} ×${qty}`);
    }

    const summary = bundleSummary.join(" + ");

    try {
      const chatMsg = {
        id: crypto.randomUUID(),
        address: "",
        displayName: "🎁 系統",
        text: `🫵 ${senderName} 贈送 ${summary} 給 ${recipient.displayName || toAddr.slice(0, 6)}`,
        createdAt: Date.now(),
      };
      const messages: any[] = await kv.get("chat:global:messages") || [];
      messages.push(chatMsg);
      if (messages.length > 50) messages.shift();
      await kv.set("chat:global:messages", messages);
    } catch {}

    await opsRepo.logEvent({
      channel: "rewards", severity: "info", source: "gift", kind: "user_gift",
      userId: ctx.userId, address: fromAddr,
      message: `Gift: ${summary} → ${toAddr}`,
      meta: { toAddress: toAddr, bundle: summary, note: body.note || null },
    });

    return createApiEnvelope({ success: true, bundle: summary }, request.id);
  });
}
