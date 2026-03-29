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
let ensureCoreSchemaPromise: Promise<void> | null = null;

const normalizeLegacyIdentityData = async (sql: any) => {
  const [{ custodyUsersExists }] = await sql`
    SELECT to_regclass('public.custody_users') IS NOT NULL AS "custodyUsersExists"
  `;

  if (custodyUsersExists) {
    await sql`
      INSERT INTO users (id, address, display_name, created_at, updated_at)
      SELECT
        gen_random_uuid(),
        lower(cu.address),
        lower(cu.username),
        NOW(),
        NOW()
      FROM custody_users cu
      LEFT JOIN users u ON lower(u.address) = lower(cu.address)
      WHERE cu.username IS NOT NULL
        AND cu.address IS NOT NULL
        AND u.id IS NULL
    `;

    await sql`
      INSERT INTO custody_accounts (
        id,
        username,
        password_hash,
        salt_hex,
        address,
        public_key,
        user_id,
        created_at,
        updated_at
      )
      SELECT
        gen_random_uuid(),
        lower(cu.username),
        cu.password_hash,
        cu.salt_hex,
        lower(cu.address),
        COALESCE(cu.raw ->> 'publicKey', cu.raw ->> 'public_key'),
        u.id,
        NOW(),
        NOW()
      FROM custody_users cu
      LEFT JOIN users u ON lower(u.address) = lower(cu.address)
      WHERE cu.username IS NOT NULL
        AND cu.password_hash IS NOT NULL
        AND cu.salt_hex IS NOT NULL
        AND cu.address IS NOT NULL
      ON CONFLICT (username) DO UPDATE
      SET
        password_hash = EXCLUDED.password_hash,
        salt_hex = EXCLUDED.salt_hex,
        address = EXCLUDED.address,
        public_key = COALESCE(EXCLUDED.public_key, custody_accounts.public_key),
        user_id = COALESCE(EXCLUDED.user_id, custody_accounts.user_id),
        updated_at = NOW()
    `;
  }

  const [{ displayNamesExists }] = await sql`
    SELECT to_regclass('public.display_names') IS NOT NULL AS "displayNamesExists"
  `;

  if (displayNamesExists) {
    await sql`
      UPDATE users u
      SET
        display_name = d.display_name,
        updated_at = NOW()
      FROM display_names d
      WHERE lower(u.address) = lower(d.address)
        AND d.display_name IS NOT NULL
        AND trim(d.display_name) <> ''
    `;
  }

  await sql`
    UPDATE custody_accounts ca
    SET
      user_id = u.id,
      updated_at = NOW()
    FROM users u
    WHERE ca.user_id IS NULL
      AND lower(ca.address) = lower(u.address)
  `;
};

const ensureCoreSchema = async () => {
  if (!connectionString || connectionString.includes("mock")) return;
  if (!ensureCoreSchemaPromise) {
    ensureCoreSchemaPromise = (async () => {
      const sql = postgres(connectionString, {
        ssl: "require",
        max: 1,
        idle_timeout: 5,
        connect_timeout: 10,
      });
      try {
        await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
        await sql`
          CREATE TABLE IF NOT EXISTS users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            address TEXT NOT NULL UNIQUE,
            display_name TEXT,
            is_admin BOOLEAN DEFAULT FALSE,
            is_blacklisted BOOLEAN DEFAULT FALSE,
            blacklist_reason TEXT,
            blacklisted_at TIMESTAMP,
            blacklisted_by TEXT,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `;
        await sql`
          CREATE TABLE IF NOT EXISTS custody_accounts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            salt_hex TEXT NOT NULL,
            address TEXT NOT NULL UNIQUE,
            public_key TEXT,
            user_id UUID REFERENCES users(id),
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `;
        await sql`
          CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            user_id UUID REFERENCES users(id),
            address TEXT,
            status TEXT NOT NULL,
            public_key TEXT,
            mode TEXT DEFAULT 'live',
            platform TEXT DEFAULT 'unknown',
            client_type TEXT DEFAULT 'unknown',
            device_id TEXT,
            app_version TEXT,
            account_id TEXT,
            authorized_at TIMESTAMP,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            expires_at TIMESTAMP NOT NULL
          )
        `;
        await sql`
          CREATE TABLE IF NOT EXISTS user_profiles (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) UNIQUE,
            address TEXT NOT NULL UNIQUE,
            selected_avatar_id TEXT DEFAULT 'classic_chip',
            selected_title_id TEXT,
            inventory JSONB DEFAULT '{}',
            owned_avatars JSONB DEFAULT '[]',
            owned_titles JSONB DEFAULT '[]',
            active_buffs JSONB DEFAULT '[]',
            system_title_streaks JSONB DEFAULT '{}',
            win_bias NUMERIC,
            sound_prefs JSONB DEFAULT '{"bgmEnabled":true,"sfxEnabled":true,"volume":0.5}',
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `;
        await sql`
          CREATE TABLE IF NOT EXISTS wallet_accounts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id),
            address TEXT NOT NULL,
            token TEXT NOT NULL DEFAULT 'zhixi',
            balance NUMERIC NOT NULL DEFAULT '0',
            locked_balance NUMERIC NOT NULL DEFAULT '0',
            airdrop_distributed NUMERIC NOT NULL DEFAULT '0',
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `;
        await sql`CREATE UNIQUE INDEX IF NOT EXISTS wallet_addr_token_idx ON wallet_accounts (address, token)`;
        await sql`
          CREATE TABLE IF NOT EXISTS market_accounts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) UNIQUE,
            address TEXT NOT NULL UNIQUE,
            data JSONB NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `;
        await sql`
          CREATE TABLE IF NOT EXISTS ops_events (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            channel TEXT NOT NULL,
            severity TEXT NOT NULL,
            source TEXT NOT NULL,
            kind TEXT NOT NULL,
            request_id TEXT,
            user_id UUID,
            address TEXT,
            game TEXT,
            token TEXT,
            round_id UUID,
            tx_intent_id UUID,
            tx_hash TEXT,
            error_code TEXT,
            error_stage TEXT,
            message TEXT NOT NULL,
            meta JSONB,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `;
        await sql`
          CREATE TABLE IF NOT EXISTS kv_store (
            key TEXT PRIMARY KEY,
            value JSONB NOT NULL,
            expires_at TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `;
        await normalizeLegacyIdentityData(sql);
      } finally {
        await sql.end();
      }
    })().catch((error) => {
      ensureCoreSchemaPromise = null;
      throw error;
    });
  }
  await ensureCoreSchemaPromise;
};

