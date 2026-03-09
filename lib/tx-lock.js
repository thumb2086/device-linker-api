import { kv } from '@vercel/kv';

const CHAIN_TX_LOCK_KEY = 'chain_tx_lock:global';

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function acquireChainTxLock(timeoutMs = 12000) {
    const token = `${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const startedAt = Date.now();

    while ((Date.now() - startedAt) < timeoutMs) {
        const acquired = await kv.set(CHAIN_TX_LOCK_KEY, token, { nx: true, ex: 15 });
        if (acquired === 'OK' || acquired === true) {
            return { key: CHAIN_TX_LOCK_KEY, token };
        }
        await sleep(120);
    }

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

export async function withChainTxLock(task, timeoutMs = 12000) {
    const lock = await acquireChainTxLock(timeoutMs);
    try {
        return await task();
    } finally {
        await releaseChainTxLock(lock);
    }
}
