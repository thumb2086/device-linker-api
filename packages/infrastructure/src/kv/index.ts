import { createClient } from "@vercel/kv";

const isTest = !process.env.KV_REST_API_URL;

// Simple in-memory mock for development/testing environments without KV credentials
class MockKV {
  private store = new Map<string, { value: any; expires: number }>();

  async get(key: string) {
    const item = this.store.get(key);
    if (!item) return null;
    if (item.expires < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return item.value;
  }

  async set(key: string, value: any, options?: { ex?: number }) {
    const expires = options?.ex ? Date.now() + options.ex * 1000 : Infinity;
    this.store.set(key, { value, expires });
    return "OK";
  }

  async del(key: string) {
    this.store.delete(key);
    return 1;
  }
}

export const kv = isTest
  ? new MockKV() as any
  : createClient({
      url: process.env.KV_REST_API_URL!,
      token: process.env.KV_REST_API_TOKEN!,
    });

export const getSession = async (sessionId: string) => {
  return await kv.get(`session:${sessionId}`);
};

export const setSession = async (sessionId: string, data: any, ttlSeconds: number) => {
  await kv.set(`session:${sessionId}`, data, { ex: ttlSeconds });
};
