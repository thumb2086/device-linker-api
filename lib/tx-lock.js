import { kv } from "@vercel/kv";

// lib/tx-lock.js
// Redlock-style distributed locking using Vercel KV (Upstash Redis)
export const CHAIN_TX_LOCK_KEY = 'chain_tx_lock:global';
export const CHAIN_TX_LOCK_META_KEY = 'chain_tx_lock_meta:global';
export const CHAIN_TX_QUEUE_NEXT_KEY = 'chain_tx_queue_next:global';
export const CHAIN_TX_QUEUE_SERVE_KEY = 'chain_tx_queue_serve:global';

/**
 * Generic lock wrapper. 
 * Retries for up to 10 seconds.
 */
export async function withDistLock(lockKey, task, timeoutMs = 10000) {
    const start = Date.now();
    const fullLockKey = `lock:${lockKey}`;
    const identifier = Math.random().toString(36).substring(7);
    const lockDurationSec = 30; // 30 seconds

    while (Date.now() - start < timeoutMs) {
        // Try to acquire lock
        const acquired = await kv.set(fullLockKey, identifier, { nx: true, ex: lockDurationSec });
        
        if (acquired) {
            try {
                return await task();
            } finally {
                // Release lock only if we still own it
                const currentOwner = await kv.get(fullLockKey);
                if (currentOwner === identifier) {
                    await kv.del(fullLockKey);
                }
            }
        }
        
        // Exponential backoff
        const elapsed = Date.now() - start;
        const delay = Math.min(200, 50 + (elapsed / 10)); 
        await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    throw new Error(`Failed to acquire lock for key: ${lockKey} after ${timeoutMs}ms`);
}

/**
 * Legacy wrapper. Now uses the distributed lock for atomicity.
 */
export async function withQueuedChainTxLock(task, timeoutMs, source) {
    return await withDistLock("legacy-chain-tx", task, timeoutMs);
}

/**
 * Legacy snapshot. Returns an empty structure.
 */
export async function getChainTxQueueSnapshot() {
    return { serving: 0, next: 0, pendingCount: 0, queue: [] };
}

/**
 * Legacy range skip.
 */
export async function skipChainTxQueueRange() {
    return { success: true };
}

/**
 * Legacy lock acquire.
 */
export async function acquireChainTxLock() {
    const release = async () => {};
    return { release };
}

/**
 * Legacy lock release.
 */
export async function releaseChainTxLock() {
    return true;
}

