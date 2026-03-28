import { kv } from "../kv/index.js";
import { drizzle } from "drizzle-orm/postgres-js";
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
  IStatsRepository
} from "../repositories/interfaces.js";

const connectionString = process.env.DATABASE_URL;
const isPostgresReady = !!connectionString &&
                        connectionString !== "postgres://localhost:5432/db" &&
                        !connectionString.includes("mock") &&
                        process.env.MOCK_DB !== "true";

let db: any = null;
if (isPostgresReady) {
  console.log(`[DB] Connected to Postgres`);
  const client = postgres(connectionString as string);
  db = drizzle(client, { schema });
} else {
  console.log(`[DB] Database not ready or forced to mock. Using VERCEL KV as fallback backend.`);
}

export class UserRepository implements IUserRepository {
  async saveUser(user: any) {
    if (!isPostgresReady) {
      await kv.set(`pg_mock:user:${user.id}`, user);
      await kv.set(`pg_mock:user_addr:${user.address.toLowerCase()}`, user.id);
      return;
    }
    return await db.insert(schema.users).values(user).onConflictDoUpdate({
      target: schema.users.id,
      set: { updatedAt: new Date() },
    });
  }

  async getUserById(id: string) {
    if (!isPostgresReady) return await kv.get<any>(`pg_mock:user:${id}`);
    return await db.query.users.findFirst({
      where: (users: any, { eq }: any) => eq(users.id, id),
    });
  }

  async getUserByAddress(address: string) {
    if (!isPostgresReady) {
       const id = await kv.get<string>(`pg_mock:user_addr:${address.toLowerCase()}`);
       if (!id) return null;
       return await this.getUserById(id);
    }
    return await db.query.users.findFirst({
      where: (users: any, { eq }: any) => eq(users.address, address.toLowerCase()),
    });
  }
}

export class SessionRepository implements ISessionRepository {
  async saveSession(session: any) {
    if (!isPostgresReady) {
      await kv.set(`pg_mock:session:${session.id}`, session, { ex: 86400 * 7 });
      return;
    }
    return await db.insert(schema.sessions).values(session).onConflictDoUpdate({
      target: schema.sessions.id,
      set: { status: session.status, userId: session.userId, address: session.address, publicKey: session.publicKey },
    });
  }

  async getSessionById(id: string) {
    if (!isPostgresReady) return await kv.get<any>(`pg_mock:session:${id}`);
    return await db.query.sessions.findFirst({
      where: (sessions: any, { eq }: any) => eq(sessions.id, id),
    });
  }
}

export class WalletRepository implements IWalletRepository {
  async getBalance(address: string, token: string = "zhixi") {
    if (!isPostgresReady) {
        const key = token === "yjc" ? `balance_yjc:${address.toLowerCase()}` : `balance:${address.toLowerCase()}`;
        return await kv.get<string>(key) || "0";
    }
    return "0";
  }

  async updateBalance(address: string, amount: string, token: string = "zhixi") {
    if (!isPostgresReady) {
        const key = token === "yjc" ? `balance_yjc:${address.toLowerCase()}` : `balance:${address.toLowerCase()}`;
        await kv.set(key, amount);
        return amount;
    }
    return amount;
  }

  async saveTxIntent(intent: any) {
    if (!isPostgresReady) {
      await kv.set(`pg_mock:tx_intent:${intent.id}`, intent);
      if (intent.status === "pending") {
         await kv.sadd("pg_mock:pending_intents", intent.id);
      } else {
         await kv.srem("pg_mock:pending_intents", intent.id);
      }
      return;
    }
    return await db.insert(schema.txIntents).values(intent);
  }

  async getPendingIntents() {
    if (!isPostgresReady) {
      const ids = await kv.smembers("pg_mock:pending_intents") || [];
      const intents = [];
      for (const id of ids) {
         const intent = await kv.get(`pg_mock:tx_intent:`);
         if (intent) intents.push(intent);
      }
      return intents;
    }
    return await db.query.txIntents.findMany({
      where: (txIntents: any, { eq }: any) => eq(txIntents.status, "pending"),
    });
  }
}

export class MarketRepository implements IMarketRepository {
    async getAccount(address: string) {
        if (!isPostgresReady) {
            return await kv.get<any>(`market_account:${address.toLowerCase()}`);
        }
        return await db.query.marketAccounts.findFirst({
            where: (accounts: any, { eq }: any) => eq(accounts.address, address.toLowerCase()),
        });
    }

    async saveAccount(address: string, account: any) {
        if (!isPostgresReady) {
            await kv.set(`market_account:${address.toLowerCase()}`, account);
            return;
        }
        await db.insert(schema.marketAccounts).values({
            address: address.toLowerCase(),
            data: account,
            updatedAt: new Date(),
        }).onConflictDoUpdate({
            target: schema.marketAccounts.address,
            set: { data: account, updatedAt: new Date() },
        });
    }

    async getMarketSnapshot() {
        if (!isPostgresReady) {
            return await kv.get<any>("market:snapshot");
        }
        return null;
    }

    async saveMarketSnapshot(snapshot: any) {
        if (!isPostgresReady) {
            await kv.set("market:snapshot", snapshot);
        }
    }
}

export class MetaRepository implements IMetaRepository {
  async saveRewardGrant(grant: any) {
    if (!isPostgresReady) {
      await kv.lpush('pg_mock:reward_grants', grant);
      return;
    }
    return await db.insert(schema.rewardGrants).values(grant);
  }

  async saveMarketOrder(order: any) {
    if (!isPostgresReady) {
      await kv.lpush('pg_mock:market_orders', order);
      return;
    }
    return await db.insert(schema.marketTrades).values(order);
  }
}

export class GameRepository implements IGameRepository {
  async saveRound(round: any) {
    if (!isPostgresReady) {
      await kv.set(`pg_mock:game_round:${round.id}`, round, { ex: 86400 * 30 });
      return;
    }
    return await db.insert(schema.gameRounds).values(round).onConflictDoUpdate({
        target: schema.gameRounds.id,
        set: { status: round.status, result: round.result, updatedAt: new Date() },
    });
  }

  async getRoundById(id: string) {
    if (!isPostgresReady) return await kv.get<any>(`pg_mock:game_round:${id}`);
    return await db.query.gameRounds.findFirst({
      where: (gameRounds: any, { eq }: any) => eq(gameRounds.id, id),
    });
  }
}

export class OpsRepository implements IOpsRepository {
  async logEvent(event: any) {
    const log = { ...event, id: crypto.randomUUID(), createdAt: new Date() };
    if (!isPostgresReady) {
      await kv.lpush("pg_mock:ops_events", log);
      await kv.ltrim("pg_mock:ops_events", 0, 1000); // Keep last 1000
      return;
    }
    return await db.insert(schema.opsEvents).values(log);
  }

  async listEvents(options: { limit?: number; userId?: string } = {}) {
    if (!isPostgresReady) {
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
    if (!isPostgresReady) {
      // Mocked for KV-fallback
      return [
        { address: "0x1111...1111", displayName: "賭聖", value: "50000000", avatar: "👑", vipLevel: "創世等級" },
        { address: "0x2222...2222", displayName: "幸運星", value: "20000000", avatar: "🌟", vipLevel: "鑽石等級" },
      ];
    }
    return await db.query.users.findMany({ limit: 10 });
  }
}
