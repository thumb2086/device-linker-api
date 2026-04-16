// Chest Routes - Simplified Version

import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createApiEnvelope, CHEST_CONFIGS, RARITY_NAMES, ITEM_DROP_TABLES } from "@repo/shared";

export async function chestRoutes(fastify: FastifyInstance) {
  const typedFastify = fastify.withTypeProvider<ZodTypeProvider>();

  // Get available chests
  typedFastify.get("/chests", async (request: any) => {
    const chests = Object.values(CHEST_CONFIGS).map((config: any) => {
      const weights = config.weights as Record<string, number>;
      const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
      const rarities = ["common", "rare", "epic", "legendary", "mythic"]
        .filter((r) => weights[r] > 0)
        .map((rarity) => ({
          rarity,
          name: (RARITY_NAMES as any)[rarity].name,
          color: (RARITY_NAMES as any)[rarity].color,
          chance: Math.round((weights[rarity] / totalWeight) * 100 * 100) / 100,
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

  // Get all possible items
  typedFastify.get("/chests/items", async (request) => {
    const allItems = Object.entries(ITEM_DROP_TABLES).flatMap(([rarity, items]: [string, any]) =>
      items.map((item: any) => ({
        ...item,
        rarity,
        rarityColor: (RARITY_NAMES as any)[rarity as any].color,
        rarityName: (RARITY_NAMES as any)[rarity as any].name,
      }))
    );

    return createApiEnvelope(allItems, (request as any).id);
  });

  // Mock open chest endpoint (returns simulated drops)
  typedFastify.post("/chests/open", {
    schema: {
      body: z.object({
        chestType: z.enum(["common", "rare", "epic", "legendary"]),
      }),
    },
  }, async (request: any) => {
    const { chestType } = request.body;
    const config = (CHEST_CONFIGS as any)[chestType];
    
    // Simulate drops
    const dropCount = config.dropCount.min + Math.floor(Math.random() * (config.dropCount.max - config.dropCount.min + 1));
    const items = [];
    
    for (let i = 0; i < dropCount; i++) {
      // Simple random rarity selection based on weights
      const chestWeights = config.weights as Record<string, number>;
      const totalWeight = Object.values(chestWeights).reduce((a, b) => a + b, 0);
      let random = Math.random() * totalWeight;
      let selectedRarity = "common";
      
      for (const rarity of ["common", "rare", "epic", "legendary", "mythic"]) {
        random -= config.weights[rarity];
        if (random <= 0) {
          selectedRarity = rarity;
          break;
        }
      }
      
      const rarityItems = (ITEM_DROP_TABLES as any)[selectedRarity];
      const item = rarityItems[Math.floor(Math.random() * rarityItems.length)];
      
      items.push({
        item: {
          id: item.id,
          name: item.name,
          nameEn: item.nameEn,
          type: item.type,
          rarity: selectedRarity,
          description: item.description,
          icon: item.icon,
        },
        isNew: Math.random() > 0.5,
        quantity: 1,
      });
    }

    return createApiEnvelope({
      items,
      isPityTrigger: false,
      pityCount: Math.floor(Math.random() * config.pityThreshold),
      totalValue: items.reduce((sum: number, i: any) => {
        if (i.item.effect?.type === "currency") {
          return sum + (i.item.effect.value || 0);
        }
        return sum;
      }, 0),
    }, request.id);
  });
}
