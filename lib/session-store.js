import { kv } from "@vercel/kv";

function sessionKey(sessionId) {
    return `session:${sessionId}`;
}

function compactSessionPayload(payload) {
    const normalized = {};
    for (const [key, value] of Object.entries(payload || {})) {
        if (value === undefined || value === null) continue;
        if (typeof value === "string" && value === "") continue;
        normalized[key] = value;
    }
    return normalized;
}

function normalizeLegacySession(raw) {
    if (!raw) return null;
    if (typeof raw === "string") {
        const trimmed = raw.trim();
        try {
            const parsed = JSON.parse(trimmed);
            if (parsed && typeof parsed === "object") return parsed;
        } catch {
            // Not JSON
        }
        // If it looks like an Ethereum address, treat it as a session for that address
        if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
            return { address: trimmed.toLowerCase(), status: "authorized" };
        }
        return null;
    }
    return typeof raw === "object" ? raw : null;
}

export async function saveSession(sessionId, payload, ttlSeconds) {
    const key = sessionKey(sessionId);
    const normalizedPayload = compactSessionPayload(payload);
    // Ensure we don't have a type conflict (legacy string vs new hash)
    try {
        await kv.del(key);
    } catch (e) {
        console.warn(`Failed to delete key ${key} before hset:`, e.message);
    }
    await kv.hset(key, normalizedPayload);
    if (ttlSeconds !== null && ttlSeconds !== undefined) {
        await kv.expire(key, ttlSeconds);
    }
}

export async function getSession(sessionId) {
    if (!sessionId) return null;
    const key = sessionKey(sessionId);

    try {
        const hashData = await kv.hgetall(key);
        if (hashData && Object.keys(hashData).length > 0) {
            // 自動續期 3600 秒 (1 小時)
            kv.expire(key, 3600).catch((err) => console.warn(`Failed to refresh TTL for ${key}:`, err.message));
            return hashData;
        }
    } catch (e) {
        // Fallback if key is not a hash (e.g. WRONGTYPE)
        if (!e.message.includes("WRONGTYPE")) {
            console.warn(`kv.hgetall failed for ${key}:`, e.message);
        }
    }

    try {
        const legacy = await kv.get(key);
        if (legacy) {
            // 傳統 key 也嘗試續期
            kv.expire(key, 3600).catch(() => {});
        }
        return normalizeLegacySession(legacy);
    } catch (e) {
        console.warn(`kv.get failed for ${key}:`, e.message);
        return null;
    }
}
