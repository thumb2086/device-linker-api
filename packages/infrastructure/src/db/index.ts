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
import { eq, and, desc, sql as drizzleSql } from "drizzle-orm";

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

const isCoreSchemaReady = async (sql: any) => {
  const [row] = await sql`
    SELECT
      to_regclass('public.users') IS NOT NULL AS "usersExists",
      to_regclass('public.custody_accounts') IS NOT NULL AS "custodyAccountsExists",
      to_regclass('public.sessions') IS NOT NULL AS "sessionsExists",
      to_regclass('public.user_profiles') IS NOT NULL AS "userProfilesExists",
      to_regclass('public.wallet_accounts') IS NOT NULL AS "walletAccountsExists",
      to_regclass('public.wallet_ledger_entries') IS NOT NULL AS "walletLedgerEntriesExists",
      to_regclass('public.tx_intents') IS NOT NULL AS "txIntentsExists",
      to_regclass('public.tx_attempts') IS NOT NULL AS "txAttemptsExists",
      to_regclass('public.tx_receipts') IS NOT NULL AS "txReceiptsExists",
      to_regclass('public.market_accounts') IS NOT NULL AS "marketAccountsExists",
      to_regclass('public.market_trades') IS NOT NULL AS "marketTradesExists",
      to_regclass('public.ops_events') IS NOT NULL AS "opsEventsExists",
      to_regclass('public.announcements') IS NOT NULL AS "announcementsExists",
      to_regclass('public.total_bets') IS NOT NULL AS "totalBetsExists",
      to_regclass('public.leaderboard_kings') IS NOT NULL AS "leaderboardKingsExists",
      to_regclass('public.kv_store') IS NOT NULL AS "kvStoreExists",
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'user_profiles'
          AND column_name = 'sound_prefs'
      ) AS "soundPrefsExists"
  `;

  return Boolean(
    row?.usersExists &&
    row?.custodyAccountsExists &&
    row?.sessionsExists &&
    row?.userProfilesExists &&
    row?.walletAccountsExists &&
    row?.walletLedgerEntriesExists &&
    row?.txIntentsExists &&
    row?.txAttemptsExists &&
    row?.txReceiptsExists &&
    row?.marketAccountsExists &&
    row?.marketTradesExists &&
    row?.opsEventsExists &&
    row?.announcementsExists &&
    row?.totalBetsExists &&
    row?.leaderboardKingsExists &&
    row?.kvStoreExists &&
    row?.soundPrefsExists
  );
};

