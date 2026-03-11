import { kv } from "@vercel/kv";
import { ethers } from "ethers";
import { getSession } from "../lib/session-store.js";
import { CONTRACT_ADDRESS, RPC_URL } from "../lib/config.js";
import { buildVipStatus } from "../lib/vip.js";
import { buildDisplayNameMap } from "../lib/user-profile.js";
import { buildRewardDisplayMap } from "../lib/reward-center.js";
import {
    buildAccountSummary,
    buildMarketSnapshot,
    normalizeMarketAccount,
    settleLiquidations
} from "../lib/market-sim.js";
import {
    LEADERBOARD_CACHE_TTL_SECONDS,
    applyLeaderboardCacheHeaders,
    getCachedLeaderboard,
    setCachedLeaderboard
} from "../lib/leaderboard-cache.js";

const TOTAL_BET_PREFIX = "total_bet:";
const MARKET_SIM_PREFIX = "market_sim:";
const MAX_LIMIT = 100;

const provider = new ethers.JsonRpcProvider(RPC_URL);
const CONTRACT_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)"
];
const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

let _cachedDecimals = null;
async function getDecimals() {
    if (_cachedDecimals !== null) return _cachedDecimals;
    try {
        _cachedDecimals = Number(await contract.decimals());
        return _cachedDecimals;
    } catch {
        return 18;
    }
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
        if (!totalBetMap.has(address)) {
            totalBetMap.set(address, 0);
        }
    }
    if (currentAddress) {
        addressSet.add(currentAddress);
        if (!totalBetMap.has(currentAddress)) {
            totalBetMap.set(currentAddress, 0);
        }
    }
    return { addresses: Array.from(addressSet), totalBetMap };
}

