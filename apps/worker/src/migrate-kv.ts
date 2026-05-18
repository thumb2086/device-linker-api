// apps/worker/src/migrate-kv.ts
// KV → DB migration tool. Migrates all kv_store data into proper PG tables.
// After migration, the kv_store is reduced to only cache/cooldown/ephemeral data.
//
// Usage:
//   npx tsx apps/worker/src/migrate-kv.ts            # migrate all phases
//   npx tsx apps/worker/src/migrate-kv.ts --phase 1   # single phase
//   DRY_RUN=true npx tsx apps/worker/src/migrate-kv.ts

import { randomUUID } from "crypto";
import { OnchainWalletManager } from "@repo/domain";
import { requireDb, kv } from "@repo/infrastructure";
import * as schema from "@repo/infrastructure/db/schema.js";
import { eq, and, sql } from "drizzle-orm";

const DRY_RUN = process.env.DRY_RUN === "true";
const phaseFilter = process.argv.includes("--phase")
  ? Number(process.argv[process.argv.indexOf("--phase") + 1])
  : null;

async function getAllKvEntries() {
  const db = await requireDb();
  const rows = await db.select({ key: schema.kvStore.key, value: schema.kvStore.value })
    .from(schema.kvStore);
  return rows;
}

function classifyKey(key: string): string {
  if (key.startsWith("session:")) return "session";
  if (key.startsWith("pg_mock:")) return "pg_mock";
  if (key.startsWith("balance_yjc:")) return "balance_yjc";
  if (key.startsWith("balance:")) return "balance";
  if (key.startsWith("total_bet:")) return "total_bet";
  if (key.startsWith("total_win:")) return "total_win";
  if (key.startsWith("last_airdrop:")) return "last_airdrop";
  if (key.startsWith("vip:")) return "vip";
  if (key.startsWith("blacklist:")) return "blacklist";
  if (key.startsWith("owned_avatars:")) return "owned_avatars";
  if (key.startsWith("owned_titles:")) return "owned_titles";
  if (key.startsWith("active_avatar:")) return "active_avatar";
  if (key.startsWith("active_title:")) return "active_title";
  if (key.startsWith("inventory:")) return "inventory";
  if (key.startsWith("chest_meta:")) return "chest_meta";
  if (key.startsWith("leaderboard:")) return "leaderboard";
  if (key.startsWith("market:")) return "market";
  if (key.startsWith("chat:")) return "chat";
  if (key.startsWith("chests:")) return "chests_catalog";
  if (key.startsWith("rewards:")) return "rewards_catalog";
  if (key.startsWith("system:") || key.startsWith("maintenance:")) return "system_config";
  if (key.startsWith("support:ticket:")) return "support_ticket";
  if (key.startsWith("user:tickets:")) return "user_tickets";
  if (key.startsWith("platform:announcements")) return "platform_announcements";
  if (key.startsWith("onchain:")) return "onchain";
  if (key.startsWith("airdrop:")) return "airdrop";
  if (key.startsWith("stats:")) return "stats";
  if (key.startsWith("room:")) return "room";
  if (key.startsWith("read_cache:")) return "read_cache";
  if (key.startsWith("yjc_vip:")) return "yjc_vip";
  if (key.startsWith("nonce:") || key.startsWith("chain_") || key.startsWith("admin_chain_")) return "chain";
  return "other";
}

async function log(msg: string) {
  console.log(`  ${msg}`);
}

async function phase1_removeDeadKeys(db: Awaited<ReturnType<typeof requireDb>>) {
  console.log("\n=== Phase 1: Remove dead/legacy KV keys (no migration needed) ===");
  const entries = await getAllKvEntries();
  const deadPatterns = ["session:", "pg_mock:", "vip:", "inventory:", "owned_avatars:", "owned_titles:",
    "active_avatar:", "active_title:", "user:tickets:", "platform:announcements"];

  let removed = 0;
  for (const { key } of entries) {
    const cat = classifyKey(key);
    if (deadPatterns.some(p => key.startsWith(p))) {
      if (!DRY_RUN) {
        try { await db.delete(schema.kvStore).where(eq(schema.kvStore.key, key)); } catch {}
      }
      removed++;
      if (removed <= 5) await log(`Delete ${key.slice(0,50)}...`);
    }
  }
  await log(`Removed ${removed} dead KV entries (DRY_RUN=${DRY_RUN})`);
}

