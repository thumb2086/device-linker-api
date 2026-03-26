import { RewardGrant, RewardGrantSchema, MarketOrder, MarketOrderSchema, SupportTicket, SupportTicketSchema, MARKET_SYMBOLS } from "@repo/shared";

export class MetaManager {
  // ... existing methods ...

  calculatePrice(symbol: keyof typeof MARKET_SYMBOLS, tick: number): number {
    const meta = MARKET_SYMBOLS[symbol];
    const trend = Math.sin(tick / 10 + meta.phase);
    return meta.basePrice * (1 + trend * meta.volatility);
  }

  grantReward(userId: string, rewardId: string, type: RewardGrant["type"], source: string, expiresAt?: Date): RewardGrant {
    return RewardGrantSchema.parse({
      id: crypto.randomUUID(),
      userId,
      rewardId,
      type,
      source,
      expiresAt: expiresAt || null,
      createdAt: new Date(),
    });
  }

  createMarketOrder(userId: string, itemId: string, quantity: number, price: string): MarketOrder {
    const total = (parseFloat(price) * quantity).toString();
    return MarketOrderSchema.parse({
      id: crypto.randomUUID(),
      userId,
      itemId,
      quantity,
      price,
      total,
      status: "pending",
      createdAt: new Date(),
    });
  }

  createSupportTicket(userId: string, subject: string, content: string): SupportTicket {
    const now = new Date();
    return SupportTicketSchema.parse({
      id: crypto.randomUUID(),
      userId,
      subject,
      content,
      status: "open",
      createdAt: now,
      updatedAt: now,
    });
  }
}
