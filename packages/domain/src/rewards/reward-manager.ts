import { User, WalletAccount, RewardGrant, MarketOrder, SupportTicket, MARKET_SYMBOLS, VIP_LEVELS } from "@repo/shared";

export class RewardManager {
  activateBuff(inventory: Record<string, number>, itemId: string): { updatedInventory: Record<string, number>; buff: any } {
    const qty = inventory[itemId] || 0;
    if (qty <= 0) throw new Error("Item not in inventory");

    const updatedInventory = { ...inventory };
    if (qty === 1) {
      delete updatedInventory[itemId];
    } else {
      updatedInventory[itemId] = qty - 1;
    }

    // Simplified buff mapping
    const buff = {
      id: crypto.randomUUID(),
      itemId,
      active: true,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 mins
    };

    return { updatedInventory, buff };
  }

  grantReward(userId: string, rewardId: string, type: "title" | "avatar" | "item"): RewardGrant {
    return {
      id: crypto.randomUUID(),
      userId,
      rewardId,
      type,
      source: "system",
      expiresAt: null,
      createdAt: new Date(),
    };
  }
}
