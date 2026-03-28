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
    await sql`
      INSERT INTO users (id, address, display_name, created_at, updated_at)
      VALUES (${user.id}, ${user.address.toLowerCase()}, ${user.displayName || null}, ${user.createdAt}, NOW())
      ON CONFLICT (id) DO UPDATE SET updated_at = NOW()
    `;
  }

  async getUserById(id: string) {
    const sql = getSql();
    const rows = await sql`SELECT * FROM users WHERE id = ${id} LIMIT 1`;
    return rows[0] || null;
  }

  async getUserByAddress(address: string) {
    const sql = getSql();
    const rows = await sql`SELECT * FROM users WHERE address = ${address.toLowerCase()} LIMIT 1`;
    return rows[0] || null;
  }
}

export class PostgresSessionRepository implements ISessionRepository {
  async saveSession(session: any) {
    const sql = getSql();
    await sql`
      INSERT INTO sessions (id, status, user_id, address, public_key, mode, account_id, platform, client_type, device_id, app_version, authorized_at, expires_at, created_at)
      VALUES (
        ${session.id}, ${session.status}, ${session.userId || null}, ${session.address || null},
        ${session.publicKey || null}, ${session.mode || null}, ${session.accountId || null},
        ${session.platform || null}, ${session.clientType || null}, ${session.deviceId || null},
        ${session.appVersion || null}, ${session.authorizedAt || null}, ${session.expiresAt || null}, NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        user_id = EXCLUDED.user_id,
        address = EXCLUDED.address,
        authorized_at = EXCLUDED.authorized_at
    `;
  }

  async getSessionById(id: string) {
    const sql = getSql();
    const rows = await sql`SELECT * FROM sessions WHERE id = ${id} LIMIT 1`;
    return rows[0] || null;
  }
}

export class PostgresWalletRepository implements IWalletRepository {
  async getBalance(address: string, token: string = "zhixi") { return "0"; }
  async updateBalance(address: string, amount: string, token: string = "zhixi") {}
  async saveTxIntent(intent: any) {}
  async getPendingIntents() { return []; }
}

export class PostgresCustodyRepository implements ICustodyRepository {
  async saveCustodyUser(username: string, data: any) {}
  async getCustodyUser(username: string) { return null; }
}
