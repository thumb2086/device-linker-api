import { kv } from '@vercel/kv';
import { logChainTxEvent } from './tx-monitor.js';

export const CHAIN_TX_LOCK_KEY = 'chain_tx_lock:global';
export const CHAIN_TX_LOCK_META_KEY = 'chain_tx_lock_meta:global';
export const CHAIN_TX_QUEUE_NEXT_KEY = 'chain_tx_queue_next:global';
export const CHAIN_TX_QUEUE_SERVE_KEY = 'chain_tx_queue_serve:global';

const DEFAULT_CHAIN_TX_TIMEOUT_MS = 10000;
const TICKET_TTL_SECONDS = 30;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 獲取排隊鎖 (具備自癒能力的跳號機制)
 */
export async function acquireQueuedChainTxLock(timeoutMs = DEFAULT_CHAIN_TX_TIMEOUT_MS, source = "") {
    const startedAt = Date.now();
    
    // 1. 領取號碼牌 (Atomic Ticket)
    const ticket = Number(await kv.incr(CHAIN_TX_QUEUE_NEXT_KEY));
    
    // 2. 註冊票據存活狀態 (Liveness)
    try {
        await kv.set(`chain_tx_queue_ticket:${ticket}`, {
            ticket,
            source: String(source || '').trim(),
            createdAt: new Date().toISOString()
        }, { ex: TICKET_TTL_SECONDS });
        
        await logChainTxEvent({
            status: 'pending',
            kind: 'tx_queue',
            method: 'acquireQueuedChainTxLock',
            source: String(source || '').trim(),
            meta: { ticket }
        });
    } catch (_) {}

    // 3. 輪詢排隊狀態
    while ((Date.now() - startedAt) < timeoutMs) {
        const serving = Number(await kv.get(CHAIN_TX_QUEUE_SERVE_KEY) || 0);
        
        // 情況 A: 輪到我了
        if (serving + 1 === ticket) {
            return { ticket };
        }
        
        // 情況 B: 已經過號了 (可能是我自己逾時後又活過來了)
        if (serving >= ticket) {
            return null; // 此票據已作廢
        }

        // 情況 C: 還沒輪到我，檢查前面那個人是否「失聯」
        const nextInLine = serving + 1;
        const nextInLineMeta = await kv.get(`chain_tx_queue_ticket:${nextInLine}`);
        
        if (!nextInLineMeta && nextInLine < ticket) {
            // 前面那個人消失了 (逾時或沒註冊)，嘗試「跳號」
            const skipLockKey = `chain_tx_skip_lock:${nextInLine}`;
            const canSkip = await kv.set(skipLockKey, '1', { nx: true, ex: 5 });
            if (canSkip) {
                const currentServingNow = Number(await kv.get(CHAIN_TX_QUEUE_SERVE_KEY) || 0);
                if (currentServingNow === serving) {
                    await kv.set(CHAIN_TX_QUEUE_SERVE_KEY, nextInLine);
                    // 跳號成功後，下一輪迴圈就會輪到我 (或是再下一個)
                }
            }
        }
        
        await sleep(200);
    }

    // 逾時處理
    await logChainTxEvent({
        status: 'failure',
        kind: 'tx_queue',
        method: 'acquireQueuedChainTxLock',
        source: String(source || '').trim(),
        error: '鏈上交易排隊逾時',
        meta: { ticket }
    });
    
    return null;
}

/**
 * 釋放排隊鎖並推進索引
 */
export async function releaseQueuedChainTxLock(queueLock) {
    if (!queueLock || !queueLock.ticket) return;
    
    try {
        const ticket = Number(queueLock.ticket);
        const serving = Number(await kv.get(CHAIN_TX_QUEUE_SERVE_KEY) || 0);
        
        // 只有當我是目前正在服務的人時，才推進到我的號碼
        if (ticket > serving) {
            await kv.set(CHAIN_TX_QUEUE_SERVE_KEY, ticket);
        }
        
        await kv.del(`chain_tx_queue_ticket:${ticket}`);
    } catch (_) {}
}

/**
 * 核心執行器：確保任務在排隊保護下執行
 */
export async function withQueuedChainTxLock(task, timeoutMs = DEFAULT_CHAIN_TX_TIMEOUT_MS, source = "") {
    const queueLock = await acquireQueuedChainTxLock(timeoutMs, source);
    if (!queueLock) {
        throw new Error('鏈上交易繁忙，排隊逾時，請稍後再試');
    }
    try {
        return await task();
    } finally {
        await releaseQueuedChainTxLock(queueLock);
    }
}

// 保留相容性函數 (已廢棄，對應到新的排隊系統)
export async function acquireChainTxLock() { return { key: CHAIN_TX_LOCK_KEY, token: 'legacy' }; }
export async function releaseChainTxLock() {}
export async function withChainTxLock(task) { return await task(); }

export async function getChainTxQueueSnapshot(limit = 50) {
    const next = Number(await kv.get(CHAIN_TX_QUEUE_NEXT_KEY) || 0);
    const serving = Number(await kv.get(CHAIN_TX_QUEUE_SERVE_KEY) || 0);
    const pendingCount = Math.max(0, next - serving);

    const items = [];
    const maxScan = Math.min(pendingCount, limit);
    for (let i = 1; i <= maxScan; i++) {
        const ticket = serving + i;
        const meta = await kv.get(`chain_tx_queue_ticket:${ticket}`);
        if (meta) {
            items.push({
                ticket,
                source: String(meta.source || ""),
                createdAt: String(meta.createdAt || "")
            });
        }
    }

    return { serving, next, pendingCount, queue: items };
}

export async function skipChainTxQueueRange(start, end) {
    const endTicket = Math.max(0, Number(end));
    await kv.set(CHAIN_TX_QUEUE_SERVE_KEY, endTicket);
    return { success: true, newServing: endTicket };
}
