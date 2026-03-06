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
        try {
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === "object" ? parsed : null;
        } catch {
            return null;
        }
    }
    return typeof raw === "object" ? raw : null;
}

export async function saveSession(sessionId, payload, ttlSeconds) {
    const key = sessionKey(sessionId);
    const normalizedPayload = compactSessionPayload(payload);
    await kv.hset(key, normalizedPayload);
    if (ttlSeconds !== null && ttlSeconds !== undefined) {
        await kv.expire(key, ttlSeconds);
    }
}

export async function getSession(sessionId) {
    if (!sessionId) return null;
    const key = sessionKey(sessionId);

    const hashData = await kv.hgetall(key);
    if (hashData && Object.keys(hashData).length > 0) {
        return hashData;
    }

    const legacy = await kv.get(key);
    return normalizeLegacySession(legacy);
}