const requireDb = async () => {
  if (!db) throw new Error("Database not initialized");
  await ensureCoreSchema();
  return db;
};

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
    const conn = await requireDb();
    await conn.insert(schema.users).values(user).onConflictDoUpdate({
      target: schema.users.id,
      set: { updatedAt: new Date() },
    });
  }
  async getUserById(id: string) {
    const conn = await requireDb();
    return await conn.query.users.findFirst({ where: (users: any, { eq }: any) => eq(users.id, id) });
  }
  async getUserByAddress(address: string) {
    const conn = await requireDb();
    return await conn.query.users.findFirst({ where: (users: any, { eq }: any) => eq(users.address, address.toLowerCase()) });
  }
  async getUserProfile(userId: string) {
    const conn = await requireDb();
    return await conn.query.userProfiles.findFirst({ where: (p: any, { eq }: any) => eq(p.userId, userId) });
  }
  async saveUserProfile(userId: string, data: any) {
    const conn = await requireDb();
    await conn.insert(schema.userProfiles).values({ userId, ...data }).onConflictDoUpdate({
        target: schema.userProfiles.userId,
        set: { ...data, updatedAt: new Date() }
    });
  }
}

export class SessionRepository implements ISessionRepository {
  async saveSession(session: any) {
    const conn = await requireDb();
    const safeSession = {
      ...session,
      createdAt: session.createdAt ? new Date(session.createdAt) : new Date(),
      expiresAt: session.expiresAt ? new Date(session.expiresAt) : new Date(Date.now() + 3600000),
      authorizedAt: session.authorizedAt ? new Date(session.authorizedAt) : undefined,
    };
    await conn.insert(schema.sessions).values(safeSession).onConflictDoUpdate({
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
    const conn = await requireDb();
    return await conn.query.sessions.findFirst({ where: (sessions: any, { eq }: any) => eq(sessions.id, id) });
  }
}

export class WalletRepository implements IWalletRepository {
  async getBalance(address: string, token: string = "zhixi") {
    const conn = await requireDb();
    const account = await conn.query.walletAccounts.findFirst({
      where: (walletAccounts: any, { and, eq }: any) => and(
        eq(walletAccounts.address, address.toLowerCase()),
        eq(walletAccounts.token, token)
      )
    });
    return account?.balance || "0";
  }

  async updateBalance(address: string, amount: string, token: string = "zhixi") {
    const conn = await requireDb();
    const user = await conn.query.users.findFirst({ where: (u: any, { eq }: any) => eq(u.address, address.toLowerCase()) });
    if (!user) throw new Error("User not found during balance update");

    await conn.insert(schema.walletAccounts).values({
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
    const conn = await requireDb();
    try {
        await conn.insert((schema as any).txIntents).values(intent).onConflictDoUpdate({
          target: (schema as any).txIntents.id,
          set: { status: intent.status, txHash: intent.txHash, updatedAt: new Date() }
        });
    } catch(e) {}
  }

  async getPendingIntents() {
    const conn = await requireDb();
    try {
        return await conn.query.txIntents.findMany({ where: (txIntents: any, { eq }: any) => eq(txIntents.status, "pending") });
    } catch(e) { return []; }
  }
}

export class MarketRepository implements IMarketRepository {
    async getAccount(address: string) {
        const conn = await requireDb();
        return await conn.query.marketAccounts.findFirst({ where: (accounts: any, { eq }: any) => eq(accounts.address, address.toLowerCase()) });
    }
    async saveAccount(address: string, userId: string, account: any) {
        const conn = await requireDb();
        await conn.insert(schema.marketAccounts).values({ address: address.toLowerCase(), userId: userId, data: account, updatedAt: new Date() })
           .onConflictDoUpdate({ target: schema.marketAccounts.address, set: { data: account, updatedAt: new Date() } });
    }
    async getMarketSnapshot() { return await kv.get<any>("market:snapshot"); }
    async saveMarketSnapshot(snapshot: any) { await kv.set("market:snapshot", snapshot); }
}

export class MetaRepository implements IMetaRepository {
  async saveRewardGrant(grant: any) {
    const conn = await requireDb();
    try { await conn.insert((schema as any).rewardGrants).values(grant); } catch(e) {}
  }
  async saveMarketOrder(order: any) {
    const conn = await requireDb();
    try { await conn.insert((schema as any).marketTrades).values(order); } catch(e) {}
  }
}

export class GameRepository implements IGameRepository {
  async saveRound(round: any) {
    const conn = await requireDb();
    try {
        await conn.insert((schema as any).gameRounds).values(round).onConflictDoUpdate({
            target: (schema as any).gameRounds.id,
            set: { status: round.status, result: round.result, updatedAt: new Date() }
        });
    } catch(e) {}
  }
  async getRoundById(id: string) {
    const conn = await requireDb();
    try {
        return await conn.query.gameRounds.findFirst({ where: (gameRounds: any, { eq }: any) => eq(gameRounds.id, id) });
    } catch(e) { return null; }
  }
}

export class OpsRepository implements IOpsRepository {
  async logEvent(event: any) {
    if (!db) {
       console.error("OpsEvent could not be saved to DB:", event);
       return;
    }
    const conn = await requireDb();
    const log = { ...event, id: randomUUID(), createdAt: new Date() };
    await conn.insert(schema.opsEvents).values(log);
  }
  async listEvents(options: { limit?: number; userId?: string } = {}) {
    const conn = await requireDb();
    return await conn.query.opsEvents.findMany({
      where: options.userId ? (opsEvents: any, { eq }: any) => eq(opsEvents.userId, options.userId!) : undefined,
      limit: options.limit || 50,
      orderBy: (opsEvents: any, { desc }: any) => [desc(opsEvents.createdAt)],
    });
  }
}

export class StatsRepository implements IStatsRepository {
  async getLeaderboard(type: "total_bet" | "balance") {
    const conn = await requireDb();
    return await conn.query.users.findMany({ limit: 10 });
  }
}

export class CustodyRepository implements ICustodyRepository {
  async saveCustodyUser(username: string, data: any) {
    const conn = await requireDb();
    const normalizedUsername = username.toLowerCase();
    const normalizedAddress = data.address.toLowerCase();
    let user = await conn.query.users.findFirst({ where: (u: any, { eq }: any) => eq(u.address, normalizedAddress) });
    if (!user) {
        const userId = randomUUID();
        await conn.insert(schema.users).values({ id: userId, address: normalizedAddress, displayName: normalizedUsername, createdAt: new Date(), updatedAt: new Date() });
        user = { id: userId };
    }
    await conn.insert(schema.custodyAccounts).values({
        username: normalizedUsername,
        passwordHash: data.passwordHash,
        saltHex: data.saltHex,
        address: normalizedAddress,
        publicKey: data.publicKey || null,
        userId: user.id,
        updatedAt: new Date()
    }).onConflictDoUpdate({
        target: schema.custodyAccounts.username,
        set: {
          passwordHash: data.passwordHash,
          saltHex: data.saltHex,
          address: normalizedAddress,
          publicKey: data.publicKey || null,
          userId: user.id,
          updatedAt: new Date()
        }
    });
  }
  async getCustodyUser(username: string) {
    const conn = await requireDb();
    const normalizedUsername = username.toLowerCase();
    return await conn.query.custodyAccounts.findFirst({
      where: (c: any, { eq }: any) => eq(c.username, normalizedUsername)
    });
  }

  async getLegacyCustodyUser(username: string) {
    const conn = await requireDb();
    const normalizedUsername = username.toLowerCase();

    const legacy = await (conn.query as any).custodyUsers?.findFirst?.({
      where: (c: any, { eq }: any) => eq(c.username, normalizedUsername)
    });

    if (!legacy?.address || !legacy?.passwordHash || !legacy?.saltHex) return null;

    const raw = legacy.raw && typeof legacy.raw === "object" ? legacy.raw : {};
    return {
      username: normalizedUsername,
      passwordHash: legacy.passwordHash,
      saltHex: legacy.saltHex,
      address: legacy.address,
      publicKey: raw.publicKey || raw.public_key || null,
      createdAt: raw.createdAt || raw.created_at || null,
      updatedAt: raw.updatedAt || raw.updated_at || null,
    };
  }
}
