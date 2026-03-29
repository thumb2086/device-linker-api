import { kv } from "../kv/index.js";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import postgres from "postgres";
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

const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const isPostgresReady = !!connectionString &&
                        connectionString !== "postgres://localhost:5432/db" &&
                        !connectionString.includes("mock") &&
                        process.env.MOCK_DB !== "true";

let db: any = null;
if (isPostgresReady) {
  if (connectionString!.includes("neon.tech")) {
    const sql = neon(connectionString!);
    db = drizzleNeon(sql, { schema });
  } else {
    const client = postgres(connectionString as string);
    db = drizzlePg(client, { schema });
  }
}

export class UserRepository implements IUserRepository {
  async saveUser(user: any) {
    if (!db) {
      await kv.set(`pg_mock:user:${user.id}`, user);
      await kv.set(`pg_mock:user_addr:${user.address.toLowerCase()}`, user.id);
      return;
    }
    await db.insert(schema.users).values(user).onConflictDoUpdate({
      target: schema.users.id,
      set: { updatedAt: new Date() },
    });
  }
  async getUserById(id: string) {
    if (!db) return await kv.get<any>(`pg_mock:user:${id}`);
    return await db.query.users.findFirst({ where: (users: any, { eq }: any) => eq(users.id, id) });
  }
  async getUserByAddress(address: string) {
    if (!db) {
       const id = await kv.get<string>(`pg_mock:user_addr:${address.toLowerCase()}`);
       if (!id) return null;
       return await this.getUserById(id);
    }
    return await db.query.users.findFirst({ where: (users: any, { eq }: any) => eq(users.address, address.toLowerCase()) });
  }
  async getUserProfile(userId: string) {
    if (!db) return await kv.get(`user_profile:${userId}`);
    return await db.query.userProfiles.findFirst({ where: (p: any, { eq }: any) => eq(p.userId, userId) });
  }
  async saveUserProfile(userId: string, data: any) {
    if (!db) {
        await kv.set(`user_profile:${userId}`, data);
        return;
    }
    await db.insert(schema.userProfiles).values({ userId, ...data }).onConflictDoUpdate({
        target: schema.userProfiles.userId,
        set: { ...data, updatedAt: new Date() }
    });
  }
}

export class SessionRepository implements ISessionRepository {
  async saveSession(session: any) {
    if (!db) {
      await kv.set(`pg_mock:session:${session.id}`, session, { ex: 86400 * 7 });
      return;
    }
    await db.insert(schema.sessions).values(session).onConflictDoUpdate({
      target: schema.sessions.id,
      set: {
        status: session.status,
        userId: session.userId,
        address: session.address,
        publicKey: session.publicKey,
        authorizedAt: session.authorizedAt
      },
    });
  }
  async getSessionById(id: string) {
    if (!db) return await kv.get<any>(`pg_mock:session:${id}`);
    return await db.query.sessions.findFirst({ where: (sessions: any, { eq }: any) => eq(sessions.id, id) });
  }
}

export class WalletRepository implements IWalletRepository {
  async getBalance(address: string, token: string = "zhixi") {
    if (!db) {
      const key = token === "yjc" ? `balance_yjc:${address.toLowerCase()}` : `balance:${address.toLowerCase()}`;
      return await kv.get<string>(key) || "0";
    }
    const account = await db.query.walletAccounts.findFirst({
      where: (walletAccounts: any, { and, eq }: any) => and(
        eq(walletAccounts.address, address.toLowerCase()),
        eq(walletAccounts.token, token)
      )
    });
    return account?.balance || "0";
  }

  async updateBalance(address: string, amount: string, token: string = "zhixi") {
    if (!db) {
      const key = token === "yjc" ? `balance_yjc:${address.toLowerCase()}` : `balance:${address.toLowerCase()}`;
      await kv.set(key, amount);
      return;
    }
    // Need a userId for the record if creating new. Find user by address.
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
    if (!db) {
      await kv.set(`pg_mock:tx_intent:${intent.id}`, intent);
      if (intent.status === "pending") await kv.sadd("pg_mock:pending_intents", intent.id);
      else await kv.srem("pg_mock:pending_intents", intent.id);
      return;
    }
    await db.insert(schema.txIntents).values(intent).onConflictDoUpdate({
      target: schema.txIntents.id,
      set: { status: intent.status, txHash: intent.txHash, updatedAt: new Date() }
    });
  }

