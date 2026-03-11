// lib/tx-lock.js - Legacy Stubs for backward compatibility
// Redlock is now handled internally in admin-chain.js / settlement-service.js
export const CHAIN_TX_LOCK_KEY = 'chain_tx_lock:global';
export const CHAIN_TX_LOCK_META_KEY = 'chain_tx_lock_meta:global';
export const CHAIN_TX_QUEUE_NEXT_KEY = 'chain_tx_queue_next:global';
export const CHAIN_TX_QUEUE_SERVE_KEY = 'chain_tx_queue_serve:global';

/**
 * Legacy wrapper. Now just executes the task because 
 * internal mechanisms in admin-chain handles transaction serialization.
 */
export async function withQueuedChainTxLock(task, timeoutMs, source) {
    return await task();
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
 * Generic lock wrapper.
 */
export async function withDistLock(lockKey, task) {
    return await task();
}

/**
 * Legacy lock acquire.
 */
export async function acquireChainTxLock() {
    return { release: async () => {} };
}

/**
 * Legacy lock release.
 */
export async function releaseChainTxLock() {
    return true;
}
