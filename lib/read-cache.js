import { kv } from "@vercel/kv";

const L2_PREFIX = "read_cache:v1:";
const L2_SNAPSHOT_PREFIX = "read_cache_snapshot:v1:";
const GLOBAL_L1 = globalThis.__deviceLinkerReadCacheL1 || new Map();
const GLOBAL_INFLIGHT = globalThis.__deviceLinkerReadCacheInflight || new Map();

globalThis.__deviceLinkerReadCacheL1 = GLOBAL_L1;
globalThis.__deviceLinkerReadCacheInflight = GLOBAL_INFLIGHT;

export const READ_CACHE_TIERS = {
    "public-heavy": {
        l1FreshSeconds: 5,
        l1StaleSeconds: 45,
        l2FreshSeconds: 15,
        l2StaleSeconds: 45,
        persistLastValue: true
    },
    "user-history": {
        l1FreshSeconds: 3,
        l1StaleSeconds: 10,
        l2FreshSeconds: 10,
        l2StaleSeconds: 10
    },
    "user-live": {
        l1FreshSeconds: 2,
        l1StaleSeconds: 2,
        l2FreshSeconds: 0,
        l2StaleSeconds: 0
    },
    "chat-room-snapshot": {
        l1FreshSeconds: 1,
        l1StaleSeconds: 1,
        l2FreshSeconds: 0,
        l2StaleSeconds: 0
    },
    "chat-room-meta": {
        l1FreshSeconds: 30,
        l1StaleSeconds: 30,
        l2FreshSeconds: 0,
        l2StaleSeconds: 0
    },
    "market-global": {
        l1FreshSeconds: 1,
        l1StaleSeconds: 1,
        l2FreshSeconds: 0,
        l2StaleSeconds: 0
    }
};

function nowMs() {
    return Date.now();
}

function normalizePart(part) {
    if (part === undefined || part === null) return "_";
    if (typeof part === "object") return encodeURIComponent(JSON.stringify(part));
    const text = String(part).trim();
    return text ? encodeURIComponent(text) : "_";
}

export function buildReadCacheKey(namespace, keyParts = []) {
    const parts = Array.isArray(keyParts) ? keyParts : [keyParts];
    const normalizedNamespace = String(namespace || "default").trim().toLowerCase();
    return `${normalizedNamespace}:${parts.map(normalizePart).join(":")}`;
}

function toRedisCacheKey(cacheKey) {
    return `${L2_PREFIX}${cacheKey}`;
}

function toRedisSnapshotKey(cacheKey) {
    return `${L2_SNAPSHOT_PREFIX}${cacheKey}`;
}

function resolveTierConfig(tier) {
    if (!tier) return READ_CACHE_TIERS["public-heavy"];
    if (typeof tier === "string") return READ_CACHE_TIERS[tier] || READ_CACHE_TIERS["public-heavy"];
    return {
        l1FreshSeconds: Number(tier.l1FreshSeconds || 0),
        l1StaleSeconds: Number(tier.l1StaleSeconds || 0),
        l2FreshSeconds: Number(tier.l2FreshSeconds || 0),
        l2StaleSeconds: Number(tier.l2StaleSeconds || 0),
        persistLastValue: tier.persistLastValue === true
    };
}

function resolveGeneratedAt(value) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        const generatedAt = String(value.generatedAt || "").trim();
        if (generatedAt) return generatedAt;
    }
    return new Date().toISOString();
}

function buildEntry(value, tierConfig) {
    return {
        value,
        generatedAt: resolveGeneratedAt(value),
        writtenAt: nowMs(),
        freshUntil: nowMs() + Math.max(0, tierConfig.l1FreshSeconds) * 1000,
        staleUntil: nowMs() + Math.max(0, tierConfig.l1StaleSeconds) * 1000
    };
}

function cloneMeta(status, layer, entry) {
    return {
        status,
        layer,
        generatedAt: entry && entry.generatedAt ? entry.generatedAt : new Date().toISOString()
    };
}

function setL1(cacheKey, entry) {
    GLOBAL_L1.set(cacheKey, entry);
}

function getL1(cacheKey) {
    return GLOBAL_L1.get(cacheKey) || null;
}

function isFresh(entry) {
    return !!(entry && entry.freshUntil >= nowMs());
}

function isStaleUsable(entry) {
    return !!(entry && entry.staleUntil >= nowMs());
}

async function getL2(cacheKey) {
    try {
        const raw = await kv.get(toRedisCacheKey(cacheKey));
        if (!raw || typeof raw !== "object") return null;
        if (!raw.generatedAt || !raw.writtenAt) return null;
        return raw;
    } catch (error) {
        console.error("Read cache L2 get failed:", error?.message || error);
        return null;
    }
}

async function setL2(cacheKey, entry, tierConfig) {
    try {
        if (tierConfig.persistLastValue) {
            await kv.set(toRedisSnapshotKey(cacheKey), {
                value: entry.value,
                generatedAt: entry.generatedAt,
                writtenAt: entry.writtenAt
            });
        }
        if (!tierConfig.l2StaleSeconds || tierConfig.l2StaleSeconds <= 0) return;
        const payload = {
            value: entry.value,
            generatedAt: entry.generatedAt,
            writtenAt: entry.writtenAt,
            freshUntil: entry.writtenAt + Math.max(0, tierConfig.l2FreshSeconds) * 1000,
            staleUntil: entry.writtenAt + Math.max(0, tierConfig.l2StaleSeconds) * 1000
        };
        await kv.set(toRedisCacheKey(cacheKey), payload, { ex: Math.max(1, Math.ceil(tierConfig.l2StaleSeconds)) });
    } catch (error) {
        console.error("Read cache L2 set failed:", error?.message || error);
    }
}

