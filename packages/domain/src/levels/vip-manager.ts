// packages/domain/src/levels/vip-manager.ts
import { eq, and } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { LEVEL_TIERS, LevelTier } from "@repo/shared";
import * as schema from "@repo/infrastructure/db/schema.js";

export interface VipFullStatus {
  address: string;
  score: number;         // VIP score = weighted combination of total_bets + YJC holdings
  totalBetAll: number;   // Total site bets
  yjcBalance: number;    // YJC token balance
  level: LevelTier;
  nextLevel: LevelTier | null;
  progressPct: number;   // Progress to next level 0-100
  privileges: {
    dailyBonusMultiplier: number;
    marketFeeDiscount: number;
    danmakuColor: string;
    danmakuPriority: number;
  };
}

export class VipManager {
  constructor(private db: PostgresJsDatabase<typeof schema>) {}

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

    // 1. Get total bets for 'all' period
    const betRow = await this.db
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
    const yjcRow = await this.db
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

    // 4. Determine level
    const level = this.getVipTierByScore(score);
    const nextLevel = this.getNextLevel(level);

    // 5. Calculate progress to next level
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
      privileges: {
        dailyBonusMultiplier: level.dailyBonusMultiplier ?? 1.0,
        marketFeeDiscount: level.marketFeeDiscount ?? 0.0,
        danmakuColor: level.danmakuColor ?? "#a0a0a0",
        danmakuPriority: level.danmakuPriority ?? 0,
      },
    };
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
