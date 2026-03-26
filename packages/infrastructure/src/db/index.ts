import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

const connectionString = process.env.DATABASE_URL || "postgres://localhost:5432/db";
const isActuallySet = process.env.DATABASE_URL && process.env.DATABASE_URL !== "postgres://localhost:5432/db";
const useMock = !isActuallySet || process.env.MOCK_DB === "true";
console.log(`[DB] useMock: ${useMock}, isActuallySet: ${isActuallySet}, MOCK_DB: ${process.env.MOCK_DB}`);

let db: any;
if (!useMock) {
  console.log(`[DB] Connecting to ${connectionString}`);
  const client = postgres(connectionString);
  db = drizzle(client, { schema });
}

const memoryDb: Record<string, any[]> = {
  users: [],
  sessions: [],
  txIntents: [],
  opsEvents: [],
  rewardGrants: [],
  marketOrders: [],
};

export class UserRepository {
  async saveUser(user: any) {
    if (useMock) {
      const idx = memoryDb.users.findIndex(u => u.id === user.id);
      if (idx >= 0) memoryDb.users[idx] = { ...memoryDb.users[idx], ...user, updatedAt: new Date() };
      else memoryDb.users.push({ ...user, createdAt: new Date(), updatedAt: new Date() });
      return;
    }
    return await db.insert(schema.users).values(user).onConflictDoUpdate({
      target: schema.users.id,
      set: { updatedAt: new Date() },
    });
  }

  async getUserById(id: string) {
    if (useMock) return memoryDb.users.find(u => u.id === id);
    return await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.id, id),
    });
  }

  async getUserByAddress(address: string) {
    if (useMock) return memoryDb.users.find(u => u.address.toLowerCase() === address.toLowerCase());
    return await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.address, address.toLowerCase()),
    });
  }
}

export class SessionRepository {
  async saveSession(session: any) {
    if (useMock) {
      const idx = memoryDb.sessions.findIndex(s => s.id === session.id);
      if (idx >= 0) memoryDb.sessions[idx] = { ...memoryDb.sessions[idx], ...session };
      else memoryDb.sessions.push(session);
      return;
    }
    return await db.insert(schema.sessions).values(session).onConflictDoUpdate({
      target: schema.sessions.id,
      set: { status: session.status, userId: session.userId, address: session.address, publicKey: session.publicKey },
    });
  }

  async getSessionById(id: string) {
    if (useMock) return memoryDb.sessions.find(s => s.id === id);
    return await db.query.sessions.findFirst({
      where: (sessions, { eq }) => eq(sessions.id, id),
    });
  }
}

export class MetaRepository {
  async saveRewardGrant(grant: any) {
    if (useMock) {
      memoryDb.rewardGrants.push(grant);
      return;
    }
    return await db.insert(schema.rewardGrants).values(grant);
  }

  async saveMarketOrder(order: any) {
    if (useMock) {
      memoryDb.marketOrders.push(order);
      return;
    }
    return await db.insert(schema.marketOrders).values(order);
  }
}

export class WalletRepository {
  async saveTxIntent(intent: any) {
    if (useMock) {
      const idx = memoryDb.txIntents.findIndex(i => i.id === intent.id);
      if (idx >= 0) memoryDb.txIntents[idx] = { ...memoryDb.txIntents[idx], ...intent };
      else memoryDb.txIntents.push(intent);
      return;
    }
    return await db.insert(schema.txIntents).values(intent);
  }

  async getPendingIntents() {
    if (useMock) return memoryDb.txIntents.filter(i => i.status === "pending");
    return await db.query.txIntents.findMany({
      where: (txIntents, { eq }) => eq(txIntents.status, "pending"),
    });
  }
}

export class GameRepository {
  async saveRound(round: any) {
    if (useMock) {
      const idx = memoryDb.gameRounds?.findIndex((r: any) => r.id === round.id) ?? -1;
      if (!memoryDb.gameRounds) memoryDb.gameRounds = [];
      if (idx >= 0) memoryDb.gameRounds[idx] = { ...memoryDb.gameRounds[idx], ...round };
      else memoryDb.gameRounds.push(round);
      return;
    }
    return await db.insert(schema.gameRounds).values(round).onConflictDoUpdate({
      target: schema.gameRounds.id,
      set: { status: round.status, result: round.result, updatedAt: new Date() },
    });
  }

  async getRoundById(id: string) {
    if (useMock) return memoryDb.gameRounds?.find((r: any) => r.id === id);
    return await db.query.gameRounds.findFirst({
      where: (gameRounds, { eq }) => eq(gameRounds.id, id),
    });
  }
}

export class OpsRepository {
  async logEvent(event: any) {
    const log = {
      ...event,
      id: crypto.randomUUID(),
      createdAt: new Date(),
    };
    if (useMock) {
      memoryDb.opsEvents.push(log);
      console.log(`[OPS_EVENT] ${log.kind}: ${log.message}`);
      return;
    }
    return await db.insert(schema.opsEvents).values(log);
  }

  async listEvents(options: { limit?: number; userId?: string } = {}) {
    if (useMock) return memoryDb.opsEvents.slice(-(options.limit || 50)).reverse();
    return await db.query.opsEvents.findMany({
      where: options.userId ? (opsEvents, { eq }) => eq(opsEvents.userId, options.userId!) : undefined,
      limit: options.limit || 50,
      orderBy: (opsEvents, { desc }) => [desc(opsEvents.createdAt)],
    });
  }
}

export class StatsRepository {
  async getLeaderboard(type: "total_bet" | "balance") {
    if (useMock) {
      return [
        { address: "0x1111...1111", displayName: "賭聖", value: "50000000", avatar: "👑", vipLevel: "創世等級" },
        { address: "0x2222...2222", displayName: "幸運星", value: "20000000", avatar: "🌟", vipLevel: "鑽石等級" },
        { address: "0x3333...3333", displayName: "路人甲", value: "5000000", avatar: "👤", vipLevel: "黃金會員" }
      ];
    }
    // In real Postgres, we'd join users and wallet_accounts/total_bet_ledger
    // Mocking the query structure for now but in the right repository
    return await db.query.users.findMany({ limit: 10 });
  }
}