const reconcileWalletAccountConstraints = async (sql: any) => {
  await sql`
    ALTER TABLE wallet_accounts
    DROP CONSTRAINT IF EXISTS wallet_accounts_address_key
  `;
  await sql`DROP INDEX IF EXISTS wallet_accounts_address_key`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS wallet_addr_token_idx ON wallet_accounts (address, token)`;
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
        const walletAccountsExists = await sql`
          SELECT to_regclass('public.wallet_accounts') IS NOT NULL AS "walletAccountsExists"
        `;
        if (walletAccountsExists[0]?.walletAccountsExists) {
          await reconcileWalletAccountConstraints(sql);
        }

        if (await isCoreSchemaReady(sql)) {
          return;
        }
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
            sound_prefs JSONB DEFAULT '{"amountDisplay":"compact","danmuEnabled":true,"masterVolume":0.7,"bgmEnabled":true,"bgmVolume":0.45,"sfxEnabled":true,"sfxVolume":0.75}',
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `;
        // Migration: Add sound_prefs column if it doesn't exist (for existing tables)
        await sql`
          DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns 
              WHERE table_name = 'user_profiles' AND column_name = 'sound_prefs'
            ) THEN
              ALTER TABLE user_profiles ADD COLUMN sound_prefs JSONB DEFAULT '{"amountDisplay":"compact","danmuEnabled":true,"masterVolume":0.7,"bgmEnabled":true,"bgmVolume":0.45,"sfxEnabled":true,"sfxVolume":0.75}';
            END IF;
          END $$;
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
        await reconcileWalletAccountConstraints(sql);
        await sql`
          CREATE TABLE IF NOT EXISTS wallet_ledger_entries (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id),
            address TEXT NOT NULL,
            token TEXT NOT NULL,
            type TEXT NOT NULL,
            amount NUMERIC NOT NULL,
            balance_before NUMERIC,
            balance_after NUMERIC,
            game TEXT,
            round_id UUID,
            tx_intent_id UUID,
            tx_hash TEXT,
            request_id TEXT,
            meta JSONB,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `;
        await sql`
          CREATE TABLE IF NOT EXISTS tx_intents (
            id UUID PRIMARY KEY,
            user_id UUID NOT NULL REFERENCES users(id),
            address TEXT NOT NULL,
            token TEXT NOT NULL,
            type TEXT NOT NULL,
            amount NUMERIC NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            error_code TEXT,
            error_stage TEXT,
            request_id TEXT,
            round_id UUID,
            game TEXT,
            tx_hash TEXT,
            contract_address TEXT,
            retry_count INTEGER DEFAULT 0,
            meta JSONB,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `;
        await sql`
          CREATE TABLE IF NOT EXISTS tx_attempts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tx_intent_id UUID NOT NULL REFERENCES tx_intents(id),
            attempt_number INTEGER NOT NULL,
            status TEXT NOT NULL,
            tx_hash TEXT,
            error TEXT,
            error_code TEXT,
            broadcast_at TIMESTAMP,
            confirmed_at TIMESTAMP,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `;
        await sql`
          CREATE TABLE IF NOT EXISTS tx_receipts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tx_intent_id UUID NOT NULL UNIQUE REFERENCES tx_intents(id),
            tx_hash TEXT NOT NULL,
            block_number BIGINT,
            status TEXT NOT NULL,
            gas_used TEXT,
            confirmed_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `;
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
          CREATE TABLE IF NOT EXISTS market_trades (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id),
            address TEXT NOT NULL,
            type TEXT NOT NULL,
            symbol TEXT,
            quantity NUMERIC,
            price NUMERIC,
            amount NUMERIC,
            fee NUMERIC,
            pnl NUMERIC,
            meta JSONB,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
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
          CREATE TABLE IF NOT EXISTS announcements (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            announcement_id TEXT NOT NULL UNIQUE,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            is_pinned BOOLEAN DEFAULT FALSE,
            is_active BOOLEAN DEFAULT TRUE,
            published_by TEXT,
            updated_by TEXT,
            published_at TIMESTAMP,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `;
        await sql`
          CREATE TABLE IF NOT EXISTS total_bets (
            period_type TEXT NOT NULL,
            period_id TEXT NOT NULL,
            address TEXT NOT NULL,
            amount BIGINT DEFAULT 0,
            PRIMARY KEY (period_type, period_id, address)
          )
        `;
        await sql`CREATE INDEX IF NOT EXISTS total_bets_address_idx ON total_bets (address)`;
        await sql`
          CREATE TABLE IF NOT EXISTS leaderboard_kings (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            category TEXT NOT NULL,
            user_id UUID NOT NULL REFERENCES users(id),
            address TEXT NOT NULL,
            display_name TEXT,
            win_count INTEGER NOT NULL DEFAULT 0,
            last_win_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            period_id TEXT
          )
        `;
        await sql`CREATE INDEX IF NOT EXISTS leaderboard_kings_category_user_idx ON leaderboard_kings (category, user_id)`;
        await sql`CREATE INDEX IF NOT EXISTS leaderboard_kings_address_idx ON leaderboard_kings (address)`;
        await sql`
          CREATE TABLE IF NOT EXISTS kv_store (
            key TEXT PRIMARY KEY,
            value JSONB NOT NULL,
            expires_at TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `;
        await sql`
          CREATE TABLE IF NOT EXISTS reward_catalog (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            item_id TEXT NOT NULL UNIQUE,
            type TEXT NOT NULL,
            name TEXT NOT NULL,
            rarity TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT 'admin',
            description TEXT,
            icon TEXT,
            price NUMERIC,
            is_active BOOLEAN DEFAULT TRUE,
            meta JSONB,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `;
        await sql`
          CREATE TABLE IF NOT EXISTS reward_submissions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            submission_id TEXT NOT NULL UNIQUE,
            user_id UUID NOT NULL REFERENCES users(id),
            address TEXT NOT NULL,
            type TEXT NOT NULL,
            name TEXT NOT NULL,
            icon TEXT,
            description TEXT,
            rarity TEXT NOT NULL DEFAULT 'common',
            status TEXT NOT NULL DEFAULT 'pending',
            reviewed_by TEXT,
            review_note TEXT,
            approved_item_id TEXT,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `;
        await sql`CREATE INDEX IF NOT EXISTS reward_submissions_status_idx ON reward_submissions (status, created_at DESC)`;
        await sql`CREATE INDEX IF NOT EXISTS reward_submissions_user_idx ON reward_submissions (user_id, created_at DESC)`;
        await sql`
          CREATE TABLE IF NOT EXISTS reward_campaigns (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            campaign_id TEXT NOT NULL UNIQUE,
            title TEXT NOT NULL,
            description TEXT,
            is_active BOOLEAN DEFAULT TRUE,
            start_at TIMESTAMP,
            end_at TIMESTAMP,
            required_level TEXT,
            max_claims_total INTEGER,
            max_claims_per_user INTEGER DEFAULT 1,
            rewards JSONB NOT NULL DEFAULT '{}',
            created_by TEXT,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `;
        await sql`CREATE INDEX IF NOT EXISTS reward_campaigns_active_idx ON reward_campaigns (is_active, created_at DESC)`;
        await sql`
          CREATE TABLE IF NOT EXISTS reward_campaign_claims (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            campaign_id TEXT NOT NULL,
            user_id UUID NOT NULL,
            address TEXT NOT NULL,
            claimed_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `;
        await sql`CREATE INDEX IF NOT EXISTS reward_campaign_claims_user_idx ON reward_campaign_claims (campaign_id, user_id)`;
        await sql`
          CREATE TABLE IF NOT EXISTS reward_grant_logs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            target_address TEXT NOT NULL,
            operator_address TEXT,
            source TEXT NOT NULL,
            note TEXT,
            bundle JSONB NOT NULL DEFAULT '{}',
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `;
        await sql`CREATE INDEX IF NOT EXISTS reward_grant_logs_target_idx ON reward_grant_logs (target_address, created_at DESC)`;
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

export const requireDb = async () => {
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
    const normalizedAddress = String(user.address || "").toLowerCase();
    await conn.insert(schema.users).values({
      ...user,
      address: normalizedAddress,
    }).onConflictDoUpdate({
      target: schema.users.id,
      set: {
        address: normalizedAddress,
        displayName: user.displayName ?? null,
        isAdmin: user.isAdmin ?? false,
        isBlacklisted: user.isBlacklisted ?? false,
        blacklistReason: user.blacklistReason ?? null,
        blacklistedAt: user.blacklistedAt ?? null,
        blacklistedBy: user.blacklistedBy ?? null,
        updatedAt: new Date(),
      },
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
    const user = await this.getUserById(userId);
    if (!user?.address) throw new Error("User not found while saving profile");
    const current = await this.getUserProfile(userId);
    const nextAddress = current?.address || user.address;
    const nextPayload = {
      ...data,
      address: nextAddress,
      updatedAt: new Date(),
    };

    if (current?.id) {
      await conn
        .update(schema.userProfiles)
        .set(nextPayload)
        .where(eq(schema.userProfiles.id, current.id));
      return;
    }

    await conn.insert(schema.userProfiles).values({
      userId,
      address: nextAddress,
      ...data,
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
    const session = await conn.query.sessions.findFirst({ where: (sessions: any, { eq }: any) => eq(sessions.id, id) });
    if (!session) return null;

    // Backfill non-custody/live authorized sessions that have address but no bound user yet.
    if (session.status === "authorized" && session.address && !session.userId) {
      const normalizedAddress = session.address.toLowerCase();
      let user = await conn.query.users.findFirst({
        where: (users: any, { eq }: any) => eq(users.address, normalizedAddress)
      });

      if (!user) {
        const userId = randomUUID();
        await conn.insert(schema.users).values({
          id: userId,
          address: normalizedAddress,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        user = { id: userId };
      }

      await conn
        .update(schema.sessions)
        .set({ userId: user.id, address: normalizedAddress })
        .where(eq(schema.sessions.id, id));

      return { ...session, userId: user.id, address: normalizedAddress };
    }

    return session;
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
        const user = await conn.query.users.findFirst({ where: (u: any, { eq }: any) => eq(u.id, intent.userId) });
        const rawRoundId = intent.roundId ? String(intent.roundId) : null;
        const payload = {
          ...intent,
          address: intent.address || user?.address || "",
          roundId: rawRoundId && UUID_PATTERN.test(rawRoundId) ? rawRoundId : null,
          meta: rawRoundId && !UUID_PATTERN.test(rawRoundId)
            ? { ...(intent.meta || {}), externalRoundId: rawRoundId }
            : intent.meta,
        };
        await conn.insert((schema as any).txIntents).values(payload).onConflictDoUpdate({
          target: (schema as any).txIntents.id,
          set: {
            status: payload.status,
            txHash: payload.txHash,
            updatedAt: new Date(),
            address: payload.address
          }
        });
    } catch(e) {
      console.error("saveTxIntent failed", {
        intentId: intent?.id,
        userId: intent?.userId,
        roundId: intent?.roundId,
        error: e,
      });
      throw e;
    }
  }

  async getPendingIntents() {
    const conn = await requireDb();
    try {
        return await conn.query.txIntents.findMany({ where: (txIntents: any, { eq }: any) => eq(txIntents.status, "pending") });
    } catch(e) { return []; }
  }

  async listTxIntents(options: { address?: string; limit?: number } = {}) {
    const conn = await requireDb();
    const address = options.address?.toLowerCase();
    try {
      return await conn.query.txIntents.findMany({
        where: address
          ? (txIntents: any, { eq }: any) => eq(txIntents.address, address)
          : undefined,
        limit: options.limit || 50,
        orderBy: (txIntents: any, { desc }: any) => [desc(txIntents.createdAt)],
      });
    } catch (e) { return []; }
  }

  async getTxIntentsByRoundId(roundId: string) {
    const conn = await requireDb();
    try {
      return await conn.query.txIntents.findMany({
        where: (txIntents: any, { eq, or, and }: any) => or(
          eq(txIntents.roundId, roundId),
          and(
            eq((txIntents.meta as any)?.externalRoundId, roundId),
            eq(txIntents.roundId, null)
          )
        ),
        orderBy: (txIntents: any, { desc }: any) => [desc(txIntents.createdAt)],
      });
    } catch (e) { return []; }
  }

  async saveTxAttempt(attempt: any) {
    const conn = await requireDb();
    await conn.insert((schema as any).txAttempts).values(attempt).onConflictDoNothing();
  }

  async saveTxReceipt(receipt: any) {
    const conn = await requireDb();
    await conn.insert((schema as any).txReceipts).values(receipt).onConflictDoUpdate({
      target: (schema as any).txReceipts.txIntentId,
      set: {
        txHash: receipt.txHash,
        blockNumber: receipt.blockNumber,
        status: receipt.status,
        gasUsed: receipt.gasUsed,
        confirmedAt: receipt.confirmedAt ?? new Date(),
      }
    });
  }

  async saveLedgerEntry(entry: any) {
    const conn = await requireDb();
    await conn.insert((schema as any).walletLedgerEntries).values(entry);
  }

  async listLedgerEntries(options: { address?: string; limit?: number } = {}) {
    const conn = await requireDb();
    const address = options.address?.toLowerCase();
    return await conn.query.walletLedgerEntries.findMany({
      where: address
        ? (entries: any, { eq }: any) => eq(entries.address, address)
        : undefined,
      limit: options.limit || 50,
      orderBy: (entries: any, { desc }: any) => [desc(entries.createdAt)],
    });
  }
}

export class MarketRepository implements IMarketRepository {
    async getAccount(address: string) {
        const conn = await requireDb();
        const account = await conn.query.marketAccounts.findFirst({ where: (accounts: any, { eq }: any) => eq(accounts.address, address.toLowerCase()) });
        return account?.data ?? null;
    }
    async saveAccount(address: string, userId: string, account: any) {
        const conn = await requireDb();
        await conn.insert(schema.marketAccounts).values({ address: address.toLowerCase(), userId: userId, data: account, updatedAt: new Date() })
           .onConflictDoUpdate({ target: schema.marketAccounts.address, set: { data: account, updatedAt: new Date() } });
    }
    async getMarketSnapshot() { return await kv.get<any>("market:snapshot"); }
    async saveMarketSnapshot(snapshot: any) { await kv.set("market:snapshot", snapshot); }
    async saveTrade(trade: any) {
        const conn = await requireDb();
        await conn.insert((schema as any).marketTrades).values(trade);
    }
    async listTrades(options: { address?: string; limit?: number } = {}) {
        const conn = await requireDb();
        const address = options.address?.toLowerCase();
        return await conn.query.marketTrades.findMany({
          where: address
            ? (trades: any, { eq }: any) => eq(trades.address, address)
            : undefined,
          limit: options.limit || 50,
          orderBy: (trades: any, { desc }: any) => [desc(trades.createdAt)],
        });
    }
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
    const rawRoundId = event?.roundId ? String(event.roundId) : null;
    const rawTxIntentId = event?.txIntentId ? String(event.txIntentId) : null;
    const log = {
      ...event,
      id: randomUUID(),
      roundId: rawRoundId && UUID_PATTERN.test(rawRoundId) ? rawRoundId : null,
      txIntentId: rawTxIntentId && UUID_PATTERN.test(rawTxIntentId) ? rawTxIntentId : null,
      meta: rawRoundId && !UUID_PATTERN.test(rawRoundId)
        ? { ...(event?.meta || {}), externalRoundId: rawRoundId }
        : event?.meta,
      createdAt: new Date()
    };
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
    const rows = await conn.execute(
      drizzleSql`
        SELECT
          username,
          password_hash AS "passwordHash",
          salt_hex AS "saltHex",
          address,
          public_key AS "publicKey",
          user_id AS "userId",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM custody_accounts
        WHERE lower(username) = ${normalizedUsername}
        LIMIT 1
      `
    );
    return rows[0] ?? null;
  }

  async getLegacyCustodyUser(username: string) {
    const conn = await requireDb();
    const normalizedUsername = username.toLowerCase();
    const tableExists = await conn.execute(
      drizzleSql`SELECT to_regclass('public.custody_users') AS "tableName"`
    );
    if (!tableExists[0]?.tableName) return null;

    const rows = await conn.execute(
      drizzleSql`
        SELECT
          username,
          password_hash AS "passwordHash",
          salt_hex AS "saltHex",
          address,
          raw
        FROM custody_users
        WHERE lower(username) = ${normalizedUsername}
        LIMIT 1
      `
    );
    const legacy = rows[0];

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

export class RewardCatalogRepository {
  async listItems(options: { type?: string; includeInactive?: boolean } = {}) {
    const conn = await requireDb();
    try {
      const rows = await conn.query.rewardCatalog.findMany({
        where: (rc: any, { eq, and }: any) => {
          const preds: any[] = [];
          if (options.type) preds.push(eq(rc.type, options.type));
          if (!options.includeInactive) preds.push(eq(rc.isActive, true));
          if (!preds.length) return undefined;
          return preds.length === 1 ? preds[0] : and(...preds);
        },
        orderBy: (rc: any, { asc, desc }: any) => [asc(rc.type), desc(rc.createdAt)],
      });
      return rows || [];
    } catch (_e) {
      return [];
    }
  }

  async getByItemId(itemId: string) {
    const conn = await requireDb();
    try {
      return await conn.query.rewardCatalog.findFirst({
        where: (rc: any, { eq }: any) => eq(rc.itemId, itemId),
      });
    } catch (_e) {
      return null;
    }
  }

  async upsertItem(item: {
    itemId: string;
    type: string;
    name: string;
    rarity: string;
    source?: string;
    description?: string | null;
    icon?: string | null;
    price?: string | number | null;
    isActive?: boolean;
    meta?: any;
  }) {
    const conn = await requireDb();
    const values: any = {
      itemId: item.itemId,
      type: item.type,
      name: item.name,
      rarity: item.rarity,
      source: item.source || "admin",
      description: item.description ?? null,
      icon: item.icon ?? null,
      price: item.price == null ? null : String(item.price),
      isActive: item.isActive ?? true,
      meta: item.meta ?? null,
      updatedAt: new Date(),
    };
    await conn
      .insert(schema.rewardCatalog)
      .values({ ...values, id: randomUUID(), createdAt: new Date() })
      .onConflictDoUpdate({
        target: schema.rewardCatalog.itemId,
        set: values,
      });
    return await this.getByItemId(item.itemId);
  }

  async setActive(itemId: string, isActive: boolean) {
    const conn = await requireDb();
    await conn
      .update(schema.rewardCatalog)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(schema.rewardCatalog.itemId, itemId));
    return await this.getByItemId(itemId);
  }

  async deleteItem(itemId: string) {
    const conn = await requireDb();
    await conn.delete(schema.rewardCatalog).where(eq(schema.rewardCatalog.itemId, itemId));
    return true;
  }
}

export class RewardSubmissionRepository {
  async create(submission: {
    submissionId: string;
    userId: string;
    address: string;
    type: string; // avatar | title
    name: string;
    icon?: string | null;
    description?: string | null;
    rarity?: string;
  }) {
    const conn = await requireDb();
    await conn.insert(schema.rewardSubmissions).values({
      id: randomUUID(),
      submissionId: submission.submissionId,
      userId: submission.userId,
      address: submission.address,
      type: submission.type,
      name: submission.name,
      icon: submission.icon ?? null,
      description: submission.description ?? null,
      rarity: submission.rarity ?? "common",
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async listByStatus(status: string | null, limit = 100) {
    const conn = await requireDb();
    return await conn.query.rewardSubmissions.findMany({
      where: (s: any, { eq }: any) => (status ? eq(s.status, status) : undefined),
      orderBy: (s: any, { desc }: any) => [desc(s.createdAt)],
      limit,
    });
  }

  async listByUser(userId: string, limit = 50) {
    const conn = await requireDb();
    return await conn.query.rewardSubmissions.findMany({
      where: (s: any, { eq }: any) => eq(s.userId, userId),
      orderBy: (s: any, { desc }: any) => [desc(s.createdAt)],
      limit,
    });
  }

  async getById(submissionId: string) {
    const conn = await requireDb();
    return await conn.query.rewardSubmissions.findFirst({
      where: (s: any, { eq }: any) => eq(s.submissionId, submissionId),
    });
  }

  async updateStatus(
    submissionId: string,
    fields: { status: string; reviewedBy?: string; reviewNote?: string; approvedItemId?: string }
  ) {
    const conn = await requireDb();
    await conn
      .update(schema.rewardSubmissions)
      .set({
        status: fields.status,
        reviewedBy: fields.reviewedBy ?? null,
        reviewNote: fields.reviewNote ?? null,
        approvedItemId: fields.approvedItemId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(schema.rewardSubmissions.submissionId, submissionId));
  }
}

export class RewardCampaignRepository {
  async listAll(limit = 200) {
    const conn = await requireDb();
    return await conn.query.rewardCampaigns.findMany({
      orderBy: (c: any, { desc }: any) => [desc(c.createdAt)],
      limit,
    });
  }

  async listActive(limit = 50) {
    const conn = await requireDb();
    return await conn.query.rewardCampaigns.findMany({
      where: (c: any, { eq }: any) => eq(c.isActive, true),
      orderBy: (c: any, { desc }: any) => [desc(c.createdAt)],
      limit,
    });
  }

  async getById(campaignId: string) {
    const conn = await requireDb();
    return await conn.query.rewardCampaigns.findFirst({
      where: (c: any, { eq }: any) => eq(c.campaignId, campaignId),
    });
  }

  async upsert(record: {
    campaignId: string;
    title: string;
    description?: string | null;
    isActive?: boolean;
    startAt?: Date | null;
    endAt?: Date | null;
    claimLimitPerUser?: number;
    minLevel?: string | null;
    rewards: any;
    createdBy?: string | null;
  }) {
    const conn = await requireDb();
    const existing = await this.getById(record.campaignId);
    if (existing) {
      await conn
        .update(schema.rewardCampaigns)
        .set({
          title: record.title,
          description: record.description ?? null,
          isActive: record.isActive ?? true,
          startAt: record.startAt ?? null,
          endAt: record.endAt ?? null,
          maxClaimsPerUser: record.claimLimitPerUser ?? 1,
          requiredLevel: record.minLevel ?? null,
          rewards: record.rewards,
          updatedAt: new Date(),
        })
        .where(eq(schema.rewardCampaigns.campaignId, record.campaignId));
      return await this.getById(record.campaignId);
    }
    await conn.insert(schema.rewardCampaigns).values({
      id: randomUUID(),
      campaignId: record.campaignId,
      title: record.title,
      description: record.description ?? null,
      isActive: record.isActive ?? true,
      startAt: record.startAt ?? null,
      endAt: record.endAt ?? null,
      maxClaimsPerUser: record.claimLimitPerUser ?? 1,
      requiredLevel: record.minLevel ?? null,
      rewards: record.rewards,
      createdBy: record.createdBy ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return await this.getById(record.campaignId);
  }

  async delete(campaignId: string) {
    const conn = await requireDb();
    await conn.delete(schema.rewardCampaigns).where(eq(schema.rewardCampaigns.campaignId, campaignId));
  }

  async countClaims(campaignId: string, userId: string): Promise<number> {
    const conn = await requireDb();
    const rows = await conn.query.rewardCampaignClaims.findMany({
      where: (c: any, { and, eq }: any) => and(eq(c.campaignId, campaignId), eq(c.userId, userId)),
      limit: 100,
    });
    return rows?.length ?? 0;
  }

  async recordClaim(record: { campaignId: string; userId: string; address: string }) {
    const conn = await requireDb();
    await conn.insert(schema.rewardCampaignClaims).values({
      id: randomUUID(),
      campaignId: record.campaignId,
      userId: record.userId,
      address: record.address,
      claimedAt: new Date(),
    });
  }

  async logGrant(record: {
    targetAddress: string;
    operatorAddress?: string | null;
    source: string;
    note?: string | null;
    bundle: any;
  }) {
    const conn = await requireDb();
    await conn.insert(schema.rewardGrantLogs).values({
      id: randomUUID(),
      targetAddress: record.targetAddress,
      operatorAddress: record.operatorAddress ?? null,
      source: record.source,
      note: record.note ?? null,
      bundle: record.bundle,
      createdAt: new Date(),
    });
  }

  async listGrantLogs(limit = 100) {
    const conn = await requireDb();
    return await conn.query.rewardGrantLogs.findMany({
      orderBy: (g: any, { desc }: any) => [desc(g.createdAt)],
      limit,
    });
  }
}

export class AnnouncementRepository {
  private async getAnnouncementColumns(conn: any): Promise<Set<string>> {
    const rows = await conn.execute(
      drizzleSql`
        SELECT column_name AS "columnName"
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'announcements'
      `
    );
    return new Set((rows || []).map((row: any) => String(row.columnName || "").toLowerCase()));
  }

  async listActiveAnnouncements() {
    const conn = await requireDb();
    const columns = await this.getAnnouncementColumns(conn);
    const hasModernColumns = columns.has("announcement_id") && columns.has("is_pinned");
    if (!hasModernColumns) {
      const hasPinned = columns.has("is_pinned");
      const hasActive = columns.has("is_active");
      const hasPublishedBy = columns.has("published_by");
      const hasUpdatedBy = columns.has("updated_by");
      const hasPublishedAt = columns.has("published_at");
      const hasUpdatedAt = columns.has("updated_at");

      const rows = await conn.execute(
        drizzleSql.raw(`
          SELECT
            id,
            id AS "announcementId",
            title,
            content,
            ${hasPinned ? `is_pinned` : `FALSE`} AS "isPinned",
            ${hasActive ? `is_active` : `TRUE`} AS "isActive",
            ${hasPublishedBy ? `published_by` : `NULL`} AS "publishedBy",
            ${hasUpdatedBy ? `updated_by` : `NULL`} AS "updatedBy",
            ${hasPublishedAt ? `published_at` : `created_at`} AS "publishedAt",
            created_at AS "createdAt",
            ${hasUpdatedAt ? `updated_at` : `created_at`} AS "updatedAt"
          FROM announcements
          WHERE ${hasActive ? `is_active IS DISTINCT FROM FALSE` : `TRUE`}
          ORDER BY ${hasPinned ? `is_pinned DESC,` : ``} ${hasPublishedAt ? `published_at DESC NULLS LAST,` : ``} created_at DESC
        `)
      );
      return rows;
    }
    return await conn.query.announcements.findMany({
      where: (announcements: any, { eq }: any) => eq(announcements.isActive, true),
      orderBy: (announcements: any, { desc }: any) => [
        desc(announcements.isPinned),
        desc(announcements.publishedAt),
        desc(announcements.createdAt),
      ],
    });
  }

  async listAllAnnouncements(limit: number = 50) {
    const conn = await requireDb();
    const columns = await this.getAnnouncementColumns(conn);
    const hasModernColumns = columns.has("announcement_id") && columns.has("is_pinned");
    if (!hasModernColumns) {
      const hasPinned = columns.has("is_pinned");
      const hasActive = columns.has("is_active");
      const hasPublishedBy = columns.has("published_by");
      const hasUpdatedBy = columns.has("updated_by");
      const hasPublishedAt = columns.has("published_at");
      const hasUpdatedAt = columns.has("updated_at");
      const safeLimit = Math.max(1, Math.min(500, Number(limit || 50)));
      const rows = await conn.execute(
        drizzleSql.raw(`
          SELECT
            id,
            id AS "announcementId",
            title,
            content,
            ${hasPinned ? `is_pinned` : `FALSE`} AS "isPinned",
            ${hasActive ? `is_active` : `TRUE`} AS "isActive",
            ${hasPublishedBy ? `published_by` : `NULL`} AS "publishedBy",
            ${hasUpdatedBy ? `updated_by` : `NULL`} AS "updatedBy",
            ${hasPublishedAt ? `published_at` : `created_at`} AS "publishedAt",
            created_at AS "createdAt",
            ${hasUpdatedAt ? `updated_at` : `created_at`} AS "updatedAt"
          FROM announcements
          ORDER BY ${hasPinned ? `is_pinned DESC,` : ``} ${hasPublishedAt ? `published_at DESC NULLS LAST,` : ``} created_at DESC
          LIMIT ${safeLimit}
        `)
      );
      return rows;
    }
    return await conn.query.announcements.findMany({
      limit,
      orderBy: (announcements: any, { desc }: any) => [
        desc(announcements.isPinned),
        desc(announcements.publishedAt),
        desc(announcements.createdAt),
      ],
    });
  }

  async saveAnnouncement(announcement: {
    id?: string;
    announcementId: string;
    title: string;
    content: string;
    isPinned?: boolean;
    isActive?: boolean;
    publishedBy?: string | null;
    updatedBy?: string | null;
    publishedAt?: string | Date | null;
    createdAt?: string | Date | null;
    updatedAt?: string | Date | null;
  }) {
    const conn = await requireDb();
    const columns = await this.getAnnouncementColumns(conn);
    const hasModernColumns = columns.has("announcement_id") && columns.has("is_pinned");
    if (!hasModernColumns) {
      const hasPinned = columns.has("is_pinned");
      const hasActive = columns.has("is_active");
      const hasPublishedBy = columns.has("published_by");
      const hasUpdatedBy = columns.has("updated_by");
      const hasPublishedAt = columns.has("published_at");
      const hasUpdatedAt = columns.has("updated_at");
      const fields = ["id", "title", "content", "created_at"];
      const values: string[] = [
        `'${String(announcement.id || randomUUID()).replace(/'/g, "''")}'`,
        `'${String(announcement.title || "").replace(/'/g, "''")}'`,
        `'${String(announcement.content || "").replace(/'/g, "''")}'`,
        `'${(announcement.createdAt ? new Date(announcement.createdAt) : new Date()).toISOString()}'`,
      ];
      if (hasPinned) {
        fields.push("is_pinned");
        values.push(announcement.isPinned ? "TRUE" : "FALSE");
      }
      if (hasActive) {
        fields.push("is_active");
        values.push((announcement.isActive ?? true) ? "TRUE" : "FALSE");
      }
      if (hasPublishedBy) {
        fields.push("published_by");
        values.push(announcement.publishedBy ? `'${String(announcement.publishedBy).replace(/'/g, "''")}'` : "NULL");
      }
      if (hasUpdatedBy) {
        fields.push("updated_by");
        values.push((announcement.updatedBy || announcement.publishedBy)
          ? `'${String(announcement.updatedBy || announcement.publishedBy).replace(/'/g, "''")}'`
          : "NULL");
      }
      if (hasPublishedAt) {
        fields.push("published_at");
        values.push(`'${(announcement.publishedAt ? new Date(announcement.publishedAt) : new Date()).toISOString()}'`);
      }
      if (hasUpdatedAt) {
        fields.push("updated_at");
        values.push(`'${(announcement.updatedAt ? new Date(announcement.updatedAt) : new Date()).toISOString()}'`);
      }

      await conn.execute(
        drizzleSql.raw(`
          INSERT INTO announcements (${fields.join(", ")})
          VALUES (${values.join(", ")})
        `)
      );
      return;
    }

    await conn.insert(schema.announcements).values({
      id: announcement.id || randomUUID(),
      announcementId: announcement.announcementId,
      title: announcement.title,
      content: announcement.content,
      isPinned: announcement.isPinned ?? false,
      isActive: announcement.isActive ?? true,
      publishedBy: announcement.publishedBy || null,
      updatedBy: announcement.updatedBy || announcement.publishedBy || null,
      publishedAt: announcement.publishedAt ? new Date(announcement.publishedAt) : new Date(),
      createdAt: announcement.createdAt ? new Date(announcement.createdAt) : new Date(),
      updatedAt: announcement.updatedAt ? new Date(announcement.updatedAt) : new Date(),
    }).onConflictDoUpdate({
      target: schema.announcements.announcementId,
      set: {
        title: announcement.title,
        content: announcement.content,
        isPinned: announcement.isPinned ?? false,
        isActive: announcement.isActive ?? true,
        publishedBy: announcement.publishedBy || null,
        updatedBy: announcement.updatedBy || announcement.publishedBy || null,
        publishedAt: announcement.publishedAt ? new Date(announcement.publishedAt) : new Date(),
        updatedAt: announcement.updatedAt ? new Date(announcement.updatedAt) : new Date(),
      }
    });
  }

  async updateFields(
    announcementId: string,
    fields: {
      title?: string;
      content?: string;
      isPinned?: boolean;
      isActive?: boolean;
      updatedBy?: string | null;
    }
  ) {
    const conn = await requireDb();
    const columns = await this.getAnnouncementColumns(conn);
    const set: Record<string, any> = {};
    if (columns.has("updated_at")) set.updatedAt = new Date();
    if (fields.title !== undefined) set.title = fields.title;
    if (fields.content !== undefined) set.content = fields.content;
    if (fields.isPinned !== undefined && columns.has("is_pinned")) set.isPinned = fields.isPinned;
    if (fields.isActive !== undefined && columns.has("is_active")) set.isActive = fields.isActive;
    if (fields.updatedBy !== undefined && columns.has("updated_by")) set.updatedBy = fields.updatedBy;
    const whereKey = columns.has("announcement_id") ? "announcementId" : "id";
    await conn
      .update(schema.announcements)
      .set(set)
      .where(eq((schema.announcements as any)[whereKey], announcementId));
  }

  async deleteAnnouncement(announcementId: string) {
    const conn = await requireDb();
    const columns = await this.getAnnouncementColumns(conn);
    const whereKey = columns.has("announcement_id") ? "announcementId" : "id";
    await conn
      .delete(schema.announcements)
      .where(eq((schema.announcements as any)[whereKey], announcementId));
  }
}