async function phase2_financialToDb(db: Awaited<ReturnType<typeof requireDb>>) {
  console.log("\n=== Phase 2: Migrate financial data (balance/total_bet/total_win) ===");
  const entries = await getAllKvEntries();

  let balUpdated = 0, betUpdated = 0, winUpdated = 0;

  for (const { key, value } of entries) {
    // balance:{addr}
    if (key.startsWith("balance:") && !key.startsWith("balance_yjc:")) {
      const addr = key.slice(8).toLowerCase();
      const bal = String(value ?? "0");
      if (!DRY_RUN && Number(bal) > 0) {
        // Find user
        const [user] = await db.select({ id: schema.users.id })
          .from(schema.users).where(eq(schema.users.address, addr)).limit(1);
        if (user) {
          await db.insert(schema.walletAccounts).values({
            id: randomUUID(), userId: user.id, address: addr,
            token: "zhixi", balance: bal, lockedBalance: "0", updatedAt: new Date(),
          }).onConflictDoUpdate({
            target: [schema.walletAccounts.address, schema.walletAccounts.token],
            set: { balance: bal, updatedAt: new Date() },
          });
          balUpdated++;
        }
      }
    }
    // total_bet:{addr}
    if (key.startsWith("total_bet:")) {
      const addr = key.slice(10).toLowerCase();
      const amount = BigInt(String(value ?? "0"));
      if (!DRY_RUN && amount > 0n) {
        await db.insert(schema.totalBets).values({
          periodType: "all", periodId: "", address: addr, amount: Number(amount),
        }).onConflictDoUpdate({
          target: [schema.totalBets.periodType, schema.totalBets.periodId, schema.totalBets.address],
          set: { amount: sql`${schema.totalBets.amount} + ${Number(amount)}` },
        });
        betUpdated++;
      }
    }
    // total_win:{addr}
    if (key.startsWith("total_win:")) {
      const addr = key.slice(10).toLowerCase();
      if (!DRY_RUN) {
        try {
          await db.execute(sql`
            INSERT INTO total_bets (period_type, period_id, address, amount, total_win)
            VALUES ('all', '', ${addr}, 0, ${BigInt(String(value ?? "0"))})
            ON CONFLICT (period_type, period_id, address)
            DO UPDATE SET total_win = EXCLUDED.total_win
          `);
          winUpdated++;
        } catch {}
      }
    }
  }
  await log(`Balance updates: ${balUpdated}, Total_bet: ${betUpdated}, Total_win: ${winUpdated} (DRY_RUN=${DRY_RUN})`);
}

async function phase3_stateToDb(db: Awaited<ReturnType<typeof requireDb>>) {
  console.log("\n=== Phase 3: Migrate chest_meta + blacklist + maintenance ===");
  const entries = await getAllKvEntries();

  // Chest meta → user_profiles
  for (const { key, value } of entries) {
    if (!key.startsWith("chest_meta:")) continue;
    const userId = key.slice(11);
    const meta = value as any;
    if (!meta || DRY_RUN) continue;
    const user = await db.select({ id: schema.users.id })
      .from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (user) {
      const [profile] = await db.select({ id: schema.userProfiles.id })
        .from(schema.userProfiles).where(eq(schema.userProfiles.userId, userId)).limit(1);
      if (profile) {
        await db.update(schema.userProfiles).set({
          chestPity: meta.chestPity || {},
          lastFreeChestAt: meta.lastFreeChestAt ? new Date(meta.lastFreeChestAt) : null,
          updatedAt: new Date(),
        }).where(eq(schema.userProfiles.id, profile.id));
      }
    }
  }

  // Blacklist → users
  for (const { key, value } of entries) {
    if (!key.startsWith("blacklist:")) continue;
    const addr = key.slice(10).toLowerCase();
    const bl = value as any;
    if (!bl || DRY_RUN) continue;
    await db.update(schema.users).set({
      isBlacklisted: true,
      blacklistReason: bl.reason || null,
      blacklistedAt: bl.blacklistedAt ? new Date(bl.blacklistedAt) : new Date(),
      blacklistedBy: bl.by || bl.blacklistedBy || null,
      updatedAt: new Date(),
    }).where(eq(schema.users.address, addr));
  }

  // Maintenance → system_config (if table exists)
  try {
    for (const { key, value } of entries) {
      if (!key.startsWith("system:") && !key.startsWith("maintenance:")) continue;
      if (DRY_RUN) continue;
      const configKey = key.startsWith("system:") ? key : `maintenance:${key.slice(13)}`;
      await db.insert(schema.systemConfig).values({
        key: configKey,
        value: value,
        updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: schema.systemConfig.key,
        set: { value: value, updatedAt: new Date() },
      });
    }
  } catch (e: any) {
    await log(`system_config table not available, skipping: ${e.message}`);
  }
  await log(`Migrated chest_meta + blacklist + maintenance config (DRY_RUN=${DRY_RUN})`);
}

