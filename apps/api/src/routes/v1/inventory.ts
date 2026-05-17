// apps/api/src/routes/v1/inventory.ts
// Read the user's persisted inventory and activate items.

import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope, ITEM_DROP_TABLES, RARITY_NAMES, type ItemDefinition, type Rarity } from "@repo/shared";
import { SessionRepository, OpsRepository, RewardCatalogRepository, kv } from "@repo/infrastructure";
import { gameSettlement } from "../../utils/game-settlement.js";
import { getSessionContext } from "../../utils/auth.js";
import { loadInventoryState, useItem, creditItemValue, grantBundleToUser } from "../../utils/inventory.js";

function buildItemIndex(): Record<string, ItemDefinition & { rarity: Rarity }> {
  const out: Record<string, ItemDefinition & { rarity: Rarity }> = {};
  for (const rarity of Object.keys(ITEM_DROP_TABLES) as Rarity[]) {
    for (const item of ITEM_DROP_TABLES[rarity]) {
      out[item.id] = { ...item, rarity };
    }
  }
  return out;
}

const ITEM_INDEX = buildItemIndex();

export async function inventoryRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const sessionRepo = new SessionRepository();
  const opsRepo = new OpsRepository();
  const rewardCatalogRepo = new RewardCatalogRepository();

  const getContext = (req: any) => getSessionContext(req, sessionRepo);

  typedFastify.get("/", async (request: any) => {
    const ctx = await getContext(request);
    if (!ctx) return createApiEnvelope({ success: false }, request.id, false, "UNAUTHORIZED");

    const state = await loadInventoryState(ctx.userId);

    const items = Object.entries(state.inventory)
      .filter(([, qty]) => qty > 0)
      .map(([itemId, quantity]) => {
        const def = ITEM_INDEX[itemId];
        if (!def) {
          return { id: itemId, name: itemId, type: "unknown", rarity: "common", quantity, icon: "❓" };
        }
        return {
          ...def,
          quantity,
          rarityColor: RARITY_NAMES[def.rarity].color,
          rarityName: RARITY_NAMES[def.rarity].name,
        };
      });

    return createApiEnvelope(
      {
        items,
        ownedAvatars: state.ownedAvatars,
        ownedTitles: state.ownedTitles,
        activeAvatar: state.activeAvatar,
        activeTitle: state.activeTitle,
        activeBuffs: state.activeBuffs,
      },
      request.id,
    );
  });

  typedFastify.post(
    "/use",
    {
      schema: {
        body: z.object({
          sessionId: z.string().optional(),
          itemId: z.string(),
        }),
      },
    },
    async (request: any) => {
      const ctx = await getContext(request);
      if (!ctx) return createApiEnvelope({ success: false }, request.id, false, "UNAUTHORIZED");

      const { itemId } = request.body as { itemId: string };

      let outcome;
      try {
        outcome = await useItem(ctx.userId, itemId);
      } catch (error: any) {
        return createApiEnvelope(
          { success: false },
          request.id,
          false,
          error?.message || "USE_ITEM_FAILED",
        );
      }

      if (outcome.item.type === "avatar" || outcome.item.type === "title") {
        const key = outcome.item.type === "title" ? `active_title:${ctx.address}` : `active_avatar:${ctx.address}`;
        await kv.set(key, outcome.item.id).catch(() => {});
      }

      let newBalance: string | null = null;
      try {
        newBalance = await creditItemValue(ctx.userId, ctx.address, outcome, opsRepo);
      } catch (err: any) {
        return createApiEnvelope(
          { success: false },
          request.id,
          false,
          "CREDIT_FAILED",
        );
      }

      await opsRepo.logEvent({
        channel: "rewards",
        severity: "info",
        source: "inventory",
        kind: "item_used",
        userId: ctx.userId,
        address: ctx.address,
        message: `Used item ${itemId}`,
        meta: {
          itemId,
          type: outcome.item.type,
          currencyGranted: outcome.currencyGranted || 0,
          buffActivated: outcome.buffActivated || null,
        },
      });

      return createApiEnvelope(
        {
          success: true,
          item: outcome.item,
          effectSummary: outcome.effectSummary,
          currencyGranted: outcome.currencyGranted || 0,
          buffActivated: outcome.buffActivated || null,
          balance: newBalance,
          activeBuffs: outcome.state.activeBuffs,
          activeAvatar: outcome.state.activeAvatar,
          activeTitle: outcome.state.activeTitle,
          remainingQuantity: outcome.state.inventory[itemId] || 0,
        },
        request.id,
      );
    },
  );

  // ─── Buy item from shop ──────────────────────────────────────────────────

  typedFastify.post(
    "/buy",
    {
      schema: {
        body: z.object({
          sessionId: z.string().optional(),
          itemId: z.string(),
        }),
      },
    },
    async (request: any) => {
      const ctx = await getContext(request);
      if (!ctx) return createApiEnvelope({ success: false }, request.id, false, "UNAUTHORIZED");

      const { itemId } = request.body as { itemId: string };

      const allCatalog = await rewardCatalogRepo.listItems({ includeInactive: false });
      const catalogItem = allCatalog.find(
        (i: any) => i.itemId === itemId && i.source === "shop" && i.isActive !== false,
      );
      if (!catalogItem) {
        return createApiEnvelope({ success: false }, request.id, false, "ITEM_NOT_FOUND");
      }

      const price = Number(catalogItem.price);
      if (!price || price <= 0) {
        return createApiEnvelope({ success: false }, request.id, false, "ITEM_NOT_PURCHASABLE");
      }

      const balanceStr = await gameSettlement.getBalance(ctx.address, "zhixi");
      const balance = parseFloat(balanceStr) || 0;
      if (balance < price) {
        return createApiEnvelope({ success: false }, request.id, false, "INSUFFICIENT_BALANCE");
      }

      await gameSettlement.setBalance(ctx.address, "zhixi", (balance - price).toString());

      const rawMeta = catalogItem.meta as Record<string, any> | undefined;
      const subItems = rawMeta?.bundle as Array<{ id: string; qty?: number }> | undefined;
      const bundle = subItems
        ? { items: subItems.map((i: any) => ({ id: i.id, qty: i.qty || 1 })) }
        : { items: [{ id: itemId, qty: 1 }] };
      try {
        await grantBundleToUser(ctx.userId, bundle, ctx.address);
      } catch (err: any) {
        await gameSettlement.setBalance(ctx.address, "zhixi", balanceStr);
        return createApiEnvelope({ success: false }, request.id, false, "GRANT_FAILED");
      }

      await opsRepo.logEvent({
        channel: "rewards",
        severity: "info",
        source: "inventory",
        kind: "item_purchased",
        userId: ctx.userId,
        address: ctx.address,
        message: `Purchased item ${itemId} for ${price} ZXC`,
        meta: { itemId, price },
      });

      return createApiEnvelope(
        { success: true, itemId, name: catalogItem.name, price, balanceAfter: (balance - price).toString() },
        request.id,
      );
    },
  );
}
