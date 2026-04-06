// packages/domain/src/levels/vip-manager.ts
import { eq, and } from "drizzle-orm";
import { LEVEL_TIERS, LevelTier, YJC_VIP_TIERS, YjcVipTier } from "@repo/shared";
import * as schema from "@repo/infrastructure/db/schema.js";
import { requireDb } from "@repo/infrastructure/db/index.js";

export interface VipFullStatus {
  address: string;
  score: number;         // VIP score = weighted combination of total_bets + YJC holdings
  totalBetAll: number;   // Total site bets
  yjcBalance: number;    // YJC token balance
  level: LevelTier;
  nextLevel: LevelTier | null;
  progressPct: number;   // Progress to next level 0-100
  yjcVipTier: YjcVipTier; // YJC VIP tier (separate from level)
  privileges: {
    dailyBonusMultiplier: number;
    marketFeeDiscount: number;
    danmakuColor: string;
    danmakuPriority: number;
  };
}

export class VipManager {
  // Helper to get DB connection lazily
  private async getDb() {
    return await requireDb();
  }

  // Get VIP tier by total bet amount
  private getVipTierByScore(score: number): LevelTier {
    // Find from highest to lowest threshold
    for (let i = LEVEL_TIERS.length - 1; i >= 0; i--) {
      if (score >= LEVEL_TIERS[i].threshold) {
        return LEVEL_TIERS[i];
      }
    }
    return LEVEL_TIERS[0];
  }

  // Get next level
  private getNextLevel(currentLevel: LevelTier): LevelTier | null {
    const currentIndex = LEVEL_TIERS.findIndex((t) => t.label === currentLevel.label);
    return LEVEL_TIERS[currentIndex + 1] ?? null;
  }

  // Get VIP status for address
  async getVipStatus(address: string): Promise<VipFullStatus | null> {
    const addr = address.toLowerCase();
    const db = await this.getDb();

    // 1. Get total bets for 'all' period
    const betRow = await db
      .select({ amount: schema.totalBets.amount })
      .from(schema.totalBets)
      .where(
        and(
          eq(schema.totalBets.periodType, "all"),
          eq(schema.totalBets.periodId, ""),
          eq(schema.totalBets.address, addr)
        )
      )
      .limit(1);

    const totalBetAll = Number(betRow[0]?.amount ?? 0);

    // 2. Get YJC token balance
    const yjcRow = await db
      .select({ balance: schema.walletAccounts.balance })
      .from(schema.walletAccounts)
      .where(
        and(
          eq(schema.walletAccounts.address, addr),
          eq(schema.walletAccounts.token, "yjc")
        )
      )
      .limit(1);

    const yjcBalance = Number(yjcRow[0]?.balance ?? 0);

    // 3. VIP score = weighted combination: 70% total_bets + 30% YJC holdings
    const score = Math.floor(totalBetAll * 0.7 + yjcBalance * 0.3);

    // 4. Determine level (based on score/总投注)
    const level = this.getVipTierByScore(score);
    const nextLevel = this.getNextLevel(level);

    // 5. Determine YJC VIP tier (based on YJC balance) - separate system!
    const yjcVipTier = this.getYjcVipTier(yjcBalance);

    // 6. Calculate progress to next level
    let progressPct = 100;
    if (nextLevel) {
      const span = nextLevel.threshold - level.threshold;
      const done = score - level.threshold;
      progressPct = Math.min(100, Math.floor((done / span) * 100));
    }

    return {
      address: addr,
      score,
      totalBetAll,
      yjcBalance,
      level,
      nextLevel,
      progressPct,
      yjcVipTier,
      privileges: {
        dailyBonusMultiplier: level.dailyBonusMultiplier ?? 1.0,
        marketFeeDiscount: level.marketFeeDiscount ?? 0.0,
        danmakuColor: level.danmakuColor ?? "#a0a0a0",
        danmakuPriority: level.danmakuPriority ?? 0,
      },
    };
  }

  // Get YJC VIP tier based on YJC balance (separate from level system)
  private getYjcVipTier(yjcBalance: number): YjcVipTier {
    for (let i = YJC_VIP_TIERS.length - 1; i >= 0; i--) {
      if (yjcBalance >= YJC_VIP_TIERS[i].minBalance) {
        return YJC_VIP_TIERS[i];
      }
    }
    return YJC_VIP_TIERS[0]; // "none" tier
  }

  // Get YJC VIP tier by address (for game fee calculation)
  async getYjcVipTierByAddress(address: string): Promise<YjcVipTier> {
    const addr = address.toLowerCase();
    const db = await this.getDb();

    // Get YJC token balance
    const yjcRow = await db
      .select({ balance: schema.walletAccounts.balance })
      .from(schema.walletAccounts)
      .where(
        and(
          eq(schema.walletAccounts.address, addr),
          eq(schema.walletAccounts.token, "yjc")
        )
      )
      .limit(1);

    const yjcBalance = Number(yjcRow[0]?.balance ?? 0);
    return this.getYjcVipTier(yjcBalance);
  }

  // Check if user has VIP2 (for zero game fees)
  async hasVip2(address: string): Promise<boolean> {
    const tier = await this.getYjcVipTierByAddress(address);
    return tier.key === "vip2";
  }

  // Quick level lookup (for other managers)
  async getVipLevel(address: string): Promise<LevelTier> {
    const status = await this.getVipStatus(address);
    return status?.level ?? LEVEL_TIERS[0];
  }

  // Get market fee discount (for MarketManager)
  async getMarketFeeDiscount(address: string): Promise<number> {
    const level = await this.getVipLevel(address);
    return level.marketFeeDiscount ?? 0.0;
  }

  // Get daily bonus multiplier (for WalletManager)
  async getDailyBonusMultiplier(address: string): Promise<number> {
    const level = await this.getVipLevel(address);
    return level.dailyBonusMultiplier ?? 1.0;
  }
}
