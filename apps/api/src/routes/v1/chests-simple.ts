// apps/api/src/routes/v1/chests-simple.ts
// Chest endpoints: opens Brawl-Stars-style chests, persists drops to the
// user's inventory, and tracks pity progression. Non-mock implementation.

import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope, ITEM_DROP_TABLES, CHEST_CONFIGS, RARITY_NAMES, DAILY_FREE_CHEST_TYPE, DAILY_FREE_CHEST_COOLDOWN_HOURS, MAX_INVENTORY_SLOTS, type ChestType, type Rarity, type ItemDefinition } from "@repo/shared";
import { SessionRepository, OpsRepository, RewardCatalogRepository, kv } from "@repo/infrastructure";
import { gameSettlement } from "../../utils/game-settlement.js";
import { getSessionContext } from "../../utils/auth.js";
import {
  isDailyFreeChestReady,
  loadInventoryState,
  markDailyFreeChestClaimed,
  openChestForUser,
  persistInventoryState,
  restoreDailyFreeChestMark,
} from "../../utils/inventory.js";

const CHEST_TYPE_ENUM = z.enum(["common", "rare", "epic", "legendary"]);

let _catalogRepo: RewardCatalogRepository;
function getCatalogRepo() {
  if (!_catalogRepo) _catalogRepo = new RewardCatalogRepository();
  return _catalogRepo;
}

let _customDropCache: { tables: Record<string, ItemDefinition[]>; ts: number } | null = null;
const CUSTOM_DROP_CACHE_TTL = 120_000; // 2 min

async function buildCustomDropTables(): Promise<Record<string, ItemDefinition[]> | undefined> {
  if (_customDropCache && Date.now() - _customDropCache.ts < CUSTOM_DROP_CACHE_TTL) {
    return _customDropCache.tables;
  }
  const rows = await getCatalogRepo().listItems({ includeInactive: false });
  const userItems = rows.filter((r: any) => r.source === "user" && r.type !== "avatar" && r.type !== "title");
  if (userItems.length === 0) return undefined;
  const tables: Record<string, ItemDefinition[]> = {};
  for (const item of userItems) {
    const r = item.rarity as string;
    if (!["common", "rare", "epic", "legendary", "mythic"].includes(r)) continue;
    if (!tables[r]) tables[r] = [];
    tables[r].push({
      id: item.itemId,
      name: item.name,
      nameEn: item.name,
      type: item.type ?? "collectible",
      rarity: r as any,
      description: item.description ?? "",
      icon: item.icon ?? "📦",
      tradable: false,
      consumable: false,
    });
  }
  _customDropCache = { tables, ts: Date.now() };
  return tables;
}

function countInventorySlots(inventory: Record<string, number>): number {
  return Object.keys(inventory).length;
}

