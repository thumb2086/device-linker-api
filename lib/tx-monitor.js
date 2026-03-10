import { kv } from "@vercel/kv";
import { randomUUID } from "crypto";

const TX_MONITOR_PREFIX = "tx_monitor:";

function txMonitorKey(eventId) {
    return `${TX_MONITOR_PREFIX}${eventId}`;
}

function trimText(value, maxLength = 240) {
    if (typeof value !== "string") return "";
    return value.replace(/\r\n/g, "\n").replace(/\u0000/g, "").trim().slice(0, maxLength);
}

function parseDate(value) {
    const timestamp = Date.parse(String(value || ""));
    return Number.isFinite(timestamp) ? timestamp : 0;
}

function normalizeTxEvent(record = {}) {
    return {
        id: trimText(record.id, 128),
        createdAt: trimText(record.createdAt, 64),
        status: trimText(record.status, 16) || "unknown",
        kind: trimText(record.kind, 32) || "unknown",
        method: trimText(record.method, 64),
        source: trimText(record.source, 64),
        txHash: trimText(record.txHash, 128),
        error: trimText(record.error, 240),
        signer: trimText(record.signer, 64),
        nonce: Number(record.nonce || 0),
        attempts: Number(record.attempts || 0),
        meta: record.meta && typeof record.meta === "object" ? record.meta : {}
    };
}

function groupSourceLabel(event) {
    return trimText(event && event.source, 64) || trimText(event && event.kind, 32) || trimText(event && event.method, 64) || "unknown";
}

export async function logChainTxEvent(input = {}) {
    const event = normalizeTxEvent({
        ...input,
        id: trimText(input.id, 128) || `tx_event_${randomUUID()}`,
        createdAt: trimText(input.createdAt, 64) || new Date().toISOString()
    });
    await kv.set(txMonitorKey(event.id), event);
    return event;
}

export async function buildChainTxDashboard(options = {}) {
    const nowMs = Date.now();
    const hours = Math.max(1, Math.floor(Number(options.hours || 24)));
    const recentLimit = Math.max(10, Math.min(100, Math.floor(Number(options.limit || 25))));
    const sinceMs = nowMs - hours * 60 * 60 * 1000;
    const events = [];
    const maxEvents = Math.max(200, Math.min(5000, Math.floor(Number(options.maxEvents || 3000))));
    const maxScanMs = Math.max(300, Math.min(6000, Math.floor(Number(options.maxScanMs || 2000))));
    const scanStartedAt = Date.now();
    const keys = [];

    for await (const key of kv.scanIterator({ match: `${TX_MONITOR_PREFIX}*`, count: 1000 })) {
        keys.push(key);
        if ((Date.now() - scanStartedAt) > maxScanMs) break;
        if (keys.length >= maxEvents * 4) break;
    }

    const chunkSize = 100;
    let truncated = false;
    for (let index = 0; index < keys.length; index += chunkSize) {
        const chunk = keys.slice(index, index + chunkSize);
        const chunkValues = await Promise.all(chunk.map((key) => kv.get(key)));
        for (let idx = 0; idx < chunkValues.length; idx += 1) {
            const event = normalizeTxEvent(chunkValues[idx] || {});
            const createdMs = parseDate(event.createdAt);
            if (!event.id || !createdMs || createdMs < sinceMs) continue;
            events.push(event);
            if (events.length >= maxEvents) {
                truncated = true;
                break;
            }
        }
        if (truncated) break;
        if ((Date.now() - scanStartedAt) > maxScanMs) {
            truncated = true;
            break;
        }
    }

    events.sort((left, right) => parseDate(right.createdAt) - parseDate(left.createdAt));

    const successCount = events.filter((event) => event.status === "success").length;
    const failureCount = events.filter((event) => event.status === "failure").length;
    const totalCount = successCount + failureCount;
    const failureRate = totalCount > 0 ? (failureCount / totalCount) * 100 : 0;
    const successRate = totalCount > 0 ? (successCount / totalCount) * 100 : 0;

    const errorCounter = new Map();
    const sourceCounter = new Map();
    events.forEach((event) => {
        const sourceKey = groupSourceLabel(event);
        const sourceBucket = sourceCounter.get(sourceKey) || { source: sourceKey, totalCount: 0, successCount: 0, failureCount: 0 };
        sourceBucket.totalCount += 1;
        if (event.status === "success") sourceBucket.successCount += 1;
        if (event.status === "failure") sourceBucket.failureCount += 1;
        sourceCounter.set(sourceKey, sourceBucket);
        if (event.status !== "failure" || !event.error) return;
        errorCounter.set(event.error, Number(errorCounter.get(event.error) || 0) + 1);
    });

    const topErrors = Array.from(errorCounter.entries())
        .sort((left, right) => right[1] - left[1])
        .slice(0, 6)
        .map(([message, count]) => ({ message, count }));

    const sourceGroups = Array.from(sourceCounter.values())
        .map((group) => ({
            ...group,
            successRate: group.totalCount > 0 ? (group.successCount / group.totalCount) * 100 : 0,
            failureRate: group.totalCount > 0 ? (group.failureCount / group.totalCount) * 100 : 0
        }))
        .sort((left, right) => {
            if (right.failureCount !== left.failureCount) return right.failureCount - left.failureCount;
            return right.totalCount - left.totalCount;
        });

    return {
        hours,
        totalCount,
        successCount,
        failureCount,
        successRate,
        failureRate,
        recent: events.slice(0, recentLimit),
        topErrors,
        sourceGroups,
        truncated: truncated || (Date.now() - scanStartedAt) > maxScanMs,
        scannedKeys: keys.length
    };
}
