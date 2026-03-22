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
const HALL_OF_FAME_CACHE_TIER = {
    l1FreshSeconds: 60,
    l1StaleSeconds: 24 * 60 * 60,
    l2FreshSeconds: 60 * 60,
    l2StaleSeconds: 7 * 24 * 60 * 60,
    persistLastValue: true
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

function collectRequestedLeaderboardAddresses(entries, currentAddress, limit) {
    const result = new Set();
    const normalizedCurrent = String(currentAddress || "").trim().toLowerCase();
    const topEntries = Array.isArray(entries) ? entries.slice(0, Math.max(1, Number(limit) || 50)) : [];
    for (const entry of topEntries) {
        if (entry && entry.address) result.add(String(entry.address).toLowerCase());
    }
    if (normalizedCurrent && Array.isArray(entries) && entries.some((entry) => entry.address === normalizedCurrent)) {
        result.add(normalizedCurrent);
    }
    return Array.from(result);
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

function normalizeEntriesFromSnapshot(rawEntries, mode = "bet") {
    const entries = Array.isArray(rawEntries) ? rawEntries : [];
    if (mode === "net_worth") {
        return entries.map((entry) => ({
            address: entry.address,
            netWorth: Number(entry.netWorth || 0),
            walletBalance: Number(entry.walletBalance || 0),
            bankBalance: Number(entry.bankBalance || 0),
            stockValue: Number(entry.stockValue || 0),
            futuresUnrealizedPnl: Number(entry.futuresUnrealizedPnl || 0),
            loanPrincipal: Number(entry.loanPrincipal || 0),
            totalBet: Number(entry.totalBet || 0)
        }));
    }
    return entries.map((entry) => ({
        address: entry.address,
        totalBet: Number(entry.totalBet || 0)
    }));
}

function collectTopAddresses(entries, limit) {
    return (Array.isArray(entries) ? entries : [])
        .slice(0, Math.max(1, Number(limit) || 50))
        .map((entry) => String(entry && entry.address || "").trim().toLowerCase())
        .filter(Boolean);
}

function buildBetLeaderboardRows(entries, limit, displayNameMap, rewardDisplayMap, totalBetMap) {
    return entries.slice(0, limit).map((entry, index) => {
        const vipStatus = buildVipStatus(totalBetMap.get(entry.address) || entry.totalBet || 0);
        const rewardDisplay = rewardDisplayMap.get(entry.address) || {};
        return {
            rank: index + 1,
            address: entry.address,
            displayName: displayNameMap.get(entry.address) || "",
            maskedAddress: maskAddress(entry.address),
            totalBet: Number(entry.totalBet || 0).toFixed(2),
            level: vipStatus.vipLevel,
            betLimit: String(vipStatus.maxBet),
            levelSystem: { key: "legacy_v1", label: "legacy_v1" },
            avatar: rewardDisplay.avatar || null,
            title: rewardDisplay.title || null
        };
    });
}

function buildNetWorthLeaderboardRows(entries, limit, displayNameMap, rewardDisplayMap) {
    return entries.slice(0, limit).map((entry, index) => {
        const vipStatus = buildVipStatus(entry.totalBet || 0);
        const rewardDisplay = rewardDisplayMap.get(entry.address) || {};
        return {
            rank: index + 1,
            address: entry.address,
            displayName: displayNameMap.get(entry.address) || "",
            maskedAddress: maskAddress(entry.address),
            netWorth: Number(entry.netWorth || 0).toFixed(2),
            walletBalance: Number(entry.walletBalance || 0).toFixed(2),
            bankBalance: Number(entry.bankBalance || 0).toFixed(2),
            stockValue: Number(entry.stockValue || 0).toFixed(2),
            futuresUnrealizedPnl: Number(entry.futuresUnrealizedPnl || 0).toFixed(2),
            loanPrincipal: Number(entry.loanPrincipal || 0).toFixed(2),
            totalBet: Number(entry.totalBet || 0).toFixed(2),
            level: vipStatus.vipLevel,
            avatar: rewardDisplay.avatar || null,
            title: rewardDisplay.title || null
        };
    });
}

async function loadHydratedTotalBetView(limit) {
    const rawCached = await readThroughCache({
        namespace: "leaderboard",
        keyParts: ["total_bet"],
        tier: "public-heavy",
        loader: loadTotalBetSnapshot
    });
    const entries = normalizeEntriesFromSnapshot(rawCached.value.entries, "bet");
    const totalBetMap = buildTotalBetValueMap(entries);
    const requestedAddresses = collectTopAddresses(entries, limit);
    const displayNameMap = await buildDisplayNameMap(requestedAddresses);
    const rewardDisplayMap = await buildRewardDisplayMap(requestedAddresses, (address) => totalBetMap.get(address) || 0);
    return {
        generatedAt: rawCached.value.generatedAt || rawCached.meta.generatedAt || new Date().toISOString(),
        totalPlayers: entries.length,
        leaderboard: buildBetLeaderboardRows(entries, limit, displayNameMap, rewardDisplayMap, totalBetMap)
    };
}

async function loadHydratedPeriodBetView(type, period, snapshot, limit) {
    const rawCached = await readThroughCache({
        namespace: "leaderboard",
        keyParts: [`${type}_bet`, period.id],
        tier: "public-heavy",
        loader: async () => loadPeriodLeaderboardSnapshot(type, period, snapshot)
    });
    const entries = normalizeEntriesFromSnapshot(rawCached.value.entries, "bet");
    const requestedAddresses = collectTopAddresses(entries, limit);
    const totalBetMap = await loadTotalBetMap(requestedAddresses);
    const displayNameMap = await buildDisplayNameMap(requestedAddresses);
    const rewardDisplayMap = await buildRewardDisplayMap(requestedAddresses, (address) => totalBetMap.get(address) || 0);
    return {
        generatedAt: rawCached.value.generatedAt || rawCached.meta.generatedAt || new Date().toISOString(),
        period: rawCached.value.period || Object.assign({ type, id: period.id }, formatPeriodIso(period)),
        totalPlayers: entries.length,
        leaderboard: buildBetLeaderboardRows(entries, limit, displayNameMap, rewardDisplayMap, totalBetMap)
    };
}

async function loadHydratedNetWorthView(limit) {
    const rawCached = await readThroughCache({
        namespace: "leaderboard",
        keyParts: ["net_worth"],
        tier: "public-heavy",
        loader: loadNetWorthSnapshot
    });
    const entries = normalizeEntriesFromSnapshot(rawCached.value.entries, "net_worth");
    const requestedAddresses = collectTopAddresses(entries, limit);
    const displayNameMap = await buildDisplayNameMap(requestedAddresses);
    const rewardDisplayMap = await buildRewardDisplayMap(requestedAddresses, (address) => {
        const entry = entries.find((item) => item.address === address);
        return entry ? Number(entry.totalBet || 0) : 0;
    });
    return {
        generatedAt: rawCached.value.generatedAt || rawCached.meta.generatedAt || new Date().toISOString(),
        totalPlayers: entries.length,
        leaderboard: buildNetWorthLeaderboardRows(entries, limit, displayNameMap, rewardDisplayMap)
    };
}

function parseGeneratedAtMs(rawValue) {
    const parsed = Date.parse(String(rawValue || ""));
    return Number.isFinite(parsed) ? parsed : 0;
}

function mergeReadCacheMeta(metaList) {
    const list = Array.isArray(metaList) ? metaList.filter(Boolean) : [];
    const statuses = list.map((meta) => String(meta.status || "").toUpperCase());
    const layers = list.map((meta) => String(meta.layer || "").trim());
    const generatedAtMs = list.reduce((latest, meta) => Math.max(latest, parseGeneratedAtMs(meta.generatedAt)), 0);

    let status = "HIT";
    if (statuses.includes("MISS")) status = "MISS";
    else if (statuses.includes("STALE")) status = "STALE";

    let layer = "L1";
    if (layers.includes("origin")) layer = "origin";
    else if (layers.includes("L2")) layer = "L2";

    return {
        status,
        layer,
        generatedAt: generatedAtMs > 0 ? new Date(generatedAtMs).toISOString() : new Date().toISOString()
    };
}

function getChampionSourceConfigs(periodSnapshot) {
    return [
        {
            key: "totalBet",
            label: "總下注榜一",
            metricLabel: "總下注",
            viewType: "total-bet",
            viewScope: "total",
            readOptions: {
                namespace: "leaderboard",
                keyParts: ["total_bet"],
                tier: "public-heavy",
                loader: loadTotalBetSnapshot
            },
            selectValue: (entry) => Number(entry?.totalBet || 0)
        },
        {
            key: "weeklyBet",
            label: "本週榜一",
            metricLabel: "本週下注",
            viewType: "total-bet",
            viewScope: "weekly",
            readOptions: {
                namespace: "leaderboard",
                keyParts: ["weekly_bet", periodSnapshot.week.id],
                tier: "public-heavy",
                loader: async () => loadPeriodLeaderboardSnapshot("weekly", periodSnapshot.week, periodSnapshot)
            },
            selectValue: (entry) => Number(entry?.totalBet || 0)
        },
        {
            key: "monthlyBet",
            label: "本月榜一",
            metricLabel: "本月下注",
            viewType: "total-bet",
            viewScope: "monthly",
            readOptions: {
                namespace: "leaderboard",
                keyParts: ["monthly_bet", periodSnapshot.month.id],
                tier: "public-heavy",
                loader: async () => loadPeriodLeaderboardSnapshot("monthly", periodSnapshot.month, periodSnapshot)
            },
            selectValue: (entry) => Number(entry?.totalBet || 0)
        },
        {
            key: "seasonBet",
            label: "本賽季榜一",
            metricLabel: "本賽季下注",
            viewType: "total-bet",
            viewScope: "season",
            readOptions: {
                namespace: "leaderboard",
                keyParts: ["season_bet", periodSnapshot.season.id],
                tier: "public-heavy",
                loader: async () => loadPeriodLeaderboardSnapshot("season", periodSnapshot.season, periodSnapshot)
            },
            selectValue: (entry) => Number(entry?.totalBet || 0)
        },
        {
            key: "netWorth",
            label: "總資產榜一",
            metricLabel: "總資產",
            viewType: "balance",
            viewScope: "total",
            readOptions: {
                namespace: "leaderboard",
                keyParts: ["net_worth"],
                tier: "public-heavy",
                loader: loadNetWorthSnapshot
            },
            selectValue: (entry) => Number(entry?.netWorth || 0)
        }
    ];
}

const HALL_OF_FAME_CONFIGS = [
    {
        cacheKey: "weekly_bet_hof",
        historyType: "weekly",
        key: "weeklyBet",
        label: "週榜王",
        metricLabel: "累計正式榜一",
        viewType: "total-bet",
        viewScope: "weekly"
    },
    {
        cacheKey: "monthly_bet_hof",
        historyType: "monthly",
        key: "monthlyBet",
        label: "月榜王",
        metricLabel: "累計正式榜一",
        viewType: "total-bet",
        viewScope: "monthly"
    },
    {
        cacheKey: "season_bet_hof",
        historyType: "season",
        key: "seasonBet",
        label: "賽季榜王",
        metricLabel: "累計正式榜一",
        viewType: "total-bet",
        viewScope: "season"
    }
];

function compareHallOfFameCandidate(left, right) {
    if (!left) return 1;
    if (!right) return -1;
    if (right.count !== left.count) return right.count - left.count;
    const periodCompare = String(right.lastSettledPeriodId || "").localeCompare(String(left.lastSettledPeriodId || ""));
    if (periodCompare !== 0) return periodCompare;
    return String(left.address || "").localeCompare(String(right.address || ""));
}

async function loadHallOfFameSnapshot(type) {
    const keys = [];
    for await (const key of kv.scanIterator({ match: `system_title:${type}:history:*`, count: 1000 })) {
        keys.push(key);
    }

    const winners = new Map();
    const chunkSize = 100;
    for (let index = 0; index < keys.length; index += chunkSize) {
        const chunkKeys = keys.slice(index, index + chunkSize);
        const chunkValues = await Promise.all(chunkKeys.map((key) => kv.get(key)));
        for (let valueIndex = 0; valueIndex < chunkValues.length; valueIndex += 1) {
            const record = chunkValues[valueIndex];
            const address = String(record && record.winner || "").trim().toLowerCase();
            if (!address) continue;
            const previous = winners.get(address) || { address, count: 0, lastSettledPeriodId: "" };
            previous.count += 1;
            const periodId = String(record && record.periodId || "").trim();
            if (periodId && periodId.localeCompare(previous.lastSettledPeriodId) > 0) {
                previous.lastSettledPeriodId = periodId;
            }
            winners.set(address, previous);
        }
    }

    const sorted = Array.from(winners.values()).sort(compareHallOfFameCandidate);
    const best = sorted[0] || null;
    const ties = best
        ? sorted.filter((entry) => Number(entry.count || 0) === Number(best.count || 0))
        : [];
    return {
        generatedAt: new Date().toISOString(),
        type,
        address: best ? best.address : "",
        count: best ? Number(best.count || 0) : 0,
        lastSettledPeriodId: best ? String(best.lastSettledPeriodId || "") : "",
        ties: ties.map((entry) => ({
            address: String(entry.address || "").toLowerCase(),
            count: Number(entry.count || 0),
            lastSettledPeriodId: String(entry.lastSettledPeriodId || "")
        }))
    };
}

async function loadSettledChampionMeta(type, leaderAddress) {
    const normalizedAddress = String(leaderAddress || "").trim().toLowerCase();
    const reigningAddress = String(await kv.get(`system_title:${type}:current_winner`) || "").trim().toLowerCase();
    const lastSettledPeriodId = String(await kv.get(`system_title:${type}:last_settled_period`) || "").trim();
    if (!normalizedAddress || !reigningAddress || normalizedAddress !== reigningAddress) {
        return {
            streakCount: 0,
            streakMode: "settled_only",
            lastSettledPeriodId: ""
        };
    }
    return {
        streakCount: Number(await kv.get(`system_title:${type}:streak:${reigningAddress}`) || 0) || 0,
        streakMode: "settled_only",
        lastSettledPeriodId
    };
}

function buildChampionPayload(config, entry, period, generatedAt, displayNameMap, rewardDisplayMap, totalBetMap, extraMeta = {}) {
    const address = entry && entry.address ? String(entry.address).toLowerCase() : "";
    const totalBet = address ? Number(totalBetMap.get(address) || entry?.totalBet || 0) : 0;
    const vipStatus = address ? buildVipStatus(totalBet) : { vipLevel: "-" };
    const rewardDisplay = address ? (rewardDisplayMap.get(address) || {}) : {};
    return {
        key: config.key,
        label: config.label,
        metricLabel: config.metricLabel,
        viewType: config.viewType,
        viewScope: config.viewScope,
        hasChampion: !!address,
        generatedAt: generatedAt || null,
        period: period || null,
        address,
        maskedAddress: address ? maskAddress(address) : "-",
        displayName: address ? (displayNameMap.get(address) || "") : "",
        value: entry ? Number(config.selectValue(entry) || 0) : 0,
        level: vipStatus.vipLevel,
        avatar: rewardDisplay.avatar || null,
        title: rewardDisplay.title || null,
        streakCount: Number(extraMeta.streakCount || 0),
        streakMode: extraMeta.streakMode || "settled_only",
        lastSettledPeriodId: String(extraMeta.lastSettledPeriodId || "")
    };
}

function buildHallOfFamePayload(config, snapshot, generatedAt, displayNameMap, rewardDisplayMap, totalBetMap) {
    const address = snapshot && snapshot.address ? String(snapshot.address).toLowerCase() : "";
    const totalBet = address ? Number(totalBetMap.get(address) || 0) : 0;
    const vipStatus = address ? buildVipStatus(totalBet) : { vipLevel: "-" };
    const rewardDisplay = address ? (rewardDisplayMap.get(address) || {}) : {};
    const tieEntries = Array.isArray(snapshot && snapshot.ties) ? snapshot.ties : [];
    return {
        key: config.key,
        label: config.label,
        metricLabel: config.metricLabel,
        viewType: config.viewType,
        viewScope: config.viewScope,
        hasChampion: !!address,
        generatedAt: generatedAt || null,
        address,
        maskedAddress: address ? maskAddress(address) : "-",
        displayName: address ? (displayNameMap.get(address) || "") : "",
        count: Number(snapshot && snapshot.count || 0),
        lastSettledPeriodId: String(snapshot && snapshot.lastSettledPeriodId || ""),
        tieCount: tieEntries.length,
        ties: tieEntries.map((entry) => {
            const tieAddress = String(entry && entry.address || "").toLowerCase();
            const tieTotalBet = tieAddress ? Number(totalBetMap.get(tieAddress) || 0) : 0;
            const tieRewardDisplay = tieAddress ? (rewardDisplayMap.get(tieAddress) || {}) : {};
            const tieVipStatus = tieAddress ? buildVipStatus(tieTotalBet) : { vipLevel: "-" };
            return {
                address: tieAddress,
                maskedAddress: tieAddress ? maskAddress(tieAddress) : "-",
                displayName: tieAddress ? (displayNameMap.get(tieAddress) || "") : "",
                count: Number(entry && entry.count || 0),
                lastSettledPeriodId: String(entry && entry.lastSettledPeriodId || ""),
                level: tieVipStatus.vipLevel,
                avatar: tieRewardDisplay.avatar || null,
                title: tieRewardDisplay.title || null
            };
        }),
        level: vipStatus.vipLevel,
        avatar: rewardDisplay.avatar || null,
        title: rewardDisplay.title || null
    };
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
        if (action === "champions") {
            const championConfigs = getChampionSourceConfigs(periodSnapshot);
            const sourceResults = await Promise.all(championConfigs.map((config) => readThroughCache(config.readOptions)));
            const hallOfFameResults = await Promise.all(HALL_OF_FAME_CONFIGS.map((config) => readThroughCache({
                namespace: "leaderboard_hof",
                keyParts: [config.cacheKey],
                tier: HALL_OF_FAME_CACHE_TIER,
                loader: async () => loadHallOfFameSnapshot(config.historyType)
            })));
            const aggregateMeta = mergeReadCacheMeta(sourceResults.map((result) => result.meta).concat(hallOfFameResults.map((result) => result.meta)));
            applyStatsReadHeaders(res, aggregateMeta);

            const championSources = championConfigs.map((config, index) => {
                const result = sourceResults[index] || {};
                const value = result.value || {};
                const entries = Array.isArray(value.entries) ? value.entries : [];
                return {
                    config,
                    period: value.period || null,
                    generatedAt: value.generatedAt || aggregateMeta.generatedAt,
                    entry: entries.length ? entries[0] : null
                };
            });

            const championMetaList = await Promise.all(championSources.map(async (source) => {
                if (source.config.key === "weeklyBet") {
                    return loadSettledChampionMeta("weekly", source.entry?.address);
                }
                if (source.config.key === "monthlyBet") {
                    return loadSettledChampionMeta("monthly", source.entry?.address);
                }
                if (source.config.key === "seasonBet") {
                    return loadSettledChampionMeta("season", source.entry?.address);
                }
                return {
                    streakCount: 0,
                    streakMode: "settled_only",
                    lastSettledPeriodId: ""
                };
            }));

            const hallOfFameSources = HALL_OF_FAME_CONFIGS.map((config, index) => {
                const result = hallOfFameResults[index] || {};
                const value = result.value || {};
                return {
                    config,
                    generatedAt: value.generatedAt || aggregateMeta.generatedAt,
                    snapshot: value
                };
            });

            const championAddresses = Array.from(new Set(
                championSources
                    .map((source) => String(source.entry?.address || "").trim().toLowerCase())
                    .concat(hallOfFameSources.map((source) => String(source.snapshot?.address || "").trim().toLowerCase()))
                    .concat(hallOfFameSources.flatMap((source) => {
                        const ties = Array.isArray(source.snapshot?.ties) ? source.snapshot.ties : [];
                        return ties.map((entry) => String(entry && entry.address || "").trim().toLowerCase());
                    }))
                    .filter(Boolean)
            ));
            const totalBetMap = await loadTotalBetMap(championAddresses);
            const displayNameMap = await buildDisplayNameMap(championAddresses);
            const rewardDisplayMap = await buildRewardDisplayMap(championAddresses, (address) => totalBetMap.get(address) || 0);
            const champions = {};
            const hallOfFame = {};

            championSources.forEach((source, index) => {
                champions[source.config.key] = buildChampionPayload(
                    source.config,
                    source.entry,
                    source.period,
                    source.generatedAt,
                    displayNameMap,
                    rewardDisplayMap,
                    totalBetMap,
                    championMetaList[index]
                );
            });

            hallOfFameSources.forEach((source) => {
                hallOfFame[source.config.key] = buildHallOfFamePayload(
                    source.config,
                    source.snapshot,
                    source.generatedAt,
                    displayNameMap,
                    rewardDisplayMap,
                    totalBetMap
                );
            });

            return res.status(200).json({
                success: true,
                generatedAt: aggregateMeta.generatedAt,
                champions,
                hallOfFame
            });
        }
        if (action === "total_bet") {
            const cached = await readThroughCache({
                namespace: "leaderboard_view",
                keyParts: ["total_bet", limit],
                tier: "public-heavy",
                loader: async () => loadHydratedTotalBetView(limit)
            });
            applyStatsReadHeaders(res, cached.meta);
            const rawCached = await readThroughCache({
                namespace: "leaderboard",
                keyParts: ["total_bet"],
                tier: "public-heavy",
                loader: loadTotalBetSnapshot
            });
            const entries = normalizeEntriesFromSnapshot(rawCached.value.entries, "bet");
            const myIndex = entries.findIndex((entry) => entry.address === currentAddress);
            let myRank = myIndex >= 0 ? (cached.value.leaderboard || []).find((entry) => entry.address === currentAddress) || null : null;
            if (!myRank && myIndex >= 0) {
                const myEntry = entries[myIndex];
                const totalBetMap = new Map([[currentAddress, Number(myEntry.totalBet || 0)]]);
                const displayNameMap = await buildDisplayNameMap([currentAddress]);
                const rewardDisplayMap = await buildRewardDisplayMap([currentAddress], (address) => totalBetMap.get(address) || 0);
                const rows = buildBetLeaderboardRows([myEntry], 1, displayNameMap, rewardDisplayMap, totalBetMap);
                myRank = rows.length ? Object.assign({}, rows[0], { rank: myIndex + 1 }) : null;
            }
            return res.status(200).json({
                success: true,
                generatedAt: cached.value.generatedAt || new Date().toISOString(),
                totalPlayers: cached.value.totalPlayers || entries.length,
                leaderboard: cached.value.leaderboard || [],
                myRank
            });
        }
        if (action === "weekly_bet") {
            const cached = await readThroughCache({
                namespace: "leaderboard_view",
                keyParts: ["weekly_bet", periodSnapshot.week.id, limit],
                tier: "public-heavy",
                loader: async () => loadHydratedPeriodBetView("weekly", periodSnapshot.week, periodSnapshot, limit)
            });
            applyStatsReadHeaders(res, cached.meta);
            const rawCached = await readThroughCache({
                namespace: "leaderboard",
                keyParts: ["weekly_bet", periodSnapshot.week.id],
                tier: "public-heavy",
                loader: async () => loadPeriodLeaderboardSnapshot("weekly", periodSnapshot.week, periodSnapshot)
            });
            const entries = normalizeEntriesFromSnapshot(rawCached.value.entries, "bet");
            const myIndex = entries.findIndex((entry) => entry.address === currentAddress);
            const myEntry = myIndex >= 0 ? entries[myIndex] : null;
            let myRank = myEntry ? (cached.value.leaderboard || []).find((entry) => entry.address === currentAddress) || null : null;
            if (!myRank && myEntry) {
                const totalBetMap = await loadTotalBetMap([currentAddress]);
                const displayNameMap = await buildDisplayNameMap([currentAddress]);
                const rewardDisplayMap = await buildRewardDisplayMap([currentAddress], (address) => totalBetMap.get(address) || 0);
                const rows = buildBetLeaderboardRows([myEntry], 1, displayNameMap, rewardDisplayMap, totalBetMap);
                myRank = rows.length ? Object.assign({}, rows[0], { rank: myIndex + 1 }) : null;
            }
            return res.status(200).json({
                success: true,
                generatedAt: cached.value.generatedAt || new Date().toISOString(),
                period: cached.value.period,
                totalPlayers: cached.value.totalPlayers || entries.length,
                leaderboard: cached.value.leaderboard || [],
                myRank,
                myPeriodBet: (myEntry ? myEntry.totalBet : 0).toFixed(2)
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
            const requestedAddresses = collectRequestedLeaderboardAddresses(entries, currentAddress, limit);
            const totalBetMap = await loadTotalBetMap(requestedAddresses);
            const displayNameMap = await buildDisplayNameMap(requestedAddresses);
            const rewardDisplayMap = await buildRewardDisplayMap(requestedAddresses, (address) => totalBetMap.get(address) || 0);
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
                namespace: "leaderboard_view",
                keyParts: ["monthly_bet", periodSnapshot.month.id, limit],
                tier: "public-heavy",
                loader: async () => loadHydratedPeriodBetView("monthly", periodSnapshot.month, periodSnapshot, limit)
            });
            applyStatsReadHeaders(res, cached.meta);
            const rawCached = await readThroughCache({
                namespace: "leaderboard",
                keyParts: ["monthly_bet", periodSnapshot.month.id],
                tier: "public-heavy",
                loader: async () => loadPeriodLeaderboardSnapshot("monthly", periodSnapshot.month, periodSnapshot)
            });
            const entries = normalizeEntriesFromSnapshot(rawCached.value.entries, "bet");
            const myIndex = entries.findIndex((entry) => entry.address === currentAddress);
            const myEntry = myIndex >= 0 ? entries[myIndex] : null;
            let myRank = myEntry ? (cached.value.leaderboard || []).find((entry) => entry.address === currentAddress) || null : null;
            if (!myRank && myEntry) {
                const totalBetMap = await loadTotalBetMap([currentAddress]);
                const displayNameMap = await buildDisplayNameMap([currentAddress]);
                const rewardDisplayMap = await buildRewardDisplayMap([currentAddress], (address) => totalBetMap.get(address) || 0);
                const rows = buildBetLeaderboardRows([myEntry], 1, displayNameMap, rewardDisplayMap, totalBetMap);
                myRank = rows.length ? Object.assign({}, rows[0], { rank: myIndex + 1 }) : null;
            }
            return res.status(200).json({
                success: true,
                generatedAt: cached.value.generatedAt || new Date().toISOString(),
                period: cached.value.period,
                totalPlayers: cached.value.totalPlayers || entries.length,
                leaderboard: cached.value.leaderboard || [],
                myRank,
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
            const requestedAddresses = collectRequestedLeaderboardAddresses(entries, currentAddress, limit);
            const totalBetMap = await loadTotalBetMap(requestedAddresses);
            const displayNameMap = await buildDisplayNameMap(requestedAddresses);
            const rewardDisplayMap = await buildRewardDisplayMap(requestedAddresses, (address) => totalBetMap.get(address) || 0);
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
                namespace: "leaderboard_view",
                keyParts: ["season_bet", periodSnapshot.season.id, limit],
                tier: "public-heavy",
                loader: async () => loadHydratedPeriodBetView("season", periodSnapshot.season, periodSnapshot, limit)
            });
            applyStatsReadHeaders(res, cached.meta);
            const rawCached = await readThroughCache({
                namespace: "leaderboard",
                keyParts: ["season_bet", periodSnapshot.season.id],
                tier: "public-heavy",
                loader: async () => loadPeriodLeaderboardSnapshot("season", periodSnapshot.season, periodSnapshot)
            });
            const entries = normalizeEntriesFromSnapshot(rawCached.value.entries, "bet");
            const myIndex = entries.findIndex((entry) => entry.address === currentAddress);
            const myEntry = myIndex >= 0 ? entries[myIndex] : null;
            let myRank = myEntry ? (cached.value.leaderboard || []).find((entry) => entry.address === currentAddress) || null : null;
            if (!myRank && myEntry) {
                const totalBetMap = await loadTotalBetMap([currentAddress]);
                const displayNameMap = await buildDisplayNameMap([currentAddress]);
                const rewardDisplayMap = await buildRewardDisplayMap([currentAddress], (address) => totalBetMap.get(address) || 0);
                const rows = buildBetLeaderboardRows([myEntry], 1, displayNameMap, rewardDisplayMap, totalBetMap);
                myRank = rows.length ? Object.assign({}, rows[0], { rank: myIndex + 1 }) : null;
            }
            return res.status(200).json({
                success: true,
                generatedAt: cached.value.generatedAt || new Date().toISOString(),
                period: cached.value.period,
                totalPlayers: cached.value.totalPlayers || entries.length,
                leaderboard: cached.value.leaderboard || [],
                myRank,
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
            const requestedAddresses = collectRequestedLeaderboardAddresses(entries, currentAddress, limit);
            const totalBetMap = await loadTotalBetMap(requestedAddresses);
            const displayNameMap = await buildDisplayNameMap(requestedAddresses);
            const rewardDisplayMap = await buildRewardDisplayMap(requestedAddresses, (address) => totalBetMap.get(address) || 0);
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
                namespace: "leaderboard_view",
                keyParts: ["net_worth", limit],
                tier: "public-heavy",
                loader: async () => loadHydratedNetWorthView(limit)
            });
            applyStatsReadHeaders(res, cached.meta);
            const rawCached = await readThroughCache({
                namespace: "leaderboard",
                keyParts: ["net_worth"],
                tier: "public-heavy",
                loader: loadNetWorthSnapshot
            });
            const entries = normalizeEntriesFromSnapshot(rawCached.value.entries, "net_worth");
            if (currentAddress && !entries.some((entry) => entry.address === currentAddress)) {
                const currentOnlyEntry = await loadCurrentNetWorthEntry(currentAddress);
                if (currentOnlyEntry) {
                    entries.push(currentOnlyEntry);
                    entries.sort((left, right) => {
                        if (right.netWorth !== left.netWorth) return right.netWorth - left.netWorth;
                        return left.address.localeCompare(right.address);
                    });
                }
            }
            const myIndex = entries.findIndex((entry) => entry.address === currentAddress);
            const myEntry = myIndex >= 0 ? entries[myIndex] : null;
            let myRank = myEntry ? (cached.value.leaderboard || []).find((entry) => entry.address === currentAddress) || null : null;
            if (!myRank && myEntry) {
                const displayNameMap = await buildDisplayNameMap([currentAddress]);
                const rewardDisplayMap = await buildRewardDisplayMap([currentAddress], () => Number(myEntry.totalBet || 0));
                const rows = buildNetWorthLeaderboardRows([myEntry], 1, displayNameMap, rewardDisplayMap);
                myRank = rows.length ? Object.assign({}, rows[0], { rank: myIndex + 1 }) : null;
            }
            return res.status(200).json({
                success: true,
                generatedAt: cached.value.generatedAt || new Date().toISOString(),
                totalPlayers: entries.length,
                leaderboard: cached.value.leaderboard || [],
                myRank
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
            const requestedAddresses = collectRequestedLeaderboardAddresses(entries, currentAddress, limit);
            const displayNameMap = await buildDisplayNameMap(requestedAddresses);
            const totalBetMap = buildNetWorthValueMap(entries);
            const rewardDisplayMap = await buildRewardDisplayMap(requestedAddresses, (address) => totalBetMap.get(address) || 0);
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
        return res.status(400).json({ success: false, error: `Unsupported action: ${action}`, supportedActions: ["champions", "total_bet", "weekly_bet", "monthly_bet", "season_bet", "net_worth"] });
    } catch (error) {
        console.error("Stats API Error:", error);
        return res.status(500).json({ success: false, error: error.message || "Stats API failed" });
    }
}
