import { neon } from '@neondatabase/serverless';
import {
  IUserRepository,
  ISessionRepository,
  IWalletRepository,
  ICustodyRepository
} from "./interfaces.js";

// Lazy initialize neon only when used to avoid crash if env is missing
let sqlInstance: any = null;
const getSql = () => {
  if (!sqlInstance) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing");
    sqlInstance = neon(process.env.DATABASE_URL);
  }
  return sqlInstance;
};

export class PostgresUserRepository implements IUserRepository {
  async saveUser(user: any) {
    const sql = getSql();
    const createdAt = user.createdAt ? new Date(user.createdAt) : new Date();
    await sql`
      INSERT INTO users (id, address, display_name, is_admin, is_blacklisted, created_at, updated_at)
      VALUES (${user.id}, ${user.address.toLowerCase()}, ${user.displayName || user.username || null}, ${user.isAdmin || false}, ${user.isBlacklisted || false}, ${createdAt}, NOW())
      ON CONFLICT (id) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        is_admin = EXCLUDED.is_admin,
        is_blacklisted = EXCLUDED.is_blacklisted,
        updated_at = NOW()
    `;
  }

  async getUserById(id: string) {
    const sql = getSql();
    const rows = await sql`SELECT * FROM users WHERE id = ${id} LIMIT 1`;
    if (!rows[0]) return null;
    const row = rows[0];
    return {
        id: row.id,
        address: row.address,
        displayName: row.display_name,
        isAdmin: row.is_admin,
        isBlacklisted: row.is_blacklisted,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
  }

  async getUserByAddress(address: string) {
    const sql = getSql();
    const rows = await sql`SELECT * FROM users WHERE address = ${address.toLowerCase()} LIMIT 1`;
    if (!rows[0]) return null;
    const row = rows[0];
    return {
        id: row.id,
        address: row.address,
        displayName: row.display_name,
        isAdmin: row.is_admin,
        isBlacklisted: row.is_blacklisted,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
  }

  async getUserProfile(userId: string) {
    const sql = getSql();
    const rows = await sql`SELECT * FROM user_profiles WHERE user_id = ${userId} LIMIT 1`;
    return rows[0] || null;
  }

  async saveUserProfile(userId: string, data: any) {
    const sql = getSql();
    // Simplified upsert for profile sound prefs
    const existing = await this.getUserProfile(userId);
    if (!existing) {
        // Find address first
        const user = await this.getUserById(userId);
        if (!user) return;
        await sql`
            INSERT INTO user_profiles (user_id, address, sound_prefs, created_at, updated_at)
            VALUES (${userId}, ${user.address}, ${data.soundPrefs || {}}, NOW(), NOW())
        `;
    } else {
        await sql`
            UPDATE user_profiles
            SET sound_prefs = ${data.soundPrefs || existing.sound_prefs}, updated_at = NOW()
            WHERE user_id = ${userId}
        `;
    }
  }
}

export class PostgresSessionRepository implements ISessionRepository {
  async saveSession(session: any) {
    const sql = getSql();
    const createdAt = session.createdAt ? new Date(session.createdAt) : new Date();
    const authorizedAt = session.authorizedAt ? new Date(session.authorizedAt) : null;
    const expiresAt = session.expiresAt ? new Date(session.expiresAt) : new Date(Date.now() + 3600 * 1000);

    await sql`
      INSERT INTO sessions (id, status, user_id, address, public_key, mode, account_id, platform, client_type, device_id, app_version, authorized_at, expires_at, created_at)
      VALUES (
        ${session.id}, ${session.status}, ${session.userId || null}, ${session.address || null},
        ${session.publicKey || null}, ${session.mode || 'live'}, ${session.accountId || null},
        ${session.platform || 'unknown'}, ${session.clientType || 'unknown'}, ${session.deviceId || null},
        ${session.appVersion || null}, ${authorizedAt}, ${expiresAt}, ${createdAt}
      )
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        user_id = EXCLUDED.user_id,
        address = EXCLUDED.address,
        authorized_at = EXCLUDED.authorized_at,
        public_key = EXCLUDED.public_key,
        mode = EXCLUDED.mode,
        account_id = EXCLUDED.account_id
    `;
  }

  async getSessionById(id: string) {
    const sql = getSql();
    const rows = await sql`SELECT * FROM sessions WHERE id = ${id} LIMIT 1`;
    if (!rows[0]) return null;
    const row = rows[0];
    return {
        id: row.id,
        status: row.status,
        userId: row.user_id,
        address: row.address,
        publicKey: row.public_key,
        mode: row.mode,
        accountId: row.account_id,
        platform: row.platform,
        clientType: row.client_type,
        deviceId: row.device_id,
        appVersion: row.app_version,
        authorizedAt: row.authorized_at,
        expiresAt: row.expires_at,
        createdAt: row.created_at
    };
  }
}

export class PostgresWalletRepository implements IWalletRepository {
  async getBalance(address: string, token: string = "zhixi") {
    const sql = getSql();
    const rows = await sql`SELECT balance FROM wallet_accounts WHERE address = ${address.toLowerCase()} AND token = ${token} LIMIT 1`;
    return rows[0] ? String(rows[0].balance) : "0";
  }

  async updateBalance(address: string, amount: string, token: string = "zhixi") {
    const sql = getSql();
    await sql`
      INSERT INTO wallet_accounts (address, token, balance, updated_at)
      VALUES (${address.toLowerCase()}, ${token}, ${amount}, NOW())
      ON CONFLICT (address, token) DO UPDATE SET
        balance = EXCLUDED.balance,
        updated_at = NOW()
    `;
  }

  async saveTxIntent(intent: any) {
     const sql = getSql();
     await sql`
       INSERT INTO tx_intents (id, user_id, address, type, status, amount, token, request_id, meta, created_at, updated_at)
       VALUES (
         ${intent.id}, ${intent.userId}, ${intent.address.toLowerCase()}, ${intent.type}, ${intent.status},
         ${intent.amount}, ${intent.token}, ${intent.requestId || null}, ${intent.meta || null}, NOW(), NOW()
       )
       ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()
     `;
  }

  async getPendingIntents() {
    const sql = getSql();
    const rows = await sql`SELECT * FROM tx_intents WHERE status = 'pending'`;
    return rows.map((row: any) => ({
        ...row,
        userId: row.user_id,
        requestId: row.request_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    }));
  }
}

export class PostgresCustodyRepository implements ICustodyRepository {
  async saveCustodyUser(username: string, data: any) {
    const sql = getSql();
    const createdAt = data.createdAt ? new Date(data.createdAt) : new Date();
    await sql`
      INSERT INTO custody_accounts (username, password_hash, salt_hex, address, public_key, user_id, created_at, updated_at)
      VALUES (
        ${username}, ${data.passwordHash}, ${data.saltHex}, ${data.address.toLowerCase()},
        ${data.publicKey}, ${data.userId || null}, ${createdAt}, NOW()
      )
      ON CONFLICT (username) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        salt_hex = EXCLUDED.salt_hex,
        updated_at = NOW()
    `;
  }

  async getCustodyUser(username: string) {
    const sql = getSql();
    const rows = await sql`SELECT * FROM custody_accounts WHERE username = ${username} LIMIT 1`;
    if (!rows[0]) return null;
    const row = rows[0];
    return {
        ...row,
        saltHex: row.salt_hex,
        passwordHash: row.password_hash,
        publicKey: row.public_key,
        userId: row.user_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
  }
}