async function loadBalanceEntries(addresses, totalBetMap) {
    if (addresses.length === 0) return [];
    const nowTs = Date.now();
    const market = buildMarketSnapshot(nowTs);
    const decimals = await getDecimals();
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
                return {
                    address, walletBalance, netWorth: Number(summary.netWorth || 0), bankBalance: Number(summary.bankBalance || 0),
                    stockValue: Number(summary.stockValue || 0), futuresUnrealizedPnl: Number(summary.futuresUnrealizedPnl || 0), loanPrincipal: Number(summary.loanPrincipal || 0)
                };
            } catch {
                return { address, walletBalance: 0, netWorth: 0, bankBalance: 0, stockValue: 0, futuresUnrealizedPnl: 0, loanPrincipal: 0 };
            }
        }));
        balances.forEach((item) => {
            if (!Number.isFinite(item.netWorth) || item.netWorth <= 0) return;
            const totalBet = totalBetMap.get(item.address) || 0;
            entries.push({
                address: item.address, netWorth: item.netWorth, walletBalance: item.walletBalance, bankBalance: item.bankBalance,
                stockValue: item.stockValue, futuresUnrealizedPnl: item.futuresUnrealizedPnl, loanPrincipal: item.loanPrincipal, totalBet
            });
        });
    }
    entries.sort((left, right) => {
        if (right.netWorth !== left.netWorth) return right.netWorth - left.netWorth;
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
        if (action === "total_bet") {
            let cached = await getCachedLeaderboard("total_bet_v1");
            if (!cached || !Array.isArray(cached.entries)) {
                const entries = await loadTotalBetEntries();
                cached = { generatedAt: new Date().toISOString(), entries: entries.map((entry) => ({ address: entry.address, totalBet: entry.totalBet })) };
                await setCachedLeaderboard("total_bet_v1", cached, LEADERBOARD_CACHE_TTL_SECONDS);
            }
            const entries = cached.entries.map((entry) => ({ address: entry.address, totalBet: Number(entry.totalBet || 0) }));
            const displayNameMap = await buildDisplayNameMap(entries.map((entry) => entry.address));
            const rewardDisplayMap = await buildRewardDisplayMap(entries.map((entry) => entry.address), (address) => {
                const entry = entries.find((item) => item.address === address);
                return entry ? entry.totalBet : 0;
            });
            const leaderboard = entries.slice(0, limit).map((entry, index) => {
                const vipStatus = buildVipStatus(entry.totalBet);
                const rewardDisplay = rewardDisplayMap.get(entry.address) || {};
                return {
                    rank: index + 1, address: entry.address, displayName: displayNameMap.get(entry.address) || "", maskedAddress: maskAddress(entry.address),
                    totalBet: entry.totalBet.toFixed(2), vipLevel: vipStatus.vipLevel, maxBet: String(vipStatus.maxBet), avatar: rewardDisplay.avatar || null, title: rewardDisplay.title || null
                };
            });
            const myIndex = entries.findIndex((entry) => entry.address === currentAddress);
            const myRank = myIndex >= 0 ? entries[myIndex] : null;
            return res.status(200).json({
                success: true, generatedAt: cached.generatedAt || new Date().toISOString(), totalPlayers: entries.length, leaderboard,
                myRank: myRank ? {
                    rank: myIndex + 1, address: myRank.address, displayName: displayNameMap.get(myRank.address) || "", maskedAddress: maskAddress(myRank.address),
                    totalBet: myRank.totalBet.toFixed(2), vipLevel: buildVipStatus(myRank.totalBet).vipLevel, maxBet: String(buildVipStatus(myRank.totalBet).maxBet),
                    avatar: (rewardDisplayMap.get(myRank.address) || {}).avatar || null, title: (rewardDisplayMap.get(myRank.address) || {}).title || null
                } : null
            });
        }
        if (action === "net_worth") {
            let cached = await getCachedLeaderboard("balance_v2");
            if (!cached || !Array.isArray(cached.entries)) {
                const { addresses, totalBetMap } = await loadKnownUsers(currentAddress);
                const entries = await loadBalanceEntries(addresses, totalBetMap);
                cached = {
                    generatedAt: new Date().toISOString(),
                    entries: entries.map((entry) => ({ address: entry.address, netWorth: entry.netWorth, walletBalance: entry.walletBalance, bankBalance: entry.bankBalance, stockValue: entry.stockValue, futuresUnrealizedPnl: entry.futuresUnrealizedPnl, loanPrincipal: entry.loanPrincipal, totalBet: entry.totalBet }))
                };
                await setCachedLeaderboard("balance_v2", cached, LEADERBOARD_CACHE_TTL_SECONDS);
            }
            const entries = cached.entries.map((entry) => ({ address: entry.address, netWorth: Number(entry.netWorth || 0), walletBalance: Number(entry.walletBalance || 0), bankBalance: Number(entry.bankBalance || 0), stockValue: Number(entry.stockValue || 0), futuresUnrealizedPnl: Number(entry.futuresUnrealizedPnl || 0), loanPrincipal: Number(entry.loanPrincipal || 0), totalBet: Number(entry.totalBet || 0) }));
            const displayNameMap = await buildDisplayNameMap(entries.map((entry) => entry.address));
            if (currentAddress && !entries.some((entry) => entry.address === currentAddress)) {
                const { addresses, totalBetMap } = await loadKnownUsers(currentAddress);
                const currentOnlyEntries = await loadBalanceEntries(addresses.filter((address) => address === currentAddress), totalBetMap);
                if (currentOnlyEntries[0]) {
                    entries.push(currentOnlyEntries[0]);
                    entries.sort((left, right) => { if (right.netWorth !== left.netWorth) return right.netWorth - left.netWorth; return left.address.localeCompare(right.address); });
                }
            }
            const rewardDisplayMap = await buildRewardDisplayMap(entries.map((entry) => entry.address), (address) => { const entry = entries.find((item) => item.address === address); return entry ? entry.totalBet : 0; });
            const leaderboard = entries.slice(0, limit).map((entry, index) => {
                const vipStatus = buildVipStatus(entry.totalBet);
                const rewardDisplay = rewardDisplayMap.get(entry.address) || {};
                return {
                    rank: index + 1, address: entry.address, displayName: displayNameMap.get(entry.address) || "", maskedAddress: maskAddress(entry.address),
                    netWorth: entry.netWorth.toFixed(2), walletBalance: entry.walletBalance.toFixed(2), bankBalance: entry.bankBalance.toFixed(2), stockValue: entry.stockValue.toFixed(2), futuresUnrealizedPnl: entry.futuresUnrealizedPnl.toFixed(2), loanPrincipal: entry.loanPrincipal.toFixed(2), totalBet: entry.totalBet.toFixed(2), vipLevel: vipStatus.vipLevel, avatar: rewardDisplay.avatar || null, title: rewardDisplay.title || null
                };
            });
            const myIndex = entries.findIndex((entry) => entry.address === currentAddress);
            const myRank = myIndex >= 0 ? entries[myIndex] : null;
            return res.status(200).json({
                success: true, generatedAt: cached.generatedAt || new Date().toISOString(), totalPlayers: entries.length, leaderboard,
                myRank: myRank ? {
                    rank: myIndex + 1, address: myRank.address, displayName: displayNameMap.get(myRank.address) || "", maskedAddress: maskAddress(myRank.address),
                    netWorth: myRank.netWorth.toFixed(2), walletBalance: myRank.walletBalance.toFixed(2), bankBalance: myRank.bankBalance.toFixed(2), stockValue: myRank.stockValue.toFixed(2), futuresUnrealizedPnl: myRank.futuresUnrealizedPnl.toFixed(2), loanPrincipal: myRank.loanPrincipal.toFixed(2), totalBet: myRank.totalBet.toFixed(2), vipLevel: buildVipStatus(myRank.totalBet).vipLevel, avatar: (rewardDisplayMap.get(myRank.address) || {}).avatar || null, title: (rewardDisplayMap.get(myRank.address) || {}).title || null
                } : null
            });
        }
        return res.status(400).json({ success: false, error: `Unsupported action: ${action}`, supportedActions: ["total_bet", "net_worth"] });
    } catch (error) {
        console.error("Stats API Error:", error);
        return res.status(500).json({ success: false, error: error.message || "Stats API failed" });
    }
}
