// packages/domain/src/leaderboard/leaderboard-manager.ts
import { eq, and, desc, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/infrastructure/db/schema.js";

export type LeaderboardType = "all" | "week" | "month" | "season";

export interface LeaderboardEntry {
  rank: number;
  address: string;
  displayName: string | null;
  amount: number;
  // Asset leaderboard extra field
  balance?: number;
}

export interface LeaderboardResult {
  type: LeaderboardType | "asset";
  periodId: string;
  entries: LeaderboardEntry[];
  selfRank: LeaderboardEntry | null;
  updatedAt: string;
}

export class LeaderboardManager {
  constructor(private db: PostgresJsDatabase<typeof schema>) {}

  // ─────────────────────────────────────────
  // Utils: Get current period_id
  // ─────────────────────────────────────────
  getCurrentPeriodId(type: LeaderboardType): string {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, "0");

    if (type === "all") return "";

    if (type === "month") {
      return `${y}-${m}`;
    }

    if (type === "week") {
      // Get Sunday of current week (YYYYMMDD format)
      const day = now.getUTCDay(); // 0=Sun
      const sun = new Date(now);
      sun.setUTCDate(now.getUTCDate() - day);
      const wy = sun.getUTCFullYear();
      const wm = String(sun.getUTCMonth() + 1).padStart(2, "0");
      const wd = String(sun.getUTCDate()).padStart(2, "0");
      return `${wy}${wm}${wd}`;
    }

    if (type === "season") {
      // Season format: S-{year}{month} - simplified version
      return `S-${y}${m}`;
    }

    return "";
  }

  // ─────────────────────────────────────────
  // Main query: Bet leaderboard (day/week/month/all)
  // ─────────────────────────────────────────
  async getBetLeaderboard(
    type: LeaderboardType,
    selfAddress?: string,
    limit = 50,
    periodId?: string
  ): Promise<LeaderboardResult> {
    const pid = periodId ?? this.getCurrentPeriodId(type);

    // 1. Query main leaderboard list (JOIN users to get display_name)
    const rows = await this.db
      .select({
        address: schema.totalBets.address,
        amount: schema.totalBets.amount,
        displayName: schema.users.displayName,
      })
      .from(schema.totalBets)
      .leftJoin(schema.users, eq(schema.users.address, schema.totalBets.address))
      .where(
        and(
          eq(schema.totalBets.periodType, type),
          eq(schema.totalBets.periodId, pid)
        )
      )
      .orderBy(desc(schema.totalBets.amount))
      .limit(limit);

    const entries: LeaderboardEntry[] = rows.map((r, i) => ({
      rank: i + 1,
      address: r.address,
      displayName: r.displayName,
      amount: Number(r.amount ?? 0),
    }));

    // 2. Query self rank (if selfAddress provided and not in top limit)
    let selfRank: LeaderboardEntry | null = null;

    if (selfAddress) {
      const addr = selfAddress.toLowerCase();
      const inList = entries.find(
        (e) => e.address.toLowerCase() === addr
      );
      if (inList) {
        selfRank = inList;
      } else {
        // Calculate self rank using COUNT
        const selfRow = await this.db
          .select({ amount: schema.totalBets.amount })
          .from(schema.totalBets)
          .where(
            and(
              eq(schema.totalBets.periodType, type),
              eq(schema.totalBets.periodId, pid),
              eq(schema.totalBets.address, addr)
            )
          )
          .limit(1);

        if (selfRow.length > 0) {
          const selfAmount = Number(selfRow[0].amount ?? 0);

          const rankResult = await this.db
            .select({ cnt: sql<number>`count(*)` })
            .from(schema.totalBets)
            .where(
              and(
                eq(schema.totalBets.periodType, type),
                eq(schema.totalBets.periodId, pid),
                sql`${schema.totalBets.amount} > ${selfAmount}`
              )
            );

          const rank = Number(rankResult[0]?.cnt ?? 0) + 1;
          const userRow = await this.db
            .select({ displayName: schema.users.displayName })
            .from(schema.users)
            .where(eq(schema.users.address, addr))
            .limit(1);

          selfRank = {
            rank,
            address: addr,
            displayName: userRow[0]?.displayName ?? null,
            amount: selfAmount,
          };
        }
      }
    }

    return {
      type,
      periodId: pid,
      entries,
      selfRank,
      updatedAt: new Date().toISOString(),
    };
  }

  // ─────────────────────────────────────────
  // Asset leaderboard: Direct query on wallet_accounts.balance
  // ─────────────────────────────────────────
  async getAssetLeaderboard(
    selfAddress?: string,
    limit = 50
  ): Promise<LeaderboardResult> {
    const rows = await this.db
      .select({
        address: schema.walletAccounts.address,
        balance: schema.walletAccounts.balance,
        displayName: schema.users.displayName,
      })
      .from(schema.walletAccounts)
      .leftJoin(schema.users, eq(schema.users.address, schema.walletAccounts.address))
      .orderBy(desc(schema.walletAccounts.balance))
      .limit(limit);

    const entries: LeaderboardEntry[] = rows.map((r, i) => ({
      rank: i + 1,
      address: r.address,
      displayName: r.displayName,
      amount: Number(r.balance ?? 0),
      balance: Number(r.balance ?? 0),
    }));

    let selfRank: LeaderboardEntry | null = null;

    if (selfAddress) {
      const addr = selfAddress.toLowerCase();
      const inList = entries.find(
        (e) => e.address.toLowerCase() === addr
      );
      if (inList) {
        selfRank = inList;
      } else {
        const selfRow = await this.db
          .select({ balance: schema.walletAccounts.balance })
          .from(schema.walletAccounts)
          .where(eq(schema.walletAccounts.address, addr))
          .limit(1);

        if (selfRow.length > 0) {
          const selfBalance = Number(selfRow[0].balance ?? 0);
          const rankResult = await this.db
            .select({ cnt: sql<number>`count(*)` })
            .from(schema.walletAccounts)
            .where(sql`${schema.walletAccounts.balance} > ${selfBalance}`);

          const rank = Number(rankResult[0]?.cnt ?? 0) + 1;
          const userRow = await this.db
            .select({ displayName: schema.users.displayName })
            .from(schema.users)
            .where(eq(schema.users.address, addr))
            .limit(1);

          selfRank = {
            rank,
            address: addr,
            displayName: userRow[0]?.displayName ?? null,
            amount: selfBalance,
            balance: selfBalance,
          };
        }
      }
    }

    return {
      type: "asset",
      periodId: "asset",
      entries,
      selfRank,
      updatedAt: new Date().toISOString(),
    };
  }
}
