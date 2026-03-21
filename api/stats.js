import { kv } from "@vercel/kv";
import { ethers } from "ethers";
import { getSession } from "../lib/session-store.js";
import { buildVipStatus } from "../lib/vip.js";
import { buildDisplayNameMap } from "../lib/user-profile.js";
import { buildRewardDisplayMap, getRewardProfile, saveRewardProfile } from "../lib/reward-center.js";
import { settlementService } from "../lib/settlement-service.js";
import { getPeriodSnapshot, formatPeriodIso } from "../lib/leaderboard-period.js";
import { applyReadCacheHeaders, readThroughCache } from "../lib/read-cache.js";
import {
    buildAccountSummary,
    buildMarketSnapshot,
    normalizeMarketAccount,
    settleLiquidations
} from "../lib/market-sim.js";

const TOTAL_BET_PREFIX = "total_bet:";
const WEEK_BET_PREFIX = "total_bet_week:";
const MONTH_BET_PREFIX = "total_bet_month:";
const SEASON_BET_PREFIX = "total_bet_season:";
const MARKET_SIM_PREFIX = "market_sim:";
const MAX_LIMIT = 100;
const PERIOD_TITLES = {
    weekly: "weekly_champion",
    monthly: "monthly_champion",
    season: "season_king"
};

async function getDecimals() {
    return settlementService.getDecimals();
}

function getSafeBody(req) {
    if (!req || typeof req !== "object") return {};
    const rawBody = req.body;
    if (!rawBody) return {};
    if (typeof rawBody === "string") {
        try {
            const parsed = JSON.parse(rawBody);
            return parsed && typeof parsed === "object" ? parsed : {};
        } catch {
            return {};
        }
    }
    return typeof rawBody === "object" ? rawBody : {};
}

function normalizeSessionId(rawValue) {
    return String(rawValue || "").trim();
}

function normalizeLimit(rawValue) {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed <= 0) return 50;
    return Math.min(MAX_LIMIT, Math.floor(parsed));
}

