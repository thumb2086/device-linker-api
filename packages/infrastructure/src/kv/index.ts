import { createClient } from "@vercel/kv";

const isTest = !process.env.KV_REST_API_URL;

// Simple in-memory mock for development/testing environments without KV credentials
class MockKV {
  private store = new Map<string, { value: any; expires: number }>();

  async get<T>(key: string): Promise<T | null> {
    const item = (this.store as Map<string, any>).get(key);
    if (!item) return null;
    const { value, expires } = item;
    if (expires < Date.now()) {
      (this.store as Map<string, any>).delete(key);
      return null;
    }
    return value as T;
  }

  async set(key: string, value: any, options?: { ex?: number }) {
    const expires = options?.ex ? Date.now() + options.ex * 1000 : 2147483647000;
    (this.store as Map<string, any>).set(key, { value, expires });
    return "OK";
  }

  async del(key: string) {
    (this.store as Map<string, any>).delete(key);
    return 1;
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
