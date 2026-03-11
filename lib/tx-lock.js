// A robust distributed lock using Redlock algorithm for Vercel KV (Redis)
import { kv } from '@vercel/kv';
import { randomBytes } from 'crypto';

const LOCK_TTL_MS = 8000; // Lock is valid for 8 seconds
const RETRY_DELAY_MS = 150;
const RETRY_COUNT = 40; // ~6 seconds total retry time

export class VercelRedlock {
    constructor(key) {
        this.key = `redlock:${key}`;
        this.token = null;
    }

    async acquire() {
        this.token = randomBytes(16).toString('hex');
        for (let i = 0; i < RETRY_COUNT; i++) {
            const acquired = await kv.set(this.key, this.token, { nx: true, px: LOCK_TTL_MS });
            if (acquired) {
                return true;
            }
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        }
        return false;
    }

    async release() {
        if (!this.token) {
            return false;
        }
        // Use a Lua script to safely release the lock only if the token matches.
        const script = `
            if redis.call("get", KEYS[1]) == ARGV[1] then
                return redis.call("del", KEYS[1])
            else
                return 0
            end
        `;
        try {
            const result = await kv.eval(script, [this.key], [this.token]);
            this.token = null;
            return result === 1;
        } catch (error) {
            console.error("Redlock release failed:", error);
            this.token = null;
            return false;
        }
    }
}

/**
 * Executes a task within the protection of a distributed lock.
 * This is the new core for all on-chain operations.
 * @param {string} lockKey - A unique key for the resource being protected (e.g., 'nonce-manager').
 * @param {Function} task - The async task to execute.
 */
export async function withDistLock(lockKey, task) {
    const lock = new VercelRedlock(lockKey);
    const acquired = await lock.acquire();

    if (!acquired) {
        throw new Error(`Failed to acquire distributed lock for resource: ${lockKey}. The system is under high load.`);
    }

    try {
        return await task();
    } finally {
        await lock.release();
    }
}