function toNumericValue(rawValue) {
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
    for await (const key of kv.scanIterator({ match: `${TOTAL_BET_PREFIX}*`, count: 1000 })) {
        keys.push(key);
    }
    const entries = [];
    const chunkSize = 100;
    for (let index = 0; index < keys.length; index += chunkSize) {
        const chunkKeys = keys.slice(index, index + chunkSize);
        const chunkValues = await Promise.all(chunkKeys.map((key) => kv.get(key)));
        chunkKeys.forEach((key, chunkIndex) => {
            const address = key.slice(TOTAL_BET_PREFIX.length).toLowerCase();
            const totalBet = toNumericValue(chunkValues[chunkIndex]);
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

function getPeriodPrefix(type) {
    switch (type) {
        case "weekly":
            return WEEK_BET_PREFIX;
        case "monthly":
            return MONTH_BET_PREFIX;
        case "season":
            return SEASON_BET_PREFIX;
        default:
            return TOTAL_BET_PREFIX;
    }
}

async function loadPeriodBetEntries(type, periodId) {
    const prefix = getPeriodPrefix(type);
    const keys = [];
    for await (const key of kv.scanIterator({ match: `${prefix}${periodId}:*`, count: 1000 })) {
        keys.push(key);
    }
    const entries = [];
    const chunkSize = 100;
    for (let index = 0; index < keys.length; index += chunkSize) {
        const chunkKeys = keys.slice(index, index + chunkSize);
        const chunkValues = await Promise.all(chunkKeys.map((key) => kv.get(key)));
        chunkKeys.forEach((key, chunkIndex) => {
            const address = key.slice(`${prefix}${periodId}:`.length).toLowerCase();
            const totalBet = toNumericValue(chunkValues[chunkIndex]);
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

async function loadTotalBetMap(addresses) {
    const map = new Map();
    const chunkSize = 100;
    for (let index = 0; index < addresses.length; index += chunkSize) {
        const chunk = addresses.slice(index, index + chunkSize);
        const values = await Promise.all(chunk.map((address) => kv.get(`${TOTAL_BET_PREFIX}${address}`)));
        chunk.forEach((address, i) => {
            map.set(address, toNumericValue(values[i]));
        });
    }
    return map;
}

function parseDateIdToMs(dateId, tzOffsetHours) {
    if (!dateId || dateId.length !== 8) return null;
    const year = Number(dateId.slice(0, 4));
    const month = Number(dateId.slice(4, 6));
    const day = Number(dateId.slice(6, 8));
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
    return Date.UTC(year, month - 1, day) - (tzOffsetHours * 60 * 60 * 1000);
}

function parsePeriodWindow(type, periodId, snapshot) {
    const tzOffsetHours = snapshot.tzOffsetHours || 0;
    if (type === "weekly") {
        const startMs = parseDateIdToMs(periodId, tzOffsetHours);
        if (startMs === null) return null;
        return { startMs, endMs: startMs + 7 * 24 * 60 * 60 * 1000 };
    }
    if (type === "monthly") {
        const parts = String(periodId || "").split("-");
        if (parts.length !== 2) return null;
        const year = Number(parts[0]);
        const month = Number(parts[1]);
        if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
        const startMs = Date.UTC(year, month - 1, 1) - (tzOffsetHours * 60 * 60 * 1000);
        const endMs = Date.UTC(year, month, 1) - (tzOffsetHours * 60 * 60 * 1000);
        return { startMs, endMs };
    }
    if (type === "season") {
        const parts = String(periodId || "").split("-");
        const datePart = parts.length > 1 ? parts[1] : "";
        const startMs = parseDateIdToMs(datePart, tzOffsetHours);
        if (startMs === null) return null;
        const seasonWeeks = snapshot.seasonWeeks || 8;
        return { startMs, endMs: startMs + seasonWeeks * 7 * 24 * 60 * 60 * 1000 };
    }
    return null;
}

async function ensurePeriodSettlement(type, currentPeriod, snapshot) {
    const currentPeriodId = currentPeriod.id;
    const currentKey = `leaderboard_settlement:${type}:current_period`;
    const winnerKey = `system_title:${type}:current_winner`;
    const lastPeriodId = String(await kv.get(currentKey) || "");

    if (!lastPeriodId) {
        await kv.set(currentKey, currentPeriodId);
        return;
    }

    if (lastPeriodId === currentPeriodId) return;

    const window = parsePeriodWindow(type, lastPeriodId, snapshot);
    const entries = await loadPeriodBetEntries(type, lastPeriodId);
    const winner = entries.length ? entries[0] : null;
    const winnerAddress = winner ? winner.address : "";
    const previousWinner = String(await kv.get(winnerKey) || "");
    const prevStreak = Number(previousWinner ? await kv.get(`system_title:${type}:streak:${previousWinner}`) : 0) || 0;
    const streak = winnerAddress && winnerAddress === previousWinner ? prevStreak + 1 : (winnerAddress ? 1 : 0);

    if (winnerAddress) {
        await kv.set(winnerKey, winnerAddress);
        await kv.set(`system_title:${type}:streak:${winnerAddress}`, streak);
        await kv.set(`system_title:${type}:last_settled_period`, lastPeriodId);
        await kv.set(`system_title:${type}:history:${lastPeriodId}`, {
            periodId: lastPeriodId,
            winner: winnerAddress,
            totalBet: winner.totalBet,
            streak,
            settledAt: new Date().toISOString(),
            startAt: window ? new Date(window.startMs).toISOString() : null,
            endAt: window ? new Date(window.endMs).toISOString() : null
        });

        const profile = await getRewardProfile(winnerAddress);
        profile.systemTitleStreaks = profile.systemTitleStreaks || {};
        profile.systemTitleStreaks[type] = {
            count: streak,
            periodId: lastPeriodId,
            settledAt: new Date().toISOString()
        };
        await saveRewardProfile(profile);
    }

    await kv.set(currentKey, currentPeriodId);
}

async function buildPeriodLeaderboard(type, period, currentAddress, limit, snapshot) {
    await ensurePeriodSettlement(type, period, snapshot);
    const entries = await loadPeriodBetEntries(type, period.id);
    const addresses = entries.map((entry) => entry.address);
    const totalBetMap = await loadTotalBetMap(addresses);
    const displayNameMap = await buildDisplayNameMap(addresses);
    const rewardDisplayMap = await buildRewardDisplayMap(addresses, (address) => totalBetMap.get(address) || 0);

    const leaderboard = entries.slice(0, limit).map((entry, index) => {
        const vipStatus = buildVipStatus(totalBetMap.get(entry.address) || 0);
        const rewardDisplay = rewardDisplayMap.get(entry.address) || {};
        return {
            rank: index + 1,
            address: entry.address,
            displayName: displayNameMap.get(entry.address) || "",
            maskedAddress: maskAddress(entry.address),
            totalBet: entry.totalBet.toFixed(2),
            level: vipStatus.vipLevel,
            betLimit: String(vipStatus.maxBet),
            levelSystem: { key: "legacy_v1", label: "等級制度 v1" },
            avatar: rewardDisplay.avatar || null,
            title: rewardDisplay.title || null
        };
    });

    const myIndex = entries.findIndex((entry) => entry.address === currentAddress);
    let myRank = null;
    if (myIndex >= 0) {
        const entry = entries[myIndex];
        const vipStatus = buildVipStatus(totalBetMap.get(entry.address) || 0);
        const rewardDisplay = rewardDisplayMap.get(entry.address) || {};
        myRank = {
            rank: myIndex + 1,
            address: entry.address,
            displayName: displayNameMap.get(entry.address) || "",
            maskedAddress: maskAddress(entry.address),
            totalBet: entry.totalBet.toFixed(2),
            level: vipStatus.vipLevel,
            betLimit: String(vipStatus.maxBet),
            levelSystem: { key: "legacy_v1", label: "等級制度 v1" },
            avatar: rewardDisplay.avatar || null,
            title: rewardDisplay.title || null
        };
    }

    const prefix = getPeriodPrefix(type);
    const myPeriodBet = toNumericValue(await kv.get(`${prefix}${period.id}:${currentAddress}`));
    const periodInfo = Object.assign({ type, id: period.id }, formatPeriodIso(period));

    return {
        period: periodInfo,
        totalPlayers: entries.length,
        leaderboard,
        myRank,
        myPeriodBet: myPeriodBet.toFixed(2)
    };
}

async function loadKnownUsers(currentAddress) {
    const addressSet = new Set();
    const totalBetMap = new Map();
    const keys = [];
    for await (const key of kv.scanIterator({ match: `${TOTAL_BET_PREFIX}*`, count: 1000 })) {
        keys.push(key);
    }
    const chunkValues = await Promise.all(keys.map(key => kv.get(key)));
    keys.forEach((key, i) => {
        const address = key.slice(TOTAL_BET_PREFIX.length).toLowerCase();
        if (!address) return;
        const totalBet = toNumericValue(chunkValues[i]);
        addressSet.add(address);
        totalBetMap.set(address, totalBet);
    });
    for await (const key of kv.scanIterator({ match: `${MARKET_SIM_PREFIX}*`, count: 1000 })) {
        const address = key.slice(MARKET_SIM_PREFIX.length).toLowerCase();
        if (!address) continue;
        addressSet.add(address);
        if (!totalBetMap.has(address)) totalBetMap.set(address, 0);
    }
    if (currentAddress) {
        addressSet.add(currentAddress);
        if (!totalBetMap.has(currentAddress)) totalBetMap.set(currentAddress, 0);
    }
    return { addresses: Array.from(addressSet), totalBetMap };
}

async function loadBalanceEntries(addresses, totalBetMap) {
    if (addresses.length === 0) return [];
    const nowTs = Date.now();
    const market = buildMarketSnapshot(nowTs);
    const decimals = await getDecimals();
    const contract = settlementService.contract;
    const entries = [];
    const chunkSize = 20;
    for (let index = 0; index < addresses.length; index += chunkSize) {
        const chunk = addresses.slice(index, index + chunkSize);
        const balances = await Promise.all(chunk.map(async (address) => {
            try {
                const [balanceWei, marketDataRaw] = await Promise.all([
                    contract.balanceOf(address),
                    kv.get(`${MARKET_SIM_PREFIX}${address}`)
                ]);
                const walletBalance = Number(ethers.formatUnits(balanceWei, decimals));
                const marketAccount = normalizeMarketAccount(marketDataRaw, nowTs);
                marketAccount.cash = walletBalance;
                settleLiquidations(marketAccount, market, nowTs);
                const summary = buildAccountSummary(marketAccount, market);
                return { address, walletBalance, netWorth: Number(summary.netWorth || 0), bankBalance: Number(summary.bankBalance || 0), stockValue: Number(summary.stockValue || 0), futuresUnrealizedPnl: Number(summary.futuresUnrealizedPnl || 0), loanPrincipal: Number(summary.loanPrincipal || 0) };
            } catch {
                return { address, walletBalance: 0, netWorth: 0, bankBalance: 0, stockValue: 0, futuresUnrealizedPnl: 0, loanPrincipal: 0 };
            }
        }));
        balances.forEach((item) => {
            if (!Number.isFinite(item.netWorth) || item.netWorth <= 0) return;
            const totalBet = totalBetMap.get(item.address) || 0;
            entries.push({ address: item.address, netWorth: item.netWorth, walletBalance: item.walletBalance, bankBalance: item.bankBalance, stockValue: item.stockValue, futuresUnrealizedPnl: item.futuresUnrealizedPnl, loanPrincipal: item.loanPrincipal, totalBet });
        });
    }
    entries.sort((left, right) => { if (right.netWorth !== left.netWorth) return right.netWorth - left.netWorth; return left.address.localeCompare(right.address); });
    return entries;
}

function applyStatsReadHeaders(res, meta) {
    if (!res) return;
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    applyReadCacheHeaders(res, meta);
}

function buildTotalBetValueMap(entries) {
    const totals = new Map();
    for (const entry of entries) {
        totals.set(entry.address, Number(entry.totalBet || 0));
    }
    return totals;
}

function buildNetWorthValueMap(entries) {
    const totals = new Map();
    for (const entry of entries) {
        totals.set(entry.address, Number(entry.totalBet || 0));
    }
    return totals;
}

async function loadTotalBetSnapshot() {
    const entries = await loadTotalBetEntries();
    return {
        generatedAt: new Date().toISOString(),
        entries: entries.map((entry) => ({
            address: entry.address,
            totalBet: entry.totalBet
        }))
    };
}

async function loadPeriodLeaderboardSnapshot(type, period, snapshot) {
    await ensurePeriodSettlement(type, period, snapshot);
    const entries = await loadPeriodBetEntries(type, period.id);
    return {
        generatedAt: new Date().toISOString(),
        period: Object.assign({ type, id: period.id }, formatPeriodIso(period)),
        entries: entries.map((entry) => ({
            address: entry.address,
            totalBet: entry.totalBet
        }))
    };
}

async function loadNetWorthSnapshot() {
    const { addresses, totalBetMap } = await loadKnownUsers("");
    const entries = await loadBalanceEntries(addresses, totalBetMap);
    return {
        generatedAt: new Date().toISOString(),
        entries: entries.map((entry) => ({
            address: entry.address,
            netWorth: entry.netWorth,
            walletBalance: entry.walletBalance,
            bankBalance: entry.bankBalance,
            stockValue: entry.stockValue,
            futuresUnrealizedPnl: entry.futuresUnrealizedPnl,
            loanPrincipal: entry.loanPrincipal,
            totalBet: entry.totalBet
        }))
    };
}

async function loadCurrentNetWorthEntry(currentAddress) {
    if (!currentAddress) return null;
    const { totalBetMap } = await loadKnownUsers(currentAddress);
    const currentEntries = await loadBalanceEntries([currentAddress], totalBetMap);
    return currentEntries[0] || null;
}

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") return res.status(405).json({ success: false, error: "Method Not Allowed" });
    try {
        const body = getSafeBody(req);
        const action = String(body.action || "total_bet").trim().toLowerCase();
        const sessionId = normalizeSessionId(body.sessionId);
        const limit = normalizeLimit(body.limit);
        if (!sessionId) return res.status(400).json({ success: false, error: "Missing sessionId" });
        const session = await getSession(sessionId);
        if (!session || !session.address) return res.status(403).json({ success: false, error: "Session expired" });
        const currentAddress = String(session.address || "").trim().toLowerCase();
        const periodSnapshot = getPeriodSnapshot();
        if (action === "total_bet") {
            const cached = await readThroughCache({
                namespace: "leaderboard",
                keyParts: ["total_bet"],
                tier: "public-heavy",
                loader: loadTotalBetSnapshot
            });
            applyStatsReadHeaders(res, cached.meta);
            const entries = (cached.value.entries || []).map((entry) => ({ address: entry.address, totalBet: Number(entry.totalBet || 0) }));
            const totalBetMap = buildTotalBetValueMap(entries);
            const entryAddresses = entries.map((entry) => entry.address);
            const displayNameMap = await buildDisplayNameMap(entryAddresses);
            const rewardDisplayMap = await buildRewardDisplayMap(entryAddresses, (address) => totalBetMap.get(address) || 0);
            const leaderboard = entries.slice(0, limit).map((entry, index) => {
                const vipStatus = buildVipStatus(entry.totalBet);
                const rewardDisplay = rewardDisplayMap.get(entry.address) || {};
                return { rank: index + 1, address: entry.address, displayName: displayNameMap.get(entry.address) || "", maskedAddress: maskAddress(entry.address), totalBet: entry.totalBet.toFixed(2), level: vipStatus.vipLevel, betLimit: String(vipStatus.maxBet), avatar: rewardDisplay.avatar || null, title: rewardDisplay.title || null };
            });
            const myIndex = entries.findIndex((entry) => entry.address === currentAddress);
            const myRank = myIndex >= 0 ? entries[myIndex] : null;
            return res.status(200).json({
                success: true, generatedAt: cached.value.generatedAt || new Date().toISOString(), totalPlayers: entries.length, leaderboard,
                myRank: myRank ? { rank: myIndex + 1, address: myRank.address, displayName: displayNameMap.get(myRank.address) || "", maskedAddress: maskAddress(myRank.address), totalBet: myRank.totalBet.toFixed(2), level: buildVipStatus(myRank.totalBet).vipLevel, betLimit: String(buildVipStatus(myRank.totalBet).maxBet), avatar: (rewardDisplayMap.get(myRank.address) || {}).avatar || null, title: (rewardDisplayMap.get(myRank.address) || {}).title || null } : null
            });
        }
        if (action === "weekly_bet") {
            const cached = await readThroughCache({
                namespace: "leaderboard",
                keyParts: ["weekly_bet", periodSnapshot.week.id],
                tier: "public-heavy",
                loader: async () => loadPeriodLeaderboardSnapshot("weekly", periodSnapshot.week, periodSnapshot)
            });
            applyStatsReadHeaders(res, cached.meta);
            const entries = (cached.value.entries || []).map((entry) => ({ address: entry.address, totalBet: Number(entry.totalBet || 0) }));
            const addresses = entries.map((entry) => entry.address);
            const totalBetMap = await loadTotalBetMap(addresses);
            const displayNameMap = await buildDisplayNameMap(addresses);
            const rewardDisplayMap = await buildRewardDisplayMap(addresses, (address) => totalBetMap.get(address) || 0);
            const leaderboard = entries.slice(0, limit).map((entry, index) => {
                const vipStatus = buildVipStatus(totalBetMap.get(entry.address) || 0);
                const rewardDisplay = rewardDisplayMap.get(entry.address) || {};
                return {
                    rank: index + 1,
                    address: entry.address,
                    displayName: displayNameMap.get(entry.address) || "",
                    maskedAddress: maskAddress(entry.address),
                    totalBet: entry.totalBet.toFixed(2),
                    level: vipStatus.vipLevel,
                    betLimit: String(vipStatus.maxBet),
                    levelSystem: { key: "legacy_v1", label: "蝑??嗅漲 v1" },
                    avatar: rewardDisplay.avatar || null,
                    title: rewardDisplay.title || null
                };
            });
            const myIndex = entries.findIndex((entry) => entry.address === currentAddress);
            const myEntry = myIndex >= 0 ? entries[myIndex] : null;
            return res.status(200).json({
                success: true,
                generatedAt: cached.value.generatedAt || new Date().toISOString(),
                period: cached.value.period,
                totalPlayers: entries.length,
                leaderboard,
                myRank: myEntry ? {
                    rank: myIndex + 1,
                    address: myEntry.address,
                    displayName: displayNameMap.get(myEntry.address) || "",
                    maskedAddress: maskAddress(myEntry.address),
                    totalBet: myEntry.totalBet.toFixed(2),
                    level: buildVipStatus(totalBetMap.get(myEntry.address) || 0).vipLevel,
                    betLimit: String(buildVipStatus(totalBetMap.get(myEntry.address) || 0).maxBet),
                    levelSystem: { key: "legacy_v1", label: "蝑??嗅漲 v1" },
                    avatar: (rewardDisplayMap.get(myEntry.address) || {}).avatar || null,
                    title: (rewardDisplayMap.get(myEntry.address) || {}).title || null
                } : null,
                myPeriodBet: (myEntry ? myEntry.totalBet : 0).toFixed(2)
            });
        }
        if (action === "monthly_bet") {
            const cached = await readThroughCache({
                namespace: "leaderboard",
                keyParts: ["monthly_bet", periodSnapshot.month.id],
                tier: "public-heavy",
                loader: async () => loadPeriodLeaderboardSnapshot("monthly", periodSnapshot.month, periodSnapshot)
            });
            applyStatsReadHeaders(res, cached.meta);
            const entries = (cached.value.entries || []).map((entry) => ({ address: entry.address, totalBet: Number(entry.totalBet || 0) }));
            const addresses = entries.map((entry) => entry.address);
            const totalBetMap = await loadTotalBetMap(addresses);
            const displayNameMap = await buildDisplayNameMap(addresses);
            const rewardDisplayMap = await buildRewardDisplayMap(addresses, (address) => totalBetMap.get(address) || 0);
            const leaderboard = entries.slice(0, limit).map((entry, index) => {
                const vipStatus = buildVipStatus(totalBetMap.get(entry.address) || 0);
                const rewardDisplay = rewardDisplayMap.get(entry.address) || {};
                return {
                    rank: index + 1,
                    address: entry.address,
                    displayName: displayNameMap.get(entry.address) || "",
                    maskedAddress: maskAddress(entry.address),
                    totalBet: entry.totalBet.toFixed(2),
                    level: vipStatus.vipLevel,
                    betLimit: String(vipStatus.maxBet),
                    levelSystem: { key: "legacy_v1", label: "蝑??嗅漲 v1" },
                    avatar: rewardDisplay.avatar || null,
                    title: rewardDisplay.title || null
                };
            });
            const myIndex = entries.findIndex((entry) => entry.address === currentAddress);
            const myEntry = myIndex >= 0 ? entries[myIndex] : null;
            return res.status(200).json({
                success: true,
                generatedAt: cached.value.generatedAt || new Date().toISOString(),
                period: cached.value.period,
                totalPlayers: entries.length,
                leaderboard,
                myRank: myEntry ? {
                    rank: myIndex + 1,
                    address: myEntry.address,
                    displayName: displayNameMap.get(myEntry.address) || "",
                    maskedAddress: maskAddress(myEntry.address),
                    totalBet: myEntry.totalBet.toFixed(2),
                    level: buildVipStatus(totalBetMap.get(myEntry.address) || 0).vipLevel,
                    betLimit: String(buildVipStatus(totalBetMap.get(myEntry.address) || 0).maxBet),
                    levelSystem: { key: "legacy_v1", label: "蝑??嗅漲 v1" },
                    avatar: (rewardDisplayMap.get(myEntry.address) || {}).avatar || null,
                    title: (rewardDisplayMap.get(myEntry.address) || {}).title || null
                } : null,
                myPeriodBet: (myEntry ? myEntry.totalBet : 0).toFixed(2)
            });
        }
        if (action === "season_bet") {
            const cached = await readThroughCache({
                namespace: "leaderboard",
                keyParts: ["season_bet", periodSnapshot.season.id],
                tier: "public-heavy",
                loader: async () => loadPeriodLeaderboardSnapshot("season", periodSnapshot.season, periodSnapshot)
            });
            applyStatsReadHeaders(res, cached.meta);
            const entries = (cached.value.entries || []).map((entry) => ({ address: entry.address, totalBet: Number(entry.totalBet || 0) }));
            const addresses = entries.map((entry) => entry.address);
            const totalBetMap = await loadTotalBetMap(addresses);
            const displayNameMap = await buildDisplayNameMap(addresses);
            const rewardDisplayMap = await buildRewardDisplayMap(addresses, (address) => totalBetMap.get(address) || 0);
            const leaderboard = entries.slice(0, limit).map((entry, index) => {
                const vipStatus = buildVipStatus(totalBetMap.get(entry.address) || 0);
                const rewardDisplay = rewardDisplayMap.get(entry.address) || {};
                return {
                    rank: index + 1,
                    address: entry.address,
                    displayName: displayNameMap.get(entry.address) || "",
                    maskedAddress: maskAddress(entry.address),
                    totalBet: entry.totalBet.toFixed(2),
                    level: vipStatus.vipLevel,
                    betLimit: String(vipStatus.maxBet),
                    levelSystem: { key: "legacy_v1", label: "蝑??嗅漲 v1" },
                    avatar: rewardDisplay.avatar || null,
                    title: rewardDisplay.title || null
                };
            });
            const myIndex = entries.findIndex((entry) => entry.address === currentAddress);
            const myEntry = myIndex >= 0 ? entries[myIndex] : null;
            return res.status(200).json({
                success: true,
                generatedAt: cached.value.generatedAt || new Date().toISOString(),
                period: cached.value.period,
                totalPlayers: entries.length,
                leaderboard,
                myRank: myEntry ? {
                    rank: myIndex + 1,
                    address: myEntry.address,
                    displayName: displayNameMap.get(myEntry.address) || "",
                    maskedAddress: maskAddress(myEntry.address),
                    totalBet: myEntry.totalBet.toFixed(2),
                    level: buildVipStatus(totalBetMap.get(myEntry.address) || 0).vipLevel,
                    betLimit: String(buildVipStatus(totalBetMap.get(myEntry.address) || 0).maxBet),
                    levelSystem: { key: "legacy_v1", label: "蝑??嗅漲 v1" },
                    avatar: (rewardDisplayMap.get(myEntry.address) || {}).avatar || null,
                    title: (rewardDisplayMap.get(myEntry.address) || {}).title || null
                } : null,
                myPeriodBet: (myEntry ? myEntry.totalBet : 0).toFixed(2)
            });
        }
        if (action === "net_worth") {
            const cached = await readThroughCache({
                namespace: "leaderboard",
                keyParts: ["net_worth"],
                tier: "public-heavy",
                loader: loadNetWorthSnapshot
            });
            applyStatsReadHeaders(res, cached.meta);
            const entries = (cached.value.entries || []).map((entry) => ({ address: entry.address, netWorth: Number(entry.netWorth || 0), walletBalance: Number(entry.walletBalance || 0), bankBalance: Number(entry.bankBalance || 0), stockValue: Number(entry.stockValue || 0), futuresUnrealizedPnl: Number(entry.futuresUnrealizedPnl || 0), loanPrincipal: Number(entry.loanPrincipal || 0), totalBet: Number(entry.totalBet || 0) }));
            if (currentAddress && !entries.some((entry) => entry.address === currentAddress)) {
                const currentOnlyEntry = await loadCurrentNetWorthEntry(currentAddress);
                if (currentOnlyEntry) {
                    entries.push(currentOnlyEntry);
                    entries.sort((left, right) => { if (right.netWorth !== left.netWorth) return right.netWorth - left.netWorth; return left.address.localeCompare(right.address); });
                }
            }
            const displayNameMap = await buildDisplayNameMap(entries.map((entry) => entry.address));
            const totalBetMap = buildNetWorthValueMap(entries);
            const rewardDisplayMap = await buildRewardDisplayMap(entries.map((entry) => entry.address), (address) => totalBetMap.get(address) || 0);
            const leaderboard = entries.slice(0, limit).map((entry, index) => {
                const vipStatus = buildVipStatus(entry.totalBet);
                const rewardDisplay = rewardDisplayMap.get(entry.address) || {};
                return { rank: index + 1, address: entry.address, displayName: displayNameMap.get(entry.address) || "", maskedAddress: maskAddress(entry.address), netWorth: entry.netWorth.toFixed(2), walletBalance: entry.walletBalance.toFixed(2), bankBalance: entry.bankBalance.toFixed(2), stockValue: entry.stockValue.toFixed(2), futuresUnrealizedPnl: entry.futuresUnrealizedPnl.toFixed(2), loanPrincipal: entry.loanPrincipal.toFixed(2), totalBet: entry.totalBet.toFixed(2), level: vipStatus.vipLevel, avatar: rewardDisplay.avatar || null, title: rewardDisplay.title || null };
            });
            const myIndex = entries.findIndex((entry) => entry.address === currentAddress);
            const myRank = myIndex >= 0 ? entries[myIndex] : null;
            return res.status(200).json({
                success: true, generatedAt: cached.value.generatedAt || new Date().toISOString(), totalPlayers: entries.length, leaderboard,
                myRank: myRank ? { rank: myIndex + 1, address: myRank.address, displayName: displayNameMap.get(myRank.address) || "", maskedAddress: maskAddress(myRank.address), netWorth: myRank.netWorth.toFixed(2), walletBalance: myRank.walletBalance.toFixed(2), bankBalance: myRank.bankBalance.toFixed(2), stockValue: myRank.stockValue.toFixed(2), futuresUnrealizedPnl: myRank.futuresUnrealizedPnl.toFixed(2), loanPrincipal: myRank.loanPrincipal.toFixed(2), totalBet: myRank.totalBet.toFixed(2), level: buildVipStatus(myRank.totalBet).vipLevel, avatar: (rewardDisplayMap.get(myRank.address) || {}).avatar || null, title: (rewardDisplayMap.get(myRank.address) || {}).title || null } : null
            });
        }
        return res.status(400).json({ success: false, error: `Unsupported action: ${action}`, supportedActions: ["total_bet", "weekly_bet", "monthly_bet", "season_bet", "net_worth"] });
    } catch (error) {
        console.error("Stats API Error:", error);
        return res.status(500).json({ success: false, error: error.message || "Stats API failed" });
    }
}
