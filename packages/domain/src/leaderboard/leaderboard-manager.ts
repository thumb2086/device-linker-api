// packages/domain/src/leaderboard/leaderboard-manager.ts
import { eq, and, desc, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/infrastructure/db/schema.js";
import { MarketManager } from "../market/market-manager.js";

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
      // Season format: S{year}Q{quarter} (e.g., S2025Q2 for Apr-Jun 2025)
      const quarter = Math.floor(now.getUTCMonth() / 3) + 1;
      return `S${y}Q${quarter}`;
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
    let pid = periodId ?? this.getCurrentPeriodId(type);

    // 1. Query main leaderboard list (JOIN users to get display_name)
    let rows = await this.db
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

    // Note: Removed fallback to 'all' period - week/month/season should show only current period data

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

        const userRow = await this.db
          .select({ displayName: schema.users.displayName })
          .from(schema.users)
          .where(eq(schema.users.address, addr))
          .limit(1);

        // Even if user has no total_bets row yet, still return a self rank row with amount=0
        // so Device Linker app users can always see themselves on leaderboard.
        // Also allow session-address users to appear even when users profile row is not ready yet.
        const selfAmount = Number(selfRow[0]?.amount ?? 0);

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
        selfRank = {
          rank,
          address: addr,
          displayName: userRow[0]?.displayName ?? null,
          amount: selfAmount,
        };
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
  // Asset leaderboard: Query both zhixi and yjc, convert YJC to ZXC (1 YJC = 100M ZXC)
  // ─────────────────────────────────────────
  async getAssetLeaderboard(
    selfAddress?: string,
    limit = 50,
    includeMarketAssets = false,
  ): Promise<LeaderboardResult> {
    const YJC_TO_ZXC_RATE = 100_000_000; // 1 YJC = 100 million ZXC

    // Start from all known addresses so app users appear even before full profile rows are created.
    const allUsers = await this.db
      .select({ address: schema.users.address })
      .from(schema.users);
    const sessionRows = await this.db
      .select({ address: schema.sessions.address })
      .from(schema.sessions)
      .where(sql`${schema.sessions.address} IS NOT NULL`);
    const walletRows = await this.db
      .select({ address: schema.walletAccounts.address })
      .from(schema.walletAccounts);

    // Aggregate balances by address
    const balanceMap = new Map<string, { zhixi: number; yjc: number; total: number }>();
    for (const user of allUsers) balanceMap.set(user.address.toLowerCase(), { zhixi: 0, yjc: 0, total: 0 });
    for (const row of sessionRows) if (row.address) balanceMap.set(row.address.toLowerCase(), { zhixi: 0, yjc: 0, total: 0 });
    for (const row of walletRows) balanceMap.set(row.address.toLowerCase(), { zhixi: 0, yjc: 0, total: 0 });

    // Query all balances (zhixi + yjc) for each address
    const allBalances = await this.db
      .select({
        address: schema.walletAccounts.address,
        token: schema.walletAccounts.token,
        balance: schema.walletAccounts.balance,
      })
      .from(schema.walletAccounts)
      .where(
        sql`${schema.walletAccounts.token} IN ('zhixi', 'yjc')`
      );

    for (const row of allBalances) {
      const addr = row.address.toLowerCase();
      const bal = Number(row.balance ?? 0);

      if (!balanceMap.has(addr)) {
        balanceMap.set(addr, { zhixi: 0, yjc: 0, total: 0 });
      }

      const entry = balanceMap.get(addr)!;
      if (row.token === 'zhixi') {
        entry.zhixi = bal;
      } else if (row.token === 'yjc') {
        entry.yjc = bal;
      }
      // Calculate total in ZXC equivalent
      entry.total = entry.zhixi + (entry.yjc * YJC_TO_ZXC_RATE);
    }

    if (includeMarketAssets) {
      const marketManager = new MarketManager();
      const snapshot = marketManager.buildSnapshot();

      const marketAccounts = await this.db
        .select({
          address: schema.marketAccounts.address,
          data: schema.marketAccounts.data,
        })
        .from(schema.marketAccounts);

      for (const row of marketAccounts) {
        const addr = row.address.toLowerCase();
        const normalizedAccount = marketManager.normalizeAccount(row.data);
        marketManager.settleLiquidations(normalizedAccount, snapshot);
        const marketSummary = marketManager.buildAccountSummary(normalizedAccount, snapshot);
        const overlayNetWorth = Number(marketSummary.bankBalance || 0)
          + Number(marketSummary.stockValue || 0)
          + Number(marketSummary.futuresUnrealizedPnl || 0)
          - Number(marketSummary.loanPrincipal || 0);

        if (!balanceMap.has(addr)) {
          balanceMap.set(addr, { zhixi: 0, yjc: 0, total: 0 });
        }

        const entry = balanceMap.get(addr)!;
        entry.total = entry.total + overlayNetWorth;
      }
    }

    // Get display names for addresses
    const addresses = Array.from(balanceMap.keys());
    const userRows = addresses.length > 0
      ? await this.db
          .select({
            address: schema.users.address,
            displayName: schema.users.displayName,
          })
          .from(schema.users)
          .where(sql`${schema.users.address} IN ${addresses}`)
      : [];

    const displayNameMap = new Map(
      userRows.map(u => [u.address.toLowerCase(), u.displayName])
    );

    // Create entries array sorted by total value
    const entries: LeaderboardEntry[] = Array.from(balanceMap.entries())
      .map(([address, balances], i) => ({
        rank: i + 1, // Will be re-sorted
        address,
        displayName: displayNameMap.get(address) ?? null,
        amount: balances.total,
        balance: balances.total,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, limit)
      .map((entry, i) => ({ ...entry, rank: i + 1 }));

    // Calculate self rank
    let selfRank: LeaderboardEntry | null = null;

    if (selfAddress) {
      const addr = selfAddress.toLowerCase();
      const inList = entries.find(
        (e) => e.address.toLowerCase() === addr
      );

      if (inList) {
        selfRank = inList;
      } else {
        // Query self balances
        const selfRows = await this.db
          .select({
            token: schema.walletAccounts.token,
            balance: schema.walletAccounts.balance,
          })
          .from(schema.walletAccounts)
          .where(
            and(
              eq(schema.walletAccounts.address, addr),
              sql`${schema.walletAccounts.token} IN ('zhixi', 'yjc')`
            )
          );

        let selfZhixi = 0;
        let selfYjc = 0;

        for (const row of selfRows) {
          const bal = Number(row.balance ?? 0);
          if (row.token === 'zhixi') selfZhixi = bal;
          else if (row.token === 'yjc') selfYjc = bal;
        }

        const selfTotal = selfZhixi + (selfYjc * YJC_TO_ZXC_RATE);

        // Count how many addresses have higher total
        let rank = 1;
        for (const [, balances] of balanceMap) {
          if (balances.total > selfTotal) {
            rank++;
          }
        }

        const userRow = await this.db
          .select({ displayName: schema.users.displayName })
          .from(schema.users)
          .where(eq(schema.users.address, addr))
          .limit(1);

        selfRank = {
          rank,
          address: addr,
          displayName: userRow[0]?.displayName ?? null,
          amount: selfTotal,
          balance: selfTotal,
        };
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