  async getPendingIntents() {
    if (!db) {
      const ids = await kv.smembers("pg_mock:pending_intents") || [];
      const intents = [];
      for (const id of ids) {
         const intent = await kv.get(`pg_mock:tx_intent:${id}`);
         if (intent) intents.push(intent);
      }
      return intents;
    }
    return await db.query.txIntents.findMany({ where: (txIntents: any, { eq }: any) => eq(txIntents.status, "pending") });
  }
}

export class MarketRepository implements IMarketRepository {
    async getAccount(address: string) {
        if (!db) return await kv.get<any>(`market_account:${address.toLowerCase()}`);
        return await db.query.marketAccounts.findFirst({ where: (accounts: any, { eq }: any) => eq(accounts.address, address.toLowerCase()) });
    }
    async saveAccount(address: string, userId: string, account: any) {
        if (!db) {
            await kv.set(`market_account:${address.toLowerCase()}`, account);
            return;
        }
        await db.insert(schema.marketAccounts).values({ address: address.toLowerCase(), userId: userId, data: account, updatedAt: new Date() })
           .onConflictDoUpdate({ target: schema.marketAccounts.address, set: { data: account, updatedAt: new Date() } });
    }
    async getMarketSnapshot() { return await kv.get<any>("market:snapshot"); }
    async saveMarketSnapshot(snapshot: any) { await kv.set("market:snapshot", snapshot); }
}

export class MetaRepository implements IMetaRepository {
  async saveRewardGrant(grant: any) {
    if (!db) { await kv.lpush('pg_mock:reward_grants', grant); return; }
    await db.insert(schema.rewardGrants).values(grant);
  }
  async saveMarketOrder(order: any) {
    if (!db) { await kv.lpush('pg_mock:market_orders', order); return; }
    await db.insert(schema.marketTrades).values(order);
  }
}

export class GameRepository implements IGameRepository {
  async saveRound(round: any) {
    if (!db) { await kv.set(`pg_mock:game_round:${round.id}`, round, { ex: 86400 * 30 }); return; }
    await db.insert(schema.gameRounds).values(round).onConflictDoUpdate({ target: schema.gameRounds.id, set: { status: round.status, result: round.result, updatedAt: new Date() } });
  }
  async getRoundById(id: string) {
    if (!db) return await kv.get<any>(`pg_mock:game_round:${id}`);
    return await db.query.gameRounds.findFirst({ where: (gameRounds: any, { eq }: any) => eq(gameRounds.id, id) });
  }
}

export class OpsRepository implements IOpsRepository {
  async logEvent(event: any) {
    const log = { ...event, id: crypto.randomUUID(), createdAt: new Date() };
    if (!db) {
      await kv.lpush("pg_mock:ops_events", log);
      await kv.ltrim("pg_mock:ops_events", 0, 1000);
      return;
    }
    await db.insert(schema.opsEvents).values(log);
  }
  async listEvents(options: { limit?: number; userId?: string } = {}) {
    if (!db) {
      let logs = await kv.lrange<any>("pg_mock:ops_events", 0, 1000) || [];
      if (options.userId) logs = logs.filter(l => l.userId === options.userId);
      return logs.slice(0, options.limit || 50);
    }
    return await db.query.opsEvents.findMany({
      where: options.userId ? (opsEvents: any, { eq }: any) => eq(opsEvents.userId, options.userId!) : undefined,
      limit: options.limit || 50,
      orderBy: (opsEvents: any, { desc }: any) => [desc(opsEvents.createdAt)],
    });
  }
}

export class StatsRepository implements IStatsRepository {
  async getLeaderboard(type: "total_bet" | "balance") {
    if (!db) return [{ address: "0x1111...1111", displayName: "賭聖", value: "50000000", avatar: "👑", vipLevel: "創世等級" }];
    // Simple placeholder for real leaderboard logic
    return await db.query.users.findMany({ limit: 10 });
  }
}

export class CustodyRepository implements ICustodyRepository {
  async saveCustodyUser(username: string, data: any) {
    if (!db) {
        await kv.set(`custody_user:${username.toLowerCase()}`, data);
        return;
    }
    // Need a user ID. Find or create.
    let user = await db.query.users.findFirst({ where: (u: any, { eq }: any) => eq(u.address, data.address.toLowerCase()) });
    if (!user) {
        const userId = crypto.randomUUID();
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
    if (!db) return await kv.get<any>(`custody_user:${username.toLowerCase()}`);
    return await db.query.custodyAccounts.findFirst({ where: (c: any, { eq }: any) => eq(c.username, username.toLowerCase()) });
  }
}