async function deleteKvKeysByPrefix(prefixBase, cachePrefix) {
    const pattern = `${prefixBase}${cachePrefix}*`;
    const keys = [];
    try {
        for await (const key of kv.scanIterator({ match: pattern, count: 200 })) {
            keys.push(key);
        }
        if (keys.length) {
            await kv.del(...keys);
        }
    } catch (error) {
        console.error("Read cache L2 prefix delete failed:", error?.message || error);
    }
}

async function getPersistentL2(cacheKey) {
    try {
        const raw = await kv.get(toRedisSnapshotKey(cacheKey));
        if (!raw || typeof raw !== "object") return null;
        if (raw.value === undefined) return null;
        return raw;
    } catch (error) {
        console.error("Read cache persistent snapshot get failed:", error?.message || error);
        return null;
    }
}

async function refreshCache(cacheKey, tierConfig, loader) {
    if (GLOBAL_INFLIGHT.has(cacheKey)) {
        return GLOBAL_INFLIGHT.get(cacheKey);
    }

    const task = Promise.resolve()
        .then(loader)
        .then(async (value) => {
            const entry = buildEntry(value, tierConfig);
            setL1(cacheKey, entry);
            await setL2(cacheKey, entry, tierConfig);
            return { value: entry.value, meta: cloneMeta("MISS", "origin", entry) };
        })
        .finally(() => {
            GLOBAL_INFLIGHT.delete(cacheKey);
        });

    GLOBAL_INFLIGHT.set(cacheKey, task);
    return task;
}

export async function readThroughCache(options) {
    const config = options && typeof options === "object" ? options : {};
    const tierConfig = resolveTierConfig(config.tier);
    const cacheKey = buildReadCacheKey(config.namespace, config.keyParts);
    const allowStale = config.allowStale !== false;
    const skipCache = config.skipCache === true;

    if (skipCache) {
        return refreshCache(cacheKey, tierConfig, config.loader);
    }

    const l1Entry = getL1(cacheKey);
    if (isFresh(l1Entry)) {
        return { value: l1Entry.value, meta: cloneMeta("HIT", "L1", l1Entry) };
    }
    if (allowStale && isStaleUsable(l1Entry)) {
        void refreshCache(cacheKey, tierConfig, config.loader).catch(() => {});
        return { value: l1Entry.value, meta: cloneMeta("STALE", "L1", l1Entry) };
    }

    if (tierConfig.l2StaleSeconds > 0) {
        const l2Entry = await getL2(cacheKey);
        if (l2Entry) {
            const promoted = {
                value: l2Entry.value,
                generatedAt: l2Entry.generatedAt,
                writtenAt: l2Entry.writtenAt,
                freshUntil: l2Entry.freshUntil,
                staleUntil: l2Entry.staleUntil
            };
            setL1(cacheKey, promoted);

            if (isFresh(promoted)) {
                return { value: promoted.value, meta: cloneMeta("HIT", "L2", promoted) };
            }
            if (allowStale && isStaleUsable(promoted)) {
                void refreshCache(cacheKey, tierConfig, config.loader).catch(() => {});
                return { value: promoted.value, meta: cloneMeta("STALE", "L2", promoted) };
            }
        }
    }

    if (tierConfig.persistLastValue) {
        const persistentEntry = await getPersistentL2(cacheKey);
        if (persistentEntry) {
            const promoted = {
                value: persistentEntry.value,
                generatedAt: persistentEntry.generatedAt || resolveGeneratedAt(persistentEntry.value),
                writtenAt: Number(persistentEntry.writtenAt || 0),
                freshUntil: 0,
                staleUntil: nowMs() + Math.max(1, tierConfig.l1StaleSeconds) * 1000
            };
            setL1(cacheKey, promoted);
            void refreshCache(cacheKey, tierConfig, config.loader).catch(() => {});
            return { value: promoted.value, meta: cloneMeta("STALE", "L2", promoted) };
        }
    }

    return refreshCache(cacheKey, tierConfig, config.loader);
}

export function applyReadCacheHeaders(res, meta) {
    if (!res || !meta) return;
    res.setHeader("X-Cache", meta.status || "MISS");
    res.setHeader("X-Cache-Layer", meta.layer || "origin");
    res.setHeader("X-Generated-At", meta.generatedAt || new Date().toISOString());
}

export async function invalidateReadCache(namespace, keyParts = []) {
    const cacheKey = buildReadCacheKey(namespace, keyParts);
    GLOBAL_L1.delete(cacheKey);
    try {
        await kv.del(toRedisCacheKey(cacheKey), toRedisSnapshotKey(cacheKey));
    } catch (error) {
        console.error("Read cache invalidate failed:", error?.message || error);
    }
}

export async function invalidateReadCacheByPrefix(namespace, keyPartsPrefix = []) {
    const prefix = buildReadCacheKey(namespace, keyPartsPrefix);
    for (const key of Array.from(GLOBAL_L1.keys())) {
        if (key.startsWith(prefix)) {
            GLOBAL_L1.delete(key);
        }
    }
    await deleteKvKeysByPrefix(L2_PREFIX, prefix);
    await deleteKvKeysByPrefix(L2_SNAPSHOT_PREFIX, prefix);
}
