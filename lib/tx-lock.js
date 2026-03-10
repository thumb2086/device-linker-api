import { kv } from '@vercel/kv';
import { logChainTxEvent } from './tx-monitor.js';

const CHAIN_TX_LOCK_KEY = 'chain_tx_lock:global';
const CHAIN_TX_QUEUE_NEXT_KEY = 'chain_tx_queue_next:global';
const CHAIN_TX_QUEUE_SERVE_KEY = 'chain_tx_queue_serve:global';
const CHAIN_TX_LOCK_TTL_SECONDS = 45;
const DEFAULT_CHAIN_TX_TIMEOUT_MS = 40000;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function acquireChainTxLock(timeoutMs = DEFAULT_CHAIN_TX_TIMEOUT_MS, source = "") {
    const token = `${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const startedAt = Date.now();

    while ((Date.now() - startedAt) < timeoutMs) {
        const acquired = await kv.set(CHAIN_TX_LOCK_KEY, token, { nx: true, ex: CHAIN_TX_LOCK_TTL_SECONDS });
        if (acquired === 'OK' || acquired === true) {
            return { key: CHAIN_TX_LOCK_KEY, token };
        }
        await sleep(120);
    }

    await logChainTxEvent({
        status: 'failure',
        kind: 'tx_lock',
        method: 'acquireChainTxLock',
        source: String(source || '').trim(),
        error: '鏈上交易繁忙，請稍後再試'
    });
    throw new Error('鏈上交易繁忙，請稍後再試');
}

export async function releaseChainTxLock(lock) {
    if (!lock || !lock.key || !lock.token) return;

    try {
        const currentToken = await kv.get(lock.key);
        if (currentToken === lock.token) {
            await kv.del(lock.key);
        }
    } catch (_) {
        // ignore lock release failures
    }
}

async function ensureQueueServeInitialized() {
    try {
        const current = await kv.get(CHAIN_TX_QUEUE_SERVE_KEY);
        if (current === null || current === undefined) {
            await kv.set(CHAIN_TX_QUEUE_SERVE_KEY, 0);
        }
    } catch (_) {
        // ignore init failure
    }
}

export async function acquireQueuedChainTxLock(timeoutMs = DEFAULT_CHAIN_TX_TIMEOUT_MS, source = "") {
    await ensureQueueServeInitialized();
    const ticket = Number(await kv.incr(CHAIN_TX_QUEUE_NEXT_KEY));
    const startedAt = Date.now();

    while ((Date.now() - startedAt) < timeoutMs) {
        const serving = Number(await kv.get(CHAIN_TX_QUEUE_SERVE_KEY) || 0);
        if (serving + 1 === ticket) {
            const lock = await acquireChainTxLock(Math.max(1000, timeoutMs - (Date.now() - startedAt)), source);
            if (lock) {
                return { lock, ticket };
            }
        }
        await sleep(120);
    }

    const serving = Number(await kv.get(CHAIN_TX_QUEUE_SERVE_KEY) || 0);
    if (serving + 1 === ticket) {
        await kv.set(CHAIN_TX_QUEUE_SERVE_KEY, ticket);
    }
    await logChainTxEvent({
        status: 'failure',
        kind: 'tx_queue',
        method: 'acquireQueuedChainTxLock',
        source: String(source || '').trim(),
        error: '鏈上交易繁忙，等待逾時'
    });
    return null;
}

export async function releaseQueuedChainTxLock(queueLock) {
    if (!queueLock || !queueLock.lock || !queueLock.ticket) return;
    await releaseChainTxLock(queueLock.lock);
    try {
        const serving = Number(await kv.get(CHAIN_TX_QUEUE_SERVE_KEY) || 0);
        if (queueLock.ticket > serving) {
            await kv.set(CHAIN_TX_QUEUE_SERVE_KEY, queueLock.ticket);
        }
    } catch (_) {
        // ignore queue release failures
    }
}

export async function withChainTxLock(task, timeoutMs = DEFAULT_CHAIN_TX_TIMEOUT_MS, source = "") {
    const lock = await acquireChainTxLock(timeoutMs, source);
    try {
        return await task();
    } finally {
        await releaseChainTxLock(lock);
    }
}

export async function withQueuedChainTxLock(task, timeoutMs = DEFAULT_CHAIN_TX_TIMEOUT_MS, source = "") {
    const queueLock = await acquireQueuedChainTxLock(timeoutMs, source);
    if (!queueLock) {
        throw new Error('鏈上交易繁忙，請稍後再試');
    }
    try {
        return await task();
    } finally {
        await releaseQueuedChainTxLock(queueLock);
    }
}
