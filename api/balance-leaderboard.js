import { kv } from "@vercel/kv";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "../lib/config.js";
import { buildVipStatus } from "../lib/vip.js";

const TOTAL_BET_PREFIX = "total_bet:";
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
                return { address, balance: Number(ethers.formatUnits(balanceWei, decimals)) };
            } catch (error) {
                return { address, balance: 0 };
            }
        }));

        balances.forEach((item) => {
            if (!Number.isFinite(item.balance) || item.balance <= 0) return;
            const totalBet = totalBetMap.get(item.address) || 0;
            entries.push({
                address: item.address,
                balance: item.balance,
                totalBet
            });
        });
    }

    entries.sort((left, right) => {
        if (right.balance !== left.balance) return right.balance - left.balance;
        return left.address.localeCompare(right.address);
    });

    return entries;
}

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

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
        const { addresses, totalBetMap } = await loadKnownUsers(currentAddress);
        const entries = await loadBalanceEntries(addresses, totalBetMap);

        const leaderboard = entries.slice(0, limit).map((entry, index) => {
            const vipStatus = buildVipStatus(entry.totalBet);
            return {
                rank: index + 1,
                address: entry.address,
                maskedAddress: maskAddress(entry.address),
                balance: entry.balance.toFixed(2),
                totalBet: entry.totalBet.toFixed(2),
                vipLevel: vipStatus.vipLevel
            };
        });

        const myIndex = entries.findIndex((entry) => entry.address === currentAddress);
        const myRank = myIndex >= 0 ? entries[myIndex] : null;

        return res.status(200).json({
            success: true,
            generatedAt: new Date().toISOString(),
            totalPlayers: entries.length,
            leaderboard,
            myRank: myRank ? {
                rank: myIndex + 1,
                address: myRank.address,
                maskedAddress: maskAddress(myRank.address),
                balance: myRank.balance.toFixed(2),
                totalBet: myRank.totalBet.toFixed(2),
                vipLevel: buildVipStatus(myRank.totalBet).vipLevel
            } : null
        });
    } catch (error) {
        console.error("Balance Leaderboard Error:", error);
        return res.status(500).json({
            success: false,
            error: "無法讀取餘額排行榜",
            details: error.message
        });
    }
}
