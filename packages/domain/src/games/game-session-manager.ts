// packages/domain/src/games/game-session-manager.ts
import { eq, and, desc, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/infrastructure/db/schema.js";

// ── Types ──────────────────────────────────────────────────────────
export type GameName = "slots" | "coinflip" | "roulette" | "horse" | "sicbo" | "bingo" | "duel" | "blackjack" | "crash" | "poker" | "bluffdice" | "shoot_dragon_gate";

export interface GameResult {
  result: "win" | "lose" | "draw";
  payout: number;
  meta?: Record<string, unknown>;
}

export interface PlayOptions {
  userId: string;
  address: string;
  game: GameName;
  betAmount: number;
  gameResult: GameResult;
}

export class GameSessionManager {
  constructor(private db: PostgresJsDatabase<typeof schema>) {}

  // ── Core: Record game result + update total_bets + adjust wallet ──────────
  async recordGame(opts: PlayOptions): Promise<schema.GameSession> {
    const { userId, address, game, betAmount, gameResult } = opts;
    const addr = address.toLowerCase();

    return await this.db.transaction(async (tx) => {
      // 1. Check wallet balance
      const walletRow = await tx
        .select({ balance: schema.walletAccounts.balance })
        .from(schema.walletAccounts)
        .where(eq(schema.walletAccounts.address, addr))
        .limit(1)
        .for("update"); // row lock

      const currentBalance = Number(walletRow[0]?.balance ?? 0);
      if (currentBalance < betAmount) {
        throw new Error("INSUFFICIENT_BALANCE");
      }

      // 2. Deduct bet and credit payout
      const netChange = gameResult.payout - betAmount; // positive=win, negative=lose
      await tx
        .update(schema.walletAccounts)
        .set({
          balance: sql`${schema.walletAccounts.balance} + ${netChange}`,
          updatedAt: new Date(),
        })
        .where(eq(schema.walletAccounts.address, addr));

      // 3. Accumulate total_bets (all + week + month)
      const periodIds = this.getPeriodIds();
      for (const { periodType, periodId } of periodIds) {
        await tx
          .insert(schema.totalBets)
          .values({
            periodType,
            periodId,
            address: addr,
            amount: betAmount,
          })
          .onConflictDoUpdate({
            target: [schema.totalBets.periodType, schema.totalBets.periodId, schema.totalBets.address],
            set: { amount: sql`${schema.totalBets.amount} + ${betAmount}` },
          });
      }

      // 4. Write to game_sessions
      const [session] = await tx
        .insert(schema.gameSessions)
        .values({
          userId,
          address: addr,
          game,
          betAmount: String(betAmount),
          result: gameResult.result,
          payout: String(gameResult.payout),
          meta: gameResult.meta ?? {},
        })
        .returning();

      return session;
    });
  }

  // ── Get game history ──────────────────────────────────────────────────
  async getHistory(
    address: string,
    game?: GameName,
    limit = 20
  ): Promise<schema.GameSession[]> {
    const addr = address.toLowerCase();
    const conditions: any[] = [eq(schema.gameSessions.address, addr)];
    if (game) conditions.push(eq(schema.gameSessions.game, game));

    return this.db
      .select()
      .from(schema.gameSessions)
      .where(and(...conditions))
      .orderBy(desc(schema.gameSessions.createdAt))
      .limit(limit);
  }

  // ── Utils: Calculate current periods to update ─────────────────────────
  getPeriodIds(): Array<{ periodType: "all" | "week" | "month" | "season"; periodId: string }> {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, "0");

    // Sunday of current week
    const day = now.getUTCDay();
    const sun = new Date(now);
    sun.setUTCDate(now.getUTCDate() - day);
    const wy = sun.getUTCFullYear();
    const wm = String(sun.getUTCMonth() + 1).padStart(2, "0");
    const wd = String(sun.getUTCDate()).padStart(2, "0");

    // Season: S{year}{quarter} format
    const quarter = Math.floor(now.getUTCMonth() / 3) + 1;
    const seasonId = `S${y}Q${quarter}`;

    return [
      { periodType: "all", periodId: "" },
      { periodType: "week", periodId: `${wy}${wm}${wd}` },
      { periodType: "month", periodId: `${y}-${m}` },
      { periodType: "season", periodId: seasonId },
    ];
  }
}
