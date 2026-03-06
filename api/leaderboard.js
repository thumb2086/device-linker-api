import { kv } from "@vercel/kv";
import { buildVipStatus } from "../lib/vip.js";
import {
    LEADERBOARD_CACHE_TTL_SECONDS,
    getCachedLeaderboard,
    setCachedLeaderboard,
    applyLeaderboardCacheHeaders
} from "../lib/leaderboard-cache.js";

const KEY_PREFIX = "total_bet:";
const MAX_LIMIT = 100;

function normalizeSessionId(rawValue) {
    return String(rawValue || "").trim();
}

function normalizeLimit(rawValue) {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed <= 0) return 50;
    return Math.min(MAX_LIMIT, Math.floor(parsed));
}

function toNumericBet(rawValue) {
    const parsed = Number(rawValue || 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

function maskAddress(address) {
    const normalized = String(address || "").trim().toLowerCase();
    if (normalized.length < 12) return normalized || "-";
    return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
}

async function loadTotalBetEntries() {
    const keys = [];
    for await (const key of kv.scanIterator({ match: `${KEY_PREFIX}*`, count: 1000 })) {
        keys.push(key);
    }

    const entries = [];
    const chunkSize = 100;

    for (let index = 0; index < keys.length; index += chunkSize) {
        const chunkKeys = keys.slice(index, index + chunkSize);
        const chunkValues = await Promise.all(chunkKeys.map((key) => kv.get(key)));

        chunkKeys.forEach((key, chunkIndex) => {
            const address = key.slice(KEY_PREFIX.length).toLowerCase();
            const totalBet = toNumericBet(chunkValues[chunkIndex]);
            if (!address || totalBet <= 0) return;
            entries.push({ address, totalBet });
        });
    }

    entries.sort((left, right) => {
        if (right.totalBet !== left.totalBet) return right.totalBet - left.totalBet;
        return left.address.localeCompare(right.address);
    });

    return entries;
}

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    applyLeaderboardCacheHeaders(res, LEADERBOARD_CACHE_TTL_SECONDS);

    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") {
        return res.status(405).json({ success: false, error: "Method Not Allowed" });
    }

    try {
        const body = req.body || {};
        const sessionId = normalizeSessionId(body.sessionId);
        const limit = normalizeLimit(body.limit);

        if (!sessionId) {
            return res.status(400).json({ success: false, error: "缺少 sessionId" });
        }

        const session = await kv.get(`session:${sessionId}`);
        if (!session || !session.address) {
            return res.status(403).json({ success: false, error: "會話過期，請重新登入" });
        }

        const currentAddress = String(session.address || "").trim().toLowerCase();
        let cached = await getCachedLeaderboard("total_bet_v1");
        if (!cached || !Array.isArray(cached.entries)) {
            const entries = await loadTotalBetEntries();
            cached = {
                generatedAt: new Date().toISOString(),
                entries: entries.map((entry) => ({
                    address: entry.address,
                    totalBet: entry.totalBet
                }))
            };
            await setCachedLeaderboard("total_bet_v1", cached, LEADERBOARD_CACHE_TTL_SECONDS);
        }

        const entries = cached.entries.map((entry) => ({
            address: entry.address,
            totalBet: Number(entry.totalBet || 0)
        }));
        const leaderboard = entries.slice(0, limit).map((entry, index) => {
            const vipStatus = buildVipStatus(entry.totalBet);
            return {
                rank: index + 1,
                address: entry.address,
                maskedAddress: maskAddress(entry.address),
                totalBet: entry.totalBet.toFixed(2),
                vipLevel: vipStatus.vipLevel,
                maxBet: String(vipStatus.maxBet)
            };
        });

        const myIndex = entries.findIndex((entry) => entry.address === currentAddress);
        const myRank = myIndex >= 0 ? entries[myIndex] : null;

        return res.status(200).json({
            success: true,
            generatedAt: cached.generatedAt || new Date().toISOString(),
            totalPlayers: entries.length,
            leaderboard,
            myRank: myRank ? {
                rank: myIndex + 1,
                address: myRank.address,
                maskedAddress: maskAddress(myRank.address),
                totalBet: myRank.totalBet.toFixed(2),
                vipLevel: buildVipStatus(myRank.totalBet).vipLevel,
                maxBet: String(buildVipStatus(myRank.totalBet).maxBet)
            } : null
        });
    } catch (error) {
        console.error("Leaderboard Error:", error);
        return res.status(500).json({
            success: false,
            error: "無法讀取排行榜",
            details: error.message
        });
    }
}
