// apps/api/src/routes/v1/inventory.ts
// Read the user's persisted inventory and activate items.

import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope, ITEM_DROP_TABLES, RARITY_NAMES, type ItemDefinition, type Rarity } from "@repo/shared";
import { SessionRepository, OpsRepository } from "@repo/infrastructure";
import { gameSettlement } from "../../utils/game-settlement.js";
import { loadInventoryState, useItem, rollbackUseItem } from "../../utils/inventory.js";

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

  const getContext = async (req: any) => {
    const sessionId = req.headers["x-session-id"] || req.query?.sessionId || req.body?.sessionId;
    if (!sessionId) return null;
    const session = await sessionRepo.getSessionById(String(sessionId));
    if (!session || session.status !== "authorized") return null;
    if (!session.userId || !session.address) return null;
    return { userId: String(session.userId), address: String(session.address).toLowerCase() };
  };

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

      let newBalance: string | null = null;
      if (outcome.currencyGranted && outcome.currencyGranted > 0) {
        try {
          const current = parseFloat(await gameSettlement.getBalance(ctx.address, "zhixi")) || 0;
          const updated = (current + outcome.currencyGranted).toString();
          await gameSettlement.setBalance(ctx.address, "zhixi", updated);
          newBalance = updated;
        } catch (err: any) {
          // Crediting the wallet failed after the item was already consumed.
          // Restore the pre-use snapshot so the user does not permanently lose
          // the item for a credit that never landed.
          try {
            await rollbackUseItem(ctx.userId, outcome.preUseState);
          } catch (rollbackErr: any) {
            await opsRepo.logEvent({
              channel: "rewards",
              severity: "error",
              source: "inventory",
              kind: "item_use_rollback_failed",
              userId: ctx.userId,
              address: ctx.address,
              message: `Failed to restore item ${itemId} after credit failure: ${rollbackErr?.message || "unknown"}`,
              meta: { itemId, creditError: err?.message || String(err) },
            });
          }
          await opsRepo.logEvent({
            channel: "rewards",
            severity: "error",
            source: "inventory",
            kind: "item_use_credit_failed",
            userId: ctx.userId,
            address: ctx.address,
            message: `Credit for item ${itemId} failed; inventory restored`,
            meta: {
              itemId,
              amount: outcome.currencyGranted,
              error: err?.message || String(err),
            },
          });
          return createApiEnvelope(
            { success: false },
            request.id,
            false,
            "CREDIT_FAILED",
          );
        }
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
}
