import { kv } from "@vercel/kv";
import { getSession } from "../lib/session-store.js";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "../lib/config.js";
import { buildVipStatus } from "../lib/vip.js";
import { buildDisplayNameMap } from "../lib/user-profile.js";
import {
    buildAccountSummary,
    buildMarketSnapshot,
    normalizeMarketAccount,
    settleLiquidations
} from "../lib/market-sim.js";
import {
    LEADERBOARD_CACHE_TTL_SECONDS,
    getCachedLeaderboard,
    setCachedLeaderboard,
    applyLeaderboardCacheHeaders
} from "../lib/leaderboard-cache.js";

const TOTAL_BET_PREFIX = "total_bet:";
const MARKET_SIM_PREFIX = "market_sim:";
const MAX_LIMIT = 100;
const CONTRACT_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)"
];

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

async function loadKnownUsers(currentAddress) {
    const addressSet = new Set();
    const totalBetMap = new Map();

    for await (const key of kv.scanIterator({ match: `${TOTAL_BET_PREFIX}*`, count: 1000 })) {
        const address = key.slice(TOTAL_BET_PREFIX.length).toLowerCase();
        if (!address) continue;
        const totalBet = toNumericValue(await kv.get(key));
        addressSet.add(address);
        totalBetMap.set(address, totalBet);
    }

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

    return {
        addresses: Array.from(addressSet),
        totalBetMap
    };
}

async function loadBalanceEntries(addresses, totalBetMap) {
    if (addresses.length === 0) return [];

    const nowTs = Date.now();
    const market = buildMarketSnapshot(nowTs);
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
    let decimals = 18;
    try {
        decimals = Number(await contract.decimals());
    } catch (error) {}

    const entries = [];
    const chunkSize = 20;

    for (let index = 0; index < addresses.length; index += chunkSize) {
        const chunk = addresses.slice(index, index + chunkSize);
        const balances = await Promise.all(chunk.map(async (address) => {
            try {
                const balanceWei = await contract.balanceOf(address);
                const walletBalance = Number(ethers.formatUnits(balanceWei, decimals));
                const marketAccount = normalizeMarketAccount(await kv.get(`${MARKET_SIM_PREFIX}${address}`), nowTs);
                marketAccount.cash = walletBalance;
                settleLiquidations(marketAccount, market, nowTs);
                const summary = buildAccountSummary(marketAccount, market);

                return {
                    address,
                    walletBalance,
                    netWorth: Number(summary.netWorth || 0),
                    bankBalance: Number(summary.bankBalance || 0),
                    stockValue: Number(summary.stockValue || 0),
                    futuresUnrealizedPnl: Number(summary.futuresUnrealizedPnl || 0),
                    loanPrincipal: Number(summary.loanPrincipal || 0)
                };
            } catch (error) {
                return {
                    address,
                    walletBalance: 0,
                    netWorth: 0,
                    bankBalance: 0,
                    stockValue: 0,
                    futuresUnrealizedPnl: 0,
                    loanPrincipal: 0
                };
            }
        }));

        balances.forEach((item) => {
            if (!Number.isFinite(item.netWorth) || item.netWorth <= 0) return;
            const totalBet = totalBetMap.get(item.address) || 0;
            entries.push({
                address: item.address,
                netWorth: item.netWorth,
                walletBalance: item.walletBalance,
                bankBalance: item.bankBalance,
                stockValue: item.stockValue,
                futuresUnrealizedPnl: item.futuresUnrealizedPnl,
                loanPrincipal: item.loanPrincipal,
                totalBet
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

        const session = await getSession(sessionId);
        if (!session || !session.address) {
            return res.status(403).json({ success: false, error: "會話過期，請重新登入" });
        }

        const currentAddress = String(session.address || "").trim().toLowerCase();
        let cached = await getCachedLeaderboard("balance_v2");
        if (!cached || !Array.isArray(cached.entries)) {
            const { addresses, totalBetMap } = await loadKnownUsers(currentAddress);
            const entries = await loadBalanceEntries(addresses, totalBetMap);
            cached = {
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
            await setCachedLeaderboard("balance_v2", cached, LEADERBOARD_CACHE_TTL_SECONDS);
        }

        const entries = cached.entries.map((entry) => ({
            address: entry.address,
            netWorth: Number(entry.netWorth || 0),
            walletBalance: Number(entry.walletBalance || 0),
            bankBalance: Number(entry.bankBalance || 0),
            stockValue: Number(entry.stockValue || 0),
            futuresUnrealizedPnl: Number(entry.futuresUnrealizedPnl || 0),
            loanPrincipal: Number(entry.loanPrincipal || 0),
            totalBet: Number(entry.totalBet || 0)
        }));
        const displayNameMap = await buildDisplayNameMap(entries.map((entry) => entry.address));

        if (currentAddress && !entries.some((entry) => entry.address === currentAddress)) {
            const { addresses, totalBetMap } = await loadKnownUsers(currentAddress);
            const currentOnlyEntries = await loadBalanceEntries(
                addresses.filter((address) => address === currentAddress),
                totalBetMap
            );
            if (currentOnlyEntries[0]) {
                entries.push(currentOnlyEntries[0]);
                entries.sort((left, right) => {
                    if (right.netWorth !== left.netWorth) return right.netWorth - left.netWorth;
                    return left.address.localeCompare(right.address);
                });
            }
        }

        const leaderboard = entries.slice(0, limit).map((entry, index) => {
            const vipStatus = buildVipStatus(entry.totalBet);
            return {
                rank: index + 1,
                address: entry.address,
                displayName: displayNameMap.get(entry.address) || "",
                maskedAddress: maskAddress(entry.address),
                netWorth: entry.netWorth.toFixed(2),
                walletBalance: entry.walletBalance.toFixed(2),
                bankBalance: entry.bankBalance.toFixed(2),
                stockValue: entry.stockValue.toFixed(2),
                futuresUnrealizedPnl: entry.futuresUnrealizedPnl.toFixed(2),
                loanPrincipal: entry.loanPrincipal.toFixed(2),
                totalBet: entry.totalBet.toFixed(2),
                vipLevel: vipStatus.vipLevel
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
                displayName: displayNameMap.get(myRank.address) || "",
                maskedAddress: maskAddress(myRank.address),
                netWorth: myRank.netWorth.toFixed(2),
                walletBalance: myRank.walletBalance.toFixed(2),
                bankBalance: myRank.bankBalance.toFixed(2),
                stockValue: myRank.stockValue.toFixed(2),
                futuresUnrealizedPnl: myRank.futuresUnrealizedPnl.toFixed(2),
                loanPrincipal: myRank.loanPrincipal.toFixed(2),
                totalBet: myRank.totalBet.toFixed(2),
                vipLevel: buildVipStatus(myRank.totalBet).vipLevel
            } : null
        });
    } catch (error) {
        console.error("Balance Leaderboard Error:", error);
        return res.status(500).json({
            success: false,
            error: "無法讀取淨資產排行榜",
            details: error.message
        });
    }
}
