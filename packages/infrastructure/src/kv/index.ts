import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../db/schema.js";
import { eq, lte } from "drizzle-orm";

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
let db: any = null;

if (connectionString && !connectionString.includes("mock")) {
  const client = postgres(connectionString, { ssl: 'require' });
  db = drizzle(client, { schema });
}

/**
 * Postgres-backed KV Client to replace @vercel/kv
 */
class PostgresKV {
  async get<T>(key: string): Promise<T | null> {
    if (!db) return null;
    try {
        const result = await db.query.kvStore.findFirst({
          where: eq(schema.kvStore.key, key)
        });
        if (!result) return null;
        if (result.expiresAt && result.expiresAt < new Date()) {
          await this.del(key);
          return null;
        }
        return result.value as T;
    } catch(e) { return null; }
  }

  async set(key: string, value: any, options?: { ex?: number }) {
    if (!db) return "OK";
    try {
        const expiresAt = options?.ex ? new Date(Date.now() + options.ex * 1000) : null;
        await db.insert(schema.kvStore).values({
          key,
          value,
          expiresAt,
          updatedAt: new Date()
        }).onConflictDoUpdate({
          target: schema.kvStore.key,
          set: { value, expiresAt, updatedAt: new Date() }
        });
    } catch(e) {}
    return "OK";
  }

  async del(key: string) {
    if (!db) return 0;
    try {
        await db.delete(schema.kvStore).where(eq(schema.kvStore.key, key));
    } catch(e) {}
    return 1;
  }

  async gc() {
    if (!db) return;
    try {
        await db.delete(schema.kvStore).where(lte(schema.kvStore.expiresAt, new Date()));
    } catch(e) {}
  }

  async sadd(key: string, ...members: string[]) {
    const current = await this.get<string[]>(key) || [];
    const updated = Array.from(new Set([...current, ...members]));
    await this.set(key, updated);
    return members.length;
  }
  async srem(key: string, ...members: string[]) {
    const current = await this.get<string[]>(key) || [];
    const updated = current.filter(m => !members.includes(m));
    await this.set(key, updated);
    return members.length;
  }
  async smembers(key: string) { return await this.get<string[]>(key) || []; }
  async lpush(key: string, ...values: any[]) {
    const current = await this.get<any[]>(key) || [];
    const updated = [...values, ...current];
    await this.set(key, updated);
    return updated.length;
  }
  async lrange<T>(key: string, start: number, stop: number) {
    const list = await this.get<T[]>(key) || [];
    const end = stop === -1 ? undefined : stop + 1;
    return list.slice(start, end);
  }
  async ltrim(key: string, start: number, stop: number) {
    const list = await this.get<any[]>(key) || [];
    const end = stop === -1 ? undefined : stop + 1;
    await this.set(key, list.slice(start, end));
    return "OK";
  }
}

export interface KVClient {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: any, options?: { ex?: number }): Promise<string>;
  del(key: string): Promise<number>;
  sadd(key: string, ...members: string[]): Promise<number>;
  srem(key: string, ...members: string[]): Promise<number>;
  smembers(key: string): Promise<string[]>;
  lpush(key: string, ...values: any[]): Promise<number>;
  lrange<T>(key: string, start: number, stop: number): Promise<T[]>;
  ltrim(key: string, start: number, stop: number): Promise<string>;
}

export const kv: KVClient = new PostgresKV() as any;

export const getSession = async (sessionId: string) => {
  return await kv.get(`session:${sessionId}`);
};

export const setSession = async (sessionId: string, data: any, ttlSeconds: number) => {
  await kv.set(`session:${sessionId}`, data, { ex: ttlSeconds });
};
