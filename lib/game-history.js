import { kv } from "@vercel/kv";
import { randomUUID } from "crypto";
import { ethers } from "ethers";

const GAME_HISTORY_PREFIX = "game_history:";
const MAX_HISTORY_ITEMS = 100;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function gameHistoryKey(address) {
    return `${GAME_HISTORY_PREFIX}${String(address || "").trim().toLowerCase()}`;
}

function trimText(value, maxLength = 256) {
    if (typeof value !== "string") return "";
    return value.replace(/\r\n/g, "\n").replace(/\u0000/g, "").trim().slice(0, maxLength);
}

function normalizeLimit(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
    return Math.min(MAX_LIMIT, Math.floor(parsed));
}

function formatUnitsSafe(value, decimals) {
    try {
        return ethers.formatUnits(BigInt(value || 0), decimals);
    } catch {
        return "0.0";
    }
}

function formatSignedUnits(value, decimals) {
    const amount = BigInt(value || 0);
    const sign = amount < 0n ? "-" : "";
    const absolute = amount < 0n ? -amount : amount;
    return `${sign}${ethers.formatUnits(absolute, decimals)}`;
}

function normalizeItem(item) {
    const raw = item && typeof item === "object" ? item : {};
    return {
        id: trimText(raw.id, 128),
        address: trimText(raw.address, 128).toLowerCase(),
        game: trimText(raw.game, 32),
        gameLabel: trimText(raw.gameLabel, 64),
        outcome: trimText(raw.outcome, 32),
        outcomeLabel: trimText(raw.outcomeLabel, 64),
        betAmount: trimText(raw.betAmount, 64),
        payoutAmount: trimText(raw.payoutAmount, 64),
        netAmount: trimText(raw.netAmount, 64),
        multiplier: Number.isFinite(Number(raw.multiplier)) ? Number(raw.multiplier) : 0,
        roundId: trimText(raw.roundId, 64),
        mode: trimText(raw.mode, 32),
        txHash: trimText(raw.txHash, 128),
        details: trimText(raw.details, 200),
        createdAt: trimText(raw.createdAt, 64)
    };
}

function normalizeList(value) {
    if (!Array.isArray(value)) return [];
    return value
        .map(normalizeItem)
        .filter((item) => item.id && item.address)
        .sort((left, right) => Date.parse(right.createdAt || 0) - Date.parse(left.createdAt || 0));
}

export async function recordGameHistory(input) {
    try {
        const address = trimText(input && input.address, 128).toLowerCase();
        if (!address) {
            throw new Error("Game history address is required");
        }

        const decimals = input && input.decimals !== undefined ? input.decimals : 18;
        const nowIso = new Date().toISOString();
        const entry = normalizeItem({
            id: `game_${randomUUID()}`,
            address,
            game: input && input.game,
            gameLabel: input && input.gameLabel,
            outcome: input && input.outcome,
            outcomeLabel: input && input.outcomeLabel,
            betAmount: formatUnitsSafe(input && input.betWei, decimals),
            payoutAmount: formatUnitsSafe(input && input.payoutWei, decimals),
            netAmount: formatSignedUnits(input && input.netWei, decimals),
            multiplier: input && input.multiplier,
            roundId: input && input.roundId,
            mode: input && input.mode,
            txHash: input && input.txHash,
            details: input && input.details,
            createdAt: input && input.createdAt ? input.createdAt : nowIso
        });

        const key = gameHistoryKey(address);
        const current = normalizeList(await kv.get(key));
        const next = [entry, ...current].slice(0, MAX_HISTORY_ITEMS);
        await kv.set(key, next);
        return entry;
    } catch (error) {
        console.error("recordGameHistory failed:", error);
        return null;
    }
}

export async function listGameHistory(address, options = {}) {
    const normalizedAddress = trimText(address, 128).toLowerCase();
    if (!normalizedAddress) {
        return { total: 0, items: [] };
    }

    const limit = normalizeLimit(options.limit);
    const items = normalizeList(await kv.get(gameHistoryKey(normalizedAddress)));
    return {
        total: items.length,
        items: items.slice(0, limit)
    };
}