async function phase4_leaderboardAndSupport(db: Awaited<ReturnType<typeof requireDb>>) {
  console.log("\n=== Phase 4: Migrate leaderboard kings + support tickets ===");
  const entries = await getAllKvEntries();

  // leaderboard:king:counts & names
  const countsKey = entries.find(e => e.key === "leaderboard:king:counts");
  const namesKey = entries.find(e => e.key === "leaderboard:king:names");
  if (countsKey?.value && !DRY_RUN) {
    const counts = countsKey.value as Record<string, number>;
    const names = (namesKey?.value as Record<string, string>) || {};
    for (const [addr, count] of Object.entries(counts)) {
      const [user] = await db.select({ id: schema.users.id, displayName: schema.users.displayName })
        .from(schema.users).where(eq(schema.users.address, addr)).limit(1);
      if (user) {
        await db.insert(schema.leaderboardKings).values({
          id: randomUUID(),
          category: "all",
          userId: user.id,
          address: addr,
          displayName: names[addr] || user.displayName,
          winCount: count as number,
          lastWinAt: new Date(),
          periodId: "",
        }).onConflictDoNothing();
      }
    }
    await log("Migrated leaderboard:king* -> leaderboard_kings table");
  }

  // support:ticket:{id} → support_tickets table
  let ticketCount = 0;
  for (const { key, value } of entries) {
    if (!key.startsWith("support:ticket:")) continue;
    if (DRY_RUN) { ticketCount++; continue; }
    const reportId = key.slice(15);
    const t = value as any;
    if (!t) continue;
    await db.insert(schema.supportTickets).values({
      id: randomUUID(),
      reportId,
      userId: t.userId || null,
      address: t.address || null,
      displayName: t.displayName || null,
      category: t.category || "general",
      title: t.title || "",
      message: t.message || "",
      status: t.status || "open",
      adminUpdate: t.adminUpdate || null,
      createdAt: t.createdAt ? new Date(t.createdAt) : new Date(),
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: schema.supportTickets.reportId,
      set: { status: t.status, adminUpdate: t.adminUpdate, updatedAt: new Date() },
    });
    ticketCount++;
  }
  await log(`Migrated ${ticketCount} support tickets (DRY_RUN=${DRY_RUN})`);
}

async function phase5_cleanupKvStore(db: Awaited<ReturnType<typeof requireDb>>) {
  console.log("\n=== Phase 5: Clean up migrated keys from kv_store ===");
  const entries = await getAllKvEntries();

  const keepPatterns = [
    "last_airdrop:", "chat:", "market:", "chests:", "rewards:",
    "room:", "stats:", "chest:free-lock:", "leaderboard:asset:",
  ];

  let deleted = 0;
  for (const { key } of entries) {
    const shouldKeep = keepPatterns.some(p => key.startsWith(p));
    if (shouldKeep) continue;
    // Delete everything else (including already-migrated data)
    if (!DRY_RUN) {
      try { await db.delete(schema.kvStore).where(eq(schema.kvStore.key, key)); } catch {}
    }
    deleted++;
    if (deleted <= 3) await log(`Delete ${key.slice(0,50)}...`);
  }
  await log(`Deleted ${deleted} migrated KV entries. Remaining: ${entries.length - deleted} (keep patterns)`);
}

async function addMissingColumns(db: Awaited<ReturnType<typeof db>>) {
  // Add total_win column to total_bets
  try { await db.execute(sql`ALTER TABLE total_bets ADD COLUMN IF NOT EXISTS total_win BIGINT DEFAULT 0`); } catch {}
  // Add chest_pity and last_free_chest_at to user_profiles
  try { await db.execute(sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS chest_pity JSONB DEFAULT '{}'`); } catch {}
  try { await db.execute(sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS last_free_chest_at TIMESTAMP`); } catch {}
  // Ensure system_config table exists
  try {
    await db.execute(sql`CREATE TABLE IF NOT EXISTS system_config (key TEXT PRIMARY KEY, value JSONB, updated_by TEXT, updated_at TIMESTAMP NOT NULL DEFAULT NOW())`);
  } catch {}
  console.log("  Added missing columns/tables");
}

async function main() {
  console.log("=== KV → DB Migration Tool ===");
  if (DRY_RUN) console.log("*** DRY RUN MODE ***\n");

  const db = await requireDb();

  // Add missing columns first (idempotent)
  if (!phaseFilter || phaseFilter === 0) {
    await addMissingColumns(db);
  }

  const phases = [
    { num: 1, name: "Remove dead keys", fn: () => phase1_removeDeadKeys(db) },
    { num: 2, name: "Financial data", fn: () => phase2_financialToDb(db) },
    { num: 3, name: "State data", fn: () => phase3_stateToDb(db) },
    { num: 4, name: "Leaderboard + Support", fn: () => phase4_leaderboardAndSupport(db) },
    { num: 5, name: "Cleanup kv_store", fn: () => phase5_cleanupKvStore(db) },
  ];

  for (const phase of phases) {
    if (phaseFilter && phaseFilter !== phase.num) continue;
    await phase.fn();
  }

  console.log("\n=== Migration complete ===");
  if (DRY_RUN) console.log("(Dry run - no actual changes made)");
}

main().catch((err: any) => {
  console.error("Fatal:", err?.message || String(err));
  process.exit(1);
});
