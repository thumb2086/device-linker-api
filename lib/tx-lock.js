import { kv } from '@vercel/kv';
import { logChainTxEvent } from './tx-monitor.js';

export const CHAIN_TX_LOCK_KEY = 'chain_tx_lock:global';
export const CHAIN_TX_LOCK_META_KEY = 'chain_tx_lock_meta:global';
export const CHAIN_TX_QUEUE_NEXT_KEY = 'chain_tx_queue_next:global';
export const CHAIN_TX_QUEUE_SERVE_KEY = 'chain_tx_queue_serve:global';
const CHAIN_TX_LOCK_TTL_SECONDS = 30;
const DEFAULT_CHAIN_TX_TIMEOUT_MS = 10000;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function acquireChainTxLock(timeoutMs = DEFAULT_CHAIN_TX_TIMEOUT_MS, source = "") {
    const token = `${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const startedAt = Date.now();

    while ((Date.now() - startedAt) < timeoutMs) {
        const acquired = await kv.set(CHAIN_TX_LOCK_KEY, token, { nx: true, ex: CHAIN_TX_LOCK_TTL_SECONDS });
        if (acquired === 'OK' || acquired === true) {
            try {
                await kv.set(CHAIN_TX_LOCK_META_KEY, {
                    token,
                    source: String(source || '').trim(),
                    acquiredAt: new Date().toISOString()
                }, { ex: CHAIN_TX_LOCK_TTL_SECONDS });
            } catch (_) {
                // ignore meta write failures
            }
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
            await kv.del(CHAIN_TX_LOCK_META_KEY);
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
    try {
        await kv.set(`chain_tx_queue_ticket:${ticket}`, {
            ticket,
            source: String(source || '').trim(),
            createdAt: new Date().toISOString()
        }, { ex: Math.ceil(Math.max(60, timeoutMs / 1000) * 1.5) }); // 給予足夠的寬裕時間
        
        // Log entry to queue
        await logChainTxEvent({
            status: 'pending',
            kind: 'tx_queue',
            method: 'acquireQueuedChainTxLock',
            source: String(source || '').trim(),
            meta: { ticket }
        });
    } catch (_) {
        // ignore ticket meta failures
    }
    const startedAt = Date.now();

    while ((Date.now() - startedAt) < timeoutMs) {
        const serving = Number(await kv.get(CHAIN_TX_QUEUE_SERVE_KEY) || 0);
        
        if (serving + 1 === ticket) {
            // 輪到我了，嘗試獲取執行鎖
            const lock = await acquireChainTxLock(Math.max(1000, timeoutMs - (Date.now() - startedAt)), source);
            if (lock) {
                return { lock, ticket };
            }
        } else if (serving + 1 < ticket) {
            // 還沒輪到我，檢查排在我前面的人是否還在
            const nextInLineTicket = serving + 1;
            const nextTicketMeta = await kv.get(`chain_tx_queue_ticket:${nextInLineTicket}`);
            
            if (!nextTicketMeta) {
                // 排隊中的下一個人似乎消失了 (逾時或崩潰)
                // 嘗試領取臨時跳過鎖以推進隊列
                const skipLockKey = `chain_tx_skip_lock:${nextInLineTicket}`;
                const canSkip = await kv.set(skipLockKey, '1', { nx: true, ex: 10 });
                if (canSkip) {
                    const currentServingNow = Number(await kv.get(CHAIN_TX_QUEUE_SERVE_KEY) || 0);
                    if (currentServingNow === serving) {
                        await kv.set(CHAIN_TX_QUEUE_SERVE_KEY, nextInLineTicket);
                        // 不需要手動刪除 skipLock，讓它過期即可
                    }
                }
            }
        }
        await sleep(150);
    }

    // 逾時處理：如果是我自己的票據逾時了，嘗試釋放位置讓後面的人繼續
    const finalServing = Number(await kv.get(CHAIN_TX_QUEUE_SERVE_KEY) || 0);
    if (finalServing + 1 === ticket) {
        await kv.set(CHAIN_TX_QUEUE_SERVE_KEY, ticket);
    }
    
    try {
        await kv.del(`chain_tx_queue_ticket:${ticket}`);
    } catch (_) {
        // ignore ticket cleanup failures
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
    
    // 1. 先釋放執行鎖
    await releaseChainTxLock(queueLock.lock);
    
    try {
        // 只有當 ticket 等於目前正在服務的下一個號碼時，才推進 serving
        const serving = Number(await kv.get(CHAIN_TX_QUEUE_SERVE_KEY) || 0);
        if (queueLock.ticket === serving + 1) {
            await kv.set(CHAIN_TX_QUEUE_SERVE_KEY, queueLock.ticket);
        }
        await kv.del(`chain_tx_queue_ticket:${queueLock.ticket}`);
    } catch (_) {
        // ignore queue release failures
    }
}

export async function getChainTxQueueSnapshot(limit = 50) {
    await ensureQueueServeInitialized();
    const next = Number(await kv.get(CHAIN_TX_QUEUE_NEXT_KEY) || 0);
    const serving = Number(await kv.get(CHAIN_TX_QUEUE_SERVE_KEY) || 0);
    const pendingCount = Math.max(0, next - serving);

    const maxItems = Math.max(1, Math.min(200, Math.floor(Number(limit || 50))));
    const fromTicket = Math.max(serving + 1, next - maxItems + 1);
    const tickets = [];
    for (let ticket = fromTicket; ticket <= next; ticket += 1) {
        if (ticket <= serving) continue;
        tickets.push(ticket);
    }

    const items = [];
    if (tickets.length > 0) {
        const metas = await Promise.all(tickets.map((ticket) => kv.get(`chain_tx_queue_ticket:${ticket}`)));
        metas.forEach((meta, index) => {
            const ticket = tickets[index];
            if (!meta || typeof meta !== "object") {
                items.push({ ticket, source: "", createdAt: "" });
                return;
            }
            items.push({
                ticket,
                source: String(meta.source || ""),
                createdAt: String(meta.createdAt || "")
            });
        });
    }

    const lockMeta = await kv.get(CHAIN_TX_LOCK_META_KEY);
    return {
        serving,
        next,
        pendingCount,
        lock: lockMeta && typeof lockMeta === "object" ? {
            source: String(lockMeta.source || ""),
            acquiredAt: String(lockMeta.acquiredAt || ""),
            token: String(lockMeta.token || "")
        } : null,
        queue: items
    };
}

export async function skipChainTxQueueRange(start, end) {
    const startTicket = Math.max(0, Number(start));
    const endTicket = Math.max(startTicket, Number(end));
    
    if (isNaN(startTicket) || isNaN(endTicket)) {
        throw new Error("Invalid ticket range");
    }

    const keysToDelete = [];
    for (let ticket = startTicket; ticket <= endTicket; ticket++) {
        keysToDelete.push(`chain_tx_queue_ticket:${ticket}`);
    }

    if (keysToDelete.length > 0) {
        // Delete metadata keys in chunks of 100 to avoid large command issues
        const chunkSize = 100;
        for (let i = 0; i < keysToDelete.length; i += chunkSize) {
            const chunk = keysToDelete.slice(i, i + chunkSize);
            await kv.del(...chunk);
        }
    }

    const currentServing = Number(await kv.get(CHAIN_TX_QUEUE_SERVE_KEY) || 0);
    if (endTicket > currentServing) {
        await kv.set(CHAIN_TX_QUEUE_SERVE_KEY, endTicket);
        return {
            success: true,
            message: `Skipped tickets ${startTicket} to ${endTicket}. Updated serving to ${endTicket}.`,
            deletedCount: keysToDelete.length,
            previousServing: currentServing,
            newServing: endTicket
        };
    }

    return {
        success: true,
        message: `Deleted metadata for tickets ${startTicket} to ${endTicket}. serving remains at ${currentServing}.`,
        deletedCount: keysToDelete.length,
        previousServing: currentServing,
        newServing: currentServing
    };
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
