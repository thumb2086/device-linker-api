import { createClient } from "@vercel/kv";

const isTest = !process.env.KV_REST_API_URL;

// Comprehensive in-memory mock for development/testing
class MockKV {
  private store = new Map<string, { value: any; expires: number }>();
  private sets = new Map<string, Set<string>>();
  private lists = new Map<string, any[]>();

  async get<T>(key: string): Promise<T | null> {
    const item = this.store.get(key);
    if (!item) return null;
    if (item.expires < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return item.value as T;
  }

  async set(key: string, value: any, options?: { ex?: number }) {
    const expires = options?.ex ? Date.now() + options.ex * 1000 : 2147483647000;
    this.store.set(key, { value, expires });
    return "OK";
  }

  async del(key: string) {
    this.store.delete(key);
    this.sets.delete(key);
    this.lists.delete(key);
    return 1;
  }

  async sadd(key: string, ...members: string[]) {
    if (!this.sets.has(key)) this.sets.set(key, new Set());
    const set = this.sets.get(key)!;
    members.forEach(m => set.add(m));
    return members.length;
  }

  async srem(key: string, ...members: string[]) {
    const set = this.sets.get(key);
    if (!set) return 0;
    let count = 0;
    members.forEach(m => { if (set.delete(m)) count++; });
    return count;
  }

  async smembers(key: string) {
    const set = this.sets.get(key);
    return set ? Array.from(set) : [];
  }

  async lpush(key: string, ...values: any[]) {
    if (!this.lists.has(key)) this.lists.set(key, []);
    const list = this.lists.get(key)!;
    list.unshift(...values);
    return list.length;
  }

  async lrange<T>(key: string, start: number, stop: number) {
    const list = this.lists.get(key) || [];
    const end = stop === -1 ? undefined : stop + 1;
    return list.slice(start, end) as T[];
  }

  async ltrim(key: string, start: number, stop: number) {
    const list = this.lists.get(key) || [];
    const end = stop === -1 ? undefined : stop + 1;
    this.lists.set(key, list.slice(start, end));
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

export const kv: KVClient = (isTest
  ? new MockKV()
  : createClient({
      url: process.env.KV_REST_API_URL!,
      token: process.env.KV_REST_API_TOKEN!,
    })) as any;

export const getSession = async (sessionId: string) => {
  return await kv.get(`session:${sessionId}`);
};

export const setSession = async (sessionId: string, data: any, ttlSeconds: number) => {
  await kv.set(`session:${sessionId}`, data, { ex: ttlSeconds });
};
