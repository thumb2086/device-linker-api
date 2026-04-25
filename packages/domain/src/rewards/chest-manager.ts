// Chest Manager - Brawl Stars Style Loot Box System

import {
  Rarity,
  ItemType,
  ChestType,
  ChestConfig,
  ItemDefinition,
  CHEST_CONFIGS,
  ITEM_DROP_TABLES,
} from "@repo/shared";

export interface ChestOpenResult {
  items: ItemReward[];
  isPityTrigger: boolean;
  pityCount: number;
  totalValue: number;
}

export interface ItemReward {
  item: ItemDefinition;
  isNew: boolean;
  quantity: number;
}

export interface UserInventory {
  items: Record<string, number>; // itemId -> quantity
  avatars: string[];
  titles: string[];
  activeAvatar: string;
  activeTitle: string;
  chestPity: Record<ChestType, number>; // chestType -> consecutive opens without guaranteed rarity
}

export class ChestManager {
  private fnv1a32(input: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
  }

  private pickWeightedRarity(
    chestType: ChestType,
    seed: string,
    forceGuaranteed: boolean
  ): Rarity {
    const config = CHEST_CONFIGS[chestType];
    
    // If pity threshold reached or forced, return guaranteed rarity
    if (forceGuaranteed && config.guaranteedRarity) {
      return config.guaranteedRarity;
    }

    const hash = this.fnv1a32(seed);
    const weights: Record<Rarity, number> = config.weights;
    const totalWeight = Object.values(weights).reduce((a, b) => (a as number) + (b as number), 0) as number;
    
    let random = hash % totalWeight;
    const rarities: Rarity[] = ["common", "rare", "epic", "legendary", "mythic"];
    
    for (const rarity of rarities) {
      random -= weights[rarity];
      if (random < 0) {
        return rarity;
      }
    }
    
    return "common";
  }

  private pickItemFromRarity(rarity: Rarity, seed: string): ItemDefinition {
    const items = ITEM_DROP_TABLES[rarity];
    const hash = this.fnv1a32(seed + rarity);
    const index = hash % items.length;
    return items[index];
  }

  private generateSeed(userId: string, chestType: ChestType, timestamp: number): string {
    return `${userId}:${chestType}:${timestamp}:${Math.random()}`;
  }

  openChest(
    userId: string,
    chestType: ChestType,
    inventory: UserInventory
  ): ChestOpenResult {
    const config = CHEST_CONFIGS[chestType];
    const timestamp = Date.now();
    
    // Get current pity count
    const currentPity = inventory.chestPity[chestType] || 0;
    const isPityTrigger = currentPity >= config.pityThreshold - 1;
    
    // Determine drop count
    const seed1 = this.generateSeed(userId, chestType, timestamp);
    const hash1 = this.fnv1a32(seed1);
    const dropCountRange = config.dropCount.max - config.dropCount.min + 1;
    const dropCount = config.dropCount.min + (hash1 % dropCountRange);
    
    // Generate drops
    const items: ItemReward[] = [];
    const newInventory = { ...inventory };
    let totalValue = 0;
    
    for (let i = 0; i < dropCount; i++) {
      const seed = this.generateSeed(userId, chestType, timestamp + i);
      
      // First item in pity trigger is guaranteed rarity
      const forceGuaranteed = isPityTrigger && i === 0;
      
      const rarity = this.pickWeightedRarity(chestType, seed, forceGuaranteed);
      const item = this.pickItemFromRarity(rarity, seed + "item");
      
      // Check if this is a new item for the user
      const isNew = !inventory.items[item.id] || inventory.items[item.id] === 0;
      
      // Update inventory
      if (!newInventory.items[item.id]) {
        newInventory.items[item.id] = 0;
      }
      newInventory.items[item.id]++;
      
      // Handle special item types
      if (item.type === "avatar" && !newInventory.avatars.includes(item.id)) {
        newInventory.avatars.push(item.id);
      }
      if (item.type === "title" && !newInventory.titles.includes(item.id)) {
        newInventory.titles.push(item.id);
      }
      
      // Calculate value
      if (item.effect && item.effect.type === "currency") {
        totalValue += item.effect.value;
      }
      
      items.push({
        item,
        isNew,
        quantity: 1,
      });
    }
    
    // Update pity counter
    if (isPityTrigger) {
      newInventory.chestPity[chestType] = 0;
    } else {
      newInventory.chestPity[chestType] = currentPity + 1;
    }
    
    return {
      items,
      isPityTrigger,
      pityCount: isPityTrigger ? config.pityThreshold : currentPity + 1,
      totalValue,
    };
  }

  getChestPrice(chestType: ChestType): number {
    return CHEST_CONFIGS[chestType].price;
  }

  getAvailableChests(): ChestConfig[] {
    return Object.values(CHEST_CONFIGS);
  }

  canOpenDailyFreeChest(lastFreeChestAt: Date | null): boolean {
    if (!lastFreeChestAt) return true;
    
    const now = new Date();
    const hoursSinceLast = (now.getTime() - lastFreeChestAt.getTime()) / (1000 * 60 * 60);
    
    return hoursSinceLast >= 24;
  }

  getNextFreeChestTime(lastFreeChestAt: Date | null): Date | null {
    if (!lastFreeChestAt) return null;
    
    const nextTime = new Date(lastFreeChestAt.getTime() + 24 * 60 * 60 * 1000);
    return nextTime;
  }

  // Calculate pity progress percentage
  getPityProgress(chestType: ChestType, currentPity: number): number {
    const config = CHEST_CONFIGS[chestType];
    return Math.min(100, (currentPity / config.pityThreshold) * 100);
  }

  // Get all items that can drop from a chest type
  getPossibleDrops(chestType: ChestType): { rarity: Rarity; items: ItemDefinition[]; chance: number }[] {
    const config = CHEST_CONFIGS[chestType];
    const totalWeight = Object.values(config.weights).reduce((a, b) => (a as number) + (b as number), 0) as number;
    
    const rarities: Rarity[] = ["common", "rare", "epic", "legendary", "mythic"];
    
    return rarities
      .filter(r => config.weights[r] > 0)
      .map(rarity => ({
        rarity,
        items: ITEM_DROP_TABLES[rarity],
        chance: (config.weights[rarity] / totalWeight) * 100,
      }));
  }
}

export const chestManager = new ChestManager();
