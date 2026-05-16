// packages/domain/src/danmaku/danmaku-manager.ts
import { eq, desc } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/infrastructure/db/schema.js";

export interface DanmakuEvent {
  id: string;
  type: "win" | "leaderboard" | "vip_upgrade" | "big_win";
  address: string;
  displayName: string | null;
  message: string;
  metadata?: Record<string, unknown>;
  priority: number;
  color: string;
  createdAt: Date;
}

export class DanmakuManager {
  constructor(private db: PostgresJsDatabase<typeof schema>) {}

  // Create a danmaku event for game win
  async createWinEvent(
    address: string,
    displayName: string | null,
    game: string,
    payout: number,
    multiplier: number,
    vipLevel: { color: string; priority: number }
  ): Promise<DanmakuEvent> {
    const isBigWin = multiplier >= 10;
    const type: "win" | "big_win" = isBigWin ? "big_win" : "win";
    
    const event: DanmakuEvent = {
      id: crypto.randomUUID(),
      type,
      address: address.toLowerCase(),
      displayName,
      message: this.formatWinMessage(displayName, game, payout, multiplier, isBigWin),
      metadata: { game, payout, multiplier },
      priority: vipLevel.priority + (isBigWin ? 5 : 0),
      color: vipLevel.color,
      createdAt: new Date(),
    };

    // Store in ops_events for logging
    await this.db.insert(schema.opsEvents).values({
      id: crypto.randomUUID(),
      channel: "danmaku",
      severity: "info",
      source: game,
      kind: type,
      address: address.toLowerCase(),
      message: event.message,
      meta: event.metadata,
      createdAt: new Date(),
    });

    return event;
  }

  // Create a danmaku event for leaderboard achievement
  async createLeaderboardEvent(
    address: string,
    displayName: string | null,
    rank: number,
    category: string,
    vipLevel: { color: string; priority: number }
  ): Promise<DanmakuEvent> {
    const event: DanmakuEvent = {
      id: crypto.randomUUID(),
      type: "leaderboard",
      address: address.toLowerCase(),
      displayName,
      message: this.formatLeaderboardMessage(displayName, rank, category),
      metadata: { rank, category },
      priority: vipLevel.priority + 3,
      color: vipLevel.color,
      createdAt: new Date(),
    };

    await this.db.insert(schema.opsEvents).values({
      id: crypto.randomUUID(),
      channel: "danmaku",
      severity: "info",
      source: "leaderboard",
      kind: "leaderboard_rank",
      address: address.toLowerCase(),
      message: event.message,
      meta: event.metadata,
      createdAt: new Date(),
    });

    return event;
  }

  // Create a danmaku event for VIP upgrade
  async createVipUpgradeEvent(
    address: string,
    displayName: string | null,
    newLevel: string,
    vipLevel: { color: string; priority: number }
  ): Promise<DanmakuEvent> {
    const event: DanmakuEvent = {
      id: crypto.randomUUID(),
      type: "vip_upgrade",
      address: address.toLowerCase(),
      displayName,
      message: this.formatVipUpgradeMessage(displayName, newLevel),
      metadata: { newLevel },
      priority: vipLevel.priority + 10,
      color: vipLevel.color,
      createdAt: new Date(),
    };

    await this.db.insert(schema.opsEvents).values({
      id: crypto.randomUUID(),
      channel: "danmaku",
      severity: "info",
      source: "vip_system",
      kind: "vip_upgrade",
      address: address.toLowerCase(),
      message: event.message,
      meta: event.metadata,
      createdAt: new Date(),
    });

    return event;
  }

  // Get recent danmaku events (for SSE/polling)
  async getRecentEvents(limit = 50): Promise<DanmakuEvent[]> {
    const events = await this.db
      .select()
      .from(schema.opsEvents)
      .where(eq(schema.opsEvents.channel, "danmaku"))
      .orderBy(desc(schema.opsEvents.createdAt))
      .limit(limit);

    return events.map((e) => ({
      id: e.id,
      type: e.kind as DanmakuEvent["type"],
      address: e.address || "",
      displayName: null,
      message: e.message,
      metadata: e.meta as Record<string, unknown> | undefined,
      priority: 0,
      color: "#ffffff",
      createdAt: e.createdAt,
    }));
  }

  // Helper: Format win message
  private formatWinMessage(
    displayName: string | null,
    game: string,
    payout: number,
    multiplier: number,
    isBigWin: boolean
  ): string {
    const name = displayName || "玩家";
    if (isBigWin) {
      return `🎉 ${name} 在 ${game} 中大贏 ${payout} ZXC！(${multiplier}x)`;
    }
    return `${name} 在 ${game} 贏得 ${payout} ZXC`;
  }

  // Helper: Format leaderboard message
  private formatLeaderboardMessage(
    displayName: string | null,
    rank: number,
    category: string
  ): string {
    const name = displayName || "玩家";
    const rankText = rank === 1 ? "👑 第一名" : `第 ${rank} 名`;
    return `🏆 ${name} 登上${category}榜${rankText}！`;
  }

  // Helper: Format VIP upgrade message
  private formatVipUpgradeMessage(
    displayName: string | null,
    newLevel: string
  ): string {
    const name = displayName || "玩家";
    return `✨ ${name} 升級為 ${newLevel}！`;
  }
}
