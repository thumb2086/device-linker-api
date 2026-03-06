import { kv } from "@vercel/kv";

export const LEADERBOARD_CACHE_TTL_SECONDS = 15;

function cacheKey(name) {
    return `leaderboard_cache:${name}`;
}

export async function getCachedLeaderboard(name) {
    return kv.get(cacheKey(name));
}

export async function setCachedLeaderboard(name, payload, ttlSeconds = LEADERBOARD_CACHE_TTL_SECONDS) {
    await kv.set(cacheKey(name), payload, { ex: ttlSeconds });
}

export function applyLeaderboardCacheHeaders(res, ttlSeconds = LEADERBOARD_CACHE_TTL_SECONDS) {
    res.setHeader("Cache-Control", `public, s-maxage=${ttlSeconds}, stale-while-revalidate=${ttlSeconds}`);
}
