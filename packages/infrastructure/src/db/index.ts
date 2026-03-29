import { kv } from "../kv/index.js";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { randomUUID } from "crypto";
import * as schema from "./schema.js";
import {
  IUserRepository,
  ISessionRepository,
  IWalletRepository,
  IMarketRepository,
  IMetaRepository,
  IGameRepository,
  IOpsRepository,
  IStatsRepository,
  ICustodyRepository
} from "../repositories/interfaces.js";
import { eq, and, desc } from "drizzle-orm";

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!connectionString && process.env.NODE_ENV === "production") {
  console.error("❌ Critical Error: DATABASE_URL is missing in production environment!");
}

let db: any = null;

try {
  if (connectionString && !connectionString.includes("mock")) {
    const client = postgres(connectionString, {
        ssl: 'require',
        max: 10,
        idle_timeout: 20,
        connect_timeout: 10
    });
    db = drizzle(client, { schema });
    console.log("✅ Initialized Postgres Client (Postgres.js)");
  } else {
    console.warn("⚠️ No valid DATABASE_URL found. Running without DB (MOCK MODE).");
  }
} catch (error) {
  console.error("❌ Failed to initialize database connection:", error);
}

export class UserRepository implements IUserRepository {
  async saveUser(user: any) {
    if (!db) throw new Error("Database not initialized");
    await db.insert(schema.users).values(user).onConflictDoUpdate({
      target: schema.users.id,
      set: { updatedAt: new Date() },
    });
  }
  async getUserById(id: string) {
    if (!db) throw new Error("Database not initialized");
    return await db.query.users.findFirst({ where: (users: any, { eq }: any) => eq(users.id, id) });
  }
  async getUserByAddress(address: string) {
    if (!db) throw new Error("Database not initialized");
    return await db.query.users.findFirst({ where: (users: any, { eq }: any) => eq(users.address, address.toLowerCase()) });
  }
  async getUserProfile(userId: string) {
    if (!db) throw new Error("Database not initialized");
    return await db.query.userProfiles.findFirst({ where: (p: any, { eq }: any) => eq(p.userId, userId) });
  }
  async saveUserProfile(userId: string, data: any) {
    if (!db) throw new Error("Database not initialized");
    await db.insert(schema.userProfiles).values({ userId, ...data }).onConflictDoUpdate({
        target: schema.userProfiles.userId,
        set: { ...data, updatedAt: new Date() }
    });
  }
}

export class SessionRepository implements ISessionRepository {
  async saveSession(session: any) {
    if (!db) throw new Error("Database not initialized");
    const safeSession = {
      ...session,
      createdAt: session.createdAt ? new Date(session.createdAt) : new Date(),
      expiresAt: session.expiresAt ? new Date(session.expiresAt) : new Date(Date.now() + 3600000),
      authorizedAt: session.authorizedAt ? new Date(session.authorizedAt) : undefined,
    };
    await db.insert(schema.sessions).values(safeSession).onConflictDoUpdate({
      target: schema.sessions.id,
      set: {
        status: safeSession.status,
        userId: safeSession.userId,
        address: safeSession.address,
        publicKey: safeSession.publicKey,
        authorizedAt: safeSession.authorizedAt
      },
    });
  }
  async getSessionById(id: string) {
    if (!db) throw new Error("Database not initialized");
    return await db.query.sessions.findFirst({ where: (sessions: any, { eq }: any) => eq(sessions.id, id) });
  }
}

export class WalletRepository implements IWalletRepository {
  async getBalance(address: string, token: string = "zhixi") {
    if (!db) throw new Error("Database not initialized");
    const account = await db.query.walletAccounts.findFirst({
      where: (walletAccounts: any, { and, eq }: any) => and(
        eq(walletAccounts.address, address.toLowerCase()),
        eq(walletAccounts.token, token)
      )
    });
    return account?.balance || "0";
  }

  async updateBalance(address: string, amount: string, token: string = "zhixi") {
    if (!db) throw new Error("Database not initialized");
    const user = await db.query.users.findFirst({ where: (u: any, { eq }: any) => eq(u.address, address.toLowerCase()) });
    if (!user) throw new Error("User not found during balance update");

    await db.insert(schema.walletAccounts).values({
      userId: user.id,
      address: address.toLowerCase(),
      token: token,
      balance: amount,
      updatedAt: new Date()
    }).onConflictDoUpdate({
      target: [schema.walletAccounts.address, schema.walletAccounts.token],
      set: { balance: amount, updatedAt: new Date() }
    });
  }

