import { createClient } from "@vercel/kv";

export const kv = createClient({
  url: process.env.KV_REST_API_URL || "http://localhost:8080",
  token: process.env.KV_REST_API_TOKEN || "test-token",
});

export const getSession = async (sessionId: string) => {
  return await kv.get(`session:${sessionId}`);
};

export const setSession = async (sessionId: string, data: any, ttlSeconds: number) => {
  await kv.set(`session:${sessionId}`, data, { ex: ttlSeconds });
};
