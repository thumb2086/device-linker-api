// apps/api/src/routes/v1/chests-simple.ts
// Chest endpoints: opens Brawl-Stars-style chests, persists drops to the
// user's inventory, and tracks pity progression. Non-mock implementation.

import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  createApiEnvelope,
  CHEST_CONFIGS,
  RARITY_NAMES,
  ITEM_DROP_TABLES,
  DAILY_FREE_CHEST_TYPE,
  DAILY_FREE_CHEST_COOLDOWN_HOURS,
  MAX_INVENTORY_SLOTS,
  type ChestType,
  type Rarity,
} from "@repo/shared";
import { SessionRepository, OpsRepository, kv } from "@repo/infrastructure";
import { gameSettlement } from "../../utils/game-settlement.js";
import {
  isDailyFreeChestReady,
  loadInventoryState,
  markDailyFreeChestClaimed,
  openChestForUser,
  restoreDailyFreeChestMark,
} from "../../utils/inventory.js";

const CHEST_TYPE_ENUM = z.enum(["common", "rare", "epic", "legendary"]);

function countInventorySlots(inventory: Record<string, number>): number {
  return Object.keys(inventory).length;
}

export async function chestRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const sessionRepo = new SessionRepository();
  const opsRepo = new OpsRepository();

  const getContext = async (req: any) => {
    const sessionId = req.headers["x-session-id"] || req.query?.sessionId || req.body?.sessionId;
    if (!sessionId) return null;
    const session = await sessionRepo.getSessionById(String(sessionId));
    if (!session || session.status !== "authorized") return null;
    if (!session.userId || !session.address) return null;
    return { sessionId: String(sessionId), userId: String(session.userId), address: String(session.address).toLowerCase() };
  };

  // Catalog of chest types with drop-rate breakdown and pity rules
  typedFastify.get("/", async (request: any) => {
    const chests = Object.values(CHEST_CONFIGS).map((config) => {
      const weights = config.weights;
      const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
      const rarities = (Object.keys(weights) as Rarity[])
        .filter((r) => weights[r] > 0)
        .map((rarity) => ({
          rarity,
          name: RARITY_NAMES[rarity].name,
          color: RARITY_NAMES[rarity].color,
          chance: Math.round((weights[rarity] / totalWeight) * 10000) / 100,
        }));

      return {
        id: config.id,
        name: config.name,
        nameEn: config.nameEn,
        price: config.price,
        dropCount: config.dropCount,
        pityThreshold: config.pityThreshold,
        rarities,
      };
    });

    return createApiEnvelope(chests, request.id);
  });

  // Full item catalog (flattened drop table)
  typedFastify.get("/items", async (request) => {
    const allItems = (Object.entries(ITEM_DROP_TABLES) as [Rarity, typeof ITEM_DROP_TABLES[Rarity]][]).flatMap(
      ([rarity, items]) =>
        items.map((item) => ({
          ...item,
          rarity,
          rarityColor: RARITY_NAMES[rarity].color,
          rarityName: RARITY_NAMES[rarity].name,
        })),
    );

    return createApiEnvelope(allItems, request.id);
  });

  // Status: pity progress, daily free chest, balance
  typedFastify.get("/status", async (request) => {
    const ctx = await getContext(request);
    if (!ctx) return createApiEnvelope({ success: false }, request.id, false, "UNAUTHORIZED");

    const [state, balance] = await Promise.all([
      loadInventoryState(ctx.userId),
      gameSettlement.getBalance(ctx.address, "zhixi"),
    ]);

    return createApiEnvelope(
      {
        chestPity: state.chestPity,
        lastFreeChestAt: state.lastFreeChestAt,
        nextFreeChestAvailable: isDailyFreeChestReady(state.lastFreeChestAt),
        dailyFreeChestType: DAILY_FREE_CHEST_TYPE,
        dailyFreeCooldownHours: DAILY_FREE_CHEST_COOLDOWN_HOURS,
        inventorySlotsUsed: countInventorySlots(state.inventory),
        inventorySlotsMax: MAX_INVENTORY_SLOTS,
        balance,
      },
      request.id,
    );
  });

  // Open a chest. For the daily free chest the user must use action="claim_free".
  typedFastify.post(
    "/open",
    {
      schema: {
        body: z.object({
          sessionId: z.string().optional(),
          chestType: CHEST_TYPE_ENUM,
          free: z.boolean().optional().default(false),
        }),
      },
    },
    async (request: any) => {
      const ctx = await getContext(request);
      if (!ctx) return createApiEnvelope({ success: false }, request.id, false, "UNAUTHORIZED");

      const { chestType, free } = request.body as { chestType: ChestType; free?: boolean };
      const config = CHEST_CONFIGS[chestType];

      const state = await loadInventoryState(ctx.userId);
      const balanceBefore = await gameSettlement.getBalance(ctx.address, "zhixi");
      const balanceBeforeNum = parseFloat(balanceBefore) || 0;

      let charged = 0;
      // Atomic claim of the daily free chest cooldown. `kv.claimSlot` uses a
      // single INSERT ... ON CONFLICT DO UPDATE ... WHERE expires_at < NOW()
      // statement so concurrent requests cannot both succeed. We still mirror
      // the claim into the existing `chestMeta.lastFreeChestAt` (used by the
      // status endpoint / UI) after the atomic claim succeeds.
      let previousFreeChestAt: string | null = null;
      let freeMarked = false;
      const freeChestLockKey = `chest:free-lock:${ctx.userId}`;

      if (free) {
        if (chestType !== DAILY_FREE_CHEST_TYPE) {
          return createApiEnvelope(
            { success: false },
            request.id,
            false,
            `每日免費寶箱僅限 ${DAILY_FREE_CHEST_TYPE} 類型`,
          );
        }
        // Cheap pre-check to give a nice 冷卻中 error when we can.
        if (!isDailyFreeChestReady(state.lastFreeChestAt)) {
          return createApiEnvelope(
            { success: false },
            request.id,
            false,
            "每日免費寶箱冷卻中",
          );
        }
        const cooldownSeconds = DAILY_FREE_CHEST_COOLDOWN_HOURS * 60 * 60;
        const claimed = await kv.claimSlot(
          freeChestLockKey,
          cooldownSeconds,
          new Date().toISOString(),
        );
        if (!claimed) {
          return createApiEnvelope(
            { success: false },
            request.id,
            false,
            "每日免費寶箱冷卻中",
          );
        }
        previousFreeChestAt = state.lastFreeChestAt;
        await markDailyFreeChestClaimed(ctx.userId);
        freeMarked = true;
      } else {
        if (balanceBeforeNum < config.price) {
          return createApiEnvelope(
            { success: false },
            request.id,
            false,
            `餘額不足，開啟 ${config.name} 需 ${config.price} ZXC`,
          );
        }
        charged = config.price;
        await gameSettlement.setBalance(ctx.address, "zhixi", (balanceBeforeNum - charged).toString());
      }

      let outcome;
      try {
        outcome = await openChestForUser(ctx.userId, ctx.address, chestType);
      } catch (error: any) {
        if (charged > 0) {
          await gameSettlement.setBalance(ctx.address, "zhixi", balanceBeforeNum.toString());
        }
        if (freeMarked) {
          try {
            await restoreDailyFreeChestMark(ctx.userId, previousFreeChestAt);
            await kv.del(freeChestLockKey);
          } catch (restoreErr: any) {
            await opsRepo.logEvent({
              channel: "rewards",
              severity: "error",
              source: "chests",
              kind: "free_chest_rollback_failed",
              userId: ctx.userId,
              address: ctx.address,
              message: `Failed to restore free-chest cooldown: ${restoreErr?.message || "unknown"}`,
            });
          }
        }
        return createApiEnvelope(
          { success: false },
          request.id,
          false,
          error?.message || "CHEST_OPEN_FAILED",
        );
      }

      const balanceAfter = await gameSettlement.getBalance(ctx.address, "zhixi");

      await opsRepo.logEvent({
        channel: "rewards",
        severity: "info",
        source: "chests",
        kind: "chest_opened",
        userId: ctx.userId,
        address: ctx.address,
        message: `Opened ${chestType} chest`,
        meta: {
          chestType,
          free: Boolean(free),
          charged,
          drops: outcome.result.items.map((i) => i.item.id),
          isPityTrigger: outcome.result.isPityTrigger,
        },
      });

      return createApiEnvelope(
        {
          success: true,
          chestType,
          price: config.price,
          charged,
          balanceBefore,
          balanceAfter,
          items: outcome.result.items.map((drop) => ({
            item: drop.item,
            isNew: drop.isNew,
            quantity: drop.quantity,
          })),
          isPityTrigger: outcome.result.isPityTrigger,
          pityCount: outcome.state.chestPity[chestType],
          totalValue: outcome.result.totalValue,
          inventoryCount: countInventorySlots(outcome.state.inventory),
        },
        request.id,
      );
    },
  );
}