  async saveTxIntent(intent: any) {
    if (!db) throw new Error("Database not initialized");
    try {
        await db.insert((schema as any).txIntents).values(intent).onConflictDoUpdate({
          target: (schema as any).txIntents.id,
          set: { status: intent.status, txHash: intent.txHash, updatedAt: new Date() }
        });
    } catch(e) {}
  }

  async getPendingIntents() {
    if (!db) throw new Error("Database not initialized");
    try {
        return await db.query.txIntents.findMany({ where: (txIntents: any, { eq }: any) => eq(txIntents.status, "pending") });
    } catch(e) { return []; }
  }
}

export class MarketRepository implements IMarketRepository {
    async getAccount(address: string) {
        if (!db) throw new Error("Database not initialized");
        return await db.query.marketAccounts.findFirst({ where: (accounts: any, { eq }: any) => eq(accounts.address, address.toLowerCase()) });
    }
    async saveAccount(address: string, userId: string, account: any) {
        if (!db) throw new Error("Database not initialized");
        await db.insert(schema.marketAccounts).values({ address: address.toLowerCase(), userId: userId, data: account, updatedAt: new Date() })
           .onConflictDoUpdate({ target: schema.marketAccounts.address, set: { data: account, updatedAt: new Date() } });
    }
    async getMarketSnapshot() { return await kv.get<any>("market:snapshot"); }
    async saveMarketSnapshot(snapshot: any) { await kv.set("market:snapshot", snapshot); }
}

export class MetaRepository implements IMetaRepository {
  async saveRewardGrant(grant: any) {
    if (!db) throw new Error("Database not initialized");
    try { await db.insert((schema as any).rewardGrants).values(grant); } catch(e) {}
  }
  async saveMarketOrder(order: any) {
    if (!db) throw new Error("Database not initialized");
    try { await db.insert((schema as any).marketTrades).values(order); } catch(e) {}
  }
}

export class GameRepository implements IGameRepository {
  async saveRound(round: any) {
    if (!db) throw new Error("Database not initialized");
    try {
        await db.insert((schema as any).gameRounds).values(round).onConflictDoUpdate({
            target: (schema as any).gameRounds.id,
            set: { status: round.status, result: round.result, updatedAt: new Date() }
        });
    } catch(e) {}
  }
  async getRoundById(id: string) {
    if (!db) throw new Error("Database not initialized");
    try {
        return await db.query.gameRounds.findFirst({ where: (gameRounds: any, { eq }: any) => eq(gameRounds.id, id) });
    } catch(e) { return null; }
  }
}

export class OpsRepository implements IOpsRepository {
  async logEvent(event: any) {
    if (!db) {
       console.error("OpsEvent could not be saved to DB:", event);
       return;
    }
    const log = { ...event, id: randomUUID(), createdAt: new Date() };
    await db.insert(schema.opsEvents).values(log);
  }
  async listEvents(options: { limit?: number; userId?: string } = {}) {
    if (!db) throw new Error("Database not initialized");
    return await db.query.opsEvents.findMany({
      where: options.userId ? (opsEvents: any, { eq }: any) => eq(opsEvents.userId, options.userId!) : undefined,
      limit: options.limit || 50,
      orderBy: (opsEvents: any, { desc }: any) => [desc(opsEvents.createdAt)],
    });
  }
}

export class StatsRepository implements IStatsRepository {
  async getLeaderboard(type: "total_bet" | "balance") {
    if (!db) throw new Error("Database not initialized");
    return await db.query.users.findMany({ limit: 10 });
  }
}

export class CustodyRepository implements ICustodyRepository {
  async saveCustodyUser(username: string, data: any) {
    if (!db) throw new Error("Database not initialized");
    let user = await db.query.users.findFirst({ where: (u: any, { eq }: any) => eq(u.address, data.address.toLowerCase()) });
    if (!user) {
        const userId = randomUUID();
        await db.insert(schema.users).values({ id: userId, address: data.address.toLowerCase(), displayName: username, createdAt: new Date(), updatedAt: new Date() });
        user = { id: userId };
    }
    await db.insert(schema.custodyAccounts).values({
        username: username.toLowerCase(),
        passwordHash: data.passwordHash,
        saltHex: data.saltHex,
        address: data.address.toLowerCase(),
        publicKey: data.publicKey || null,
        userId: user.id,
        updatedAt: new Date()
    }).onConflictDoUpdate({
        target: schema.custodyAccounts.username,
        set: { updatedAt: new Date() }
    });
  }
  async getCustodyUser(username: string) {
    if (!db) throw new Error("Database not initialized");
    return await db.query.custodyAccounts.findFirst({ where: (c: any, { eq }: any) => eq(c.username, username.toLowerCase()) });
  }
}