export async function chestRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();
  const sessionRepo = new SessionRepository();
  const opsRepo = new OpsRepository();

  const getContext = (req: any) => getSessionContext(req, sessionRepo);

  // Catalog of chest types with drop-rate breakdown and pity rules
  typedFastify.get("/", async (request: any) => {
    const cacheKey = "chests:catalog";
    const cached = await kv.get<string>(cacheKey);
    if (cached) {
      try { return createApiEnvelope(JSON.parse(cached), request.id); } catch {}
    }

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

    await kv.set(cacheKey, JSON.stringify(chests), { ex: 60 });
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

    const keyCounts: Record<string, number> = {};
    for (const ct of Object.keys(CHEST_CONFIGS) as ChestType[]) {
      keyCounts[ct] = state.inventory[`chest_key_${ct}`] || 0;
    }

    return createApiEnvelope(
      {
        chestPity: state.chestPity,
        keyCounts,
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

// Buy chest keys (consumable inventory item)
typedFastify.post("/buy", {
  schema: {
    body: z.object({
      sessionId: z.string().optional(),
      chestType: CHEST_TYPE_ENUM,
      quantity: z.number().int().min(1).max(99).optional().default(1),
    }),
  },
}, async (request: any) => {
  const ctx = await getContext(request);
  if (!ctx) return createApiEnvelope({ success: false }, request.id, false, "UNAUTHORIZED");

  const { chestType, quantity } = request.body as { chestType: ChestType; quantity: number };
  const config = CHEST_CONFIGS[chestType];
  const basePrice = config.price;

  const discountRate = quantity >= 10 ? 0.10 : quantity >= 5 ? 0.05 : 0;
  const unitPrice = Math.round(basePrice * (1 - discountRate));
  const totalPrice = unitPrice * quantity;

  const state = await loadInventoryState(ctx.userId);
  const balanceBefore = await gameSettlement.getBalance(ctx.address, "zhixi");
  const balanceBeforeNum = parseFloat(balanceBefore) || 0;

  if (balanceBeforeNum < totalPrice) {
    return createApiEnvelope(
      { success: false },
      request.id,
      false,
      `餘額不足，購買 ${quantity} 個 ${config.name} 需 ${totalPrice.toLocaleString()} ZXC`,
    );
  }

  await gameSettlement.setBalance(ctx.address, "zhixi", (balanceBeforeNum - totalPrice).toString());

  const keyId = `chest_key_${chestType}`;
  const nextState = { ...state, inventory: { ...state.inventory } };
  nextState.inventory[keyId] = (nextState.inventory[keyId] || 0) + quantity;
  await persistInventoryState(ctx.userId, nextState);

  return createApiEnvelope({
    success: true,
    chestType,
    quantity,
    unitPrice,
    discount: discountRate,
    totalPrice,
    balanceAfter: (balanceBeforeNum - totalPrice).toString(),
    inventoryCount: Object.keys(nextState.inventory).length,
  }, request.id);
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

      let keyId: string | null = null;
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
        keyId = `chest_key_${chestType}`;
        const keyCount = state.inventory[keyId] || 0;
        if (keyCount <= 0) {
          return createApiEnvelope(
            { success: false },
            request.id,
            false,
            `沒有 ${config.name} 鑰匙，請先到商店購買`,
          );
        }
        state.inventory[keyId] = keyCount - 1;
        if (state.inventory[keyId] <= 0) delete state.inventory[keyId];
        await persistInventoryState(ctx.userId, state);
      }

      let outcome;
      try {
        const customTables = await buildCustomDropTables();
        outcome = await openChestForUser(ctx.userId, ctx.address, chestType, customTables);
        if (outcome.compensationZXC > 0) {
          const bal = await gameSettlement.getBalance(ctx.address, "zhixi");
          await gameSettlement.setBalance(ctx.address, "zhixi", (Number(bal) + outcome.compensationZXC).toString());
        }
      } catch (error: any) {
        if (keyId) {
          state.inventory[keyId] = (state.inventory[keyId] || 0) + 1;
          await persistInventoryState(ctx.userId, state);
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
          keyUsed: keyId,
          drops: outcome.result.items.map((i: any) => i.item.id),
          isPityTrigger: outcome.result.isPityTrigger,
        },
      });

      const newKeyCounts: Record<string, number> = {};
      for (const ct of Object.keys(CHEST_CONFIGS) as ChestType[]) {
        newKeyCounts[ct] = outcome.state.inventory[`chest_key_${ct}`] || 0;
      }

      return createApiEnvelope(
        {
          success: true,
          chestType,
          price: config.price,
          keyUsed: keyId,
          items: outcome.result.items.map((drop: any) => ({
            item: drop.item,
            isNew: drop.isNew,
            quantity: drop.quantity,
          })),
          isPityTrigger: outcome.result.isPityTrigger,
          pityCount: outcome.state.chestPity[chestType],
          keyCounts: newKeyCounts,
          totalValue: outcome.result.totalValue,
          compensationZXC: outcome.compensationZXC,
          inventoryCount: countInventorySlots(outcome.state.inventory),
        },
        request.id,
      );
    },
  );

// Bulk open chests
typedFastify.post("/open-bulk", {
  schema: {
    body: z.object({
      sessionId: z.string().optional(),
      chestType: CHEST_TYPE_ENUM,
      quantity: z.number().int().min(1).max(99),
    }),
  },
}, async (request: any) => {
  const ctx = await getContext(request);
  if (!ctx) return createApiEnvelope({ success: false }, request.id, false, "UNAUTHORIZED");

  const { chestType, quantity } = request.body as { chestType: ChestType; quantity: number };
  const config = CHEST_CONFIGS[chestType];
  const keyId = `chest_key_${chestType}`;
  let state = await loadInventoryState(ctx.userId);
  const keyCount = state.inventory[keyId] || 0;
  if (keyCount < quantity) {
    return createApiEnvelope({ success: false }, request.id, false, `鑰匙不足，需要 ${quantity} 把，目前 ${keyCount} 把`);
  }

  const allItems: any[] = [];
  let totalComp = 0;
  let totalValue = 0;
  let finalPity = 0;
  const customTables = await buildCustomDropTables();

  for (let i = 0; i < quantity; i++) {
    state.inventory[keyId] = (state.inventory[keyId] || 0) - 1;
    if (state.inventory[keyId] <= 0) delete state.inventory[keyId];
    await persistInventoryState(ctx.userId, state);

    let outcome;
    try {
      outcome = await openChestForUser(ctx.userId, ctx.address, chestType, customTables);
    } catch (error: any) {
      state.inventory[keyId] = (state.inventory[keyId] || 0) + 1;
      await persistInventoryState(ctx.userId, state);
      return createApiEnvelope({ success: false }, request.id, false, error?.message || "CHEST_OPEN_FAILED");
    }

    for (const drop of outcome.result.items) {
      const existing = allItems.find((x) => x.item.id === drop.item.id);
      if (existing) {
        existing.quantity += drop.quantity;
      } else {
        allItems.push({ item: drop.item, isNew: drop.isNew, quantity: drop.quantity });
      }
    }
    totalComp += outcome.compensationZXC;
    totalValue += outcome.result.totalValue;
    finalPity = outcome.state.chestPity[chestType];
    state = outcome.state;
  }

  if (totalComp > 0) {
    const bal = await gameSettlement.getBalance(ctx.address, "zhixi");
    await gameSettlement.setBalance(ctx.address, "zhixi", (Number(bal) + totalComp).toString());
  }

  const newKeyCounts: Record<string, number> = {};
  for (const ct of Object.keys(CHEST_CONFIGS) as ChestType[]) {
    newKeyCounts[ct] = state.inventory[`chest_key_${ct}`] || 0;
  }

  await opsRepo.logEvent({
    channel: "rewards",
    severity: "info",
    source: "chests",
    kind: "chests_opened_bulk",
    userId: ctx.userId,
    address: ctx.address,
    message: `Opened ${quantity} x ${chestType} chests`,
    meta: { chestType, quantity, drops: allItems.map((i) => i.item.id) },
  });

  return createApiEnvelope({
    success: true,
    chestType,
    quantity,
    items: allItems,
    compensationZXC: totalComp,
    totalValue,
    pityCount: finalPity,
    keyCounts: newKeyCounts,
    inventoryCount: countInventorySlots(state.inventory),
  }, request.id);
});

}
