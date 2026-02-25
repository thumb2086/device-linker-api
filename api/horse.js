import { kv } from '@vercel/kv';
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "../lib/config.js";
import { getRoundInfo, hashFloat } from "../lib/auto-round.js";

const HORSES = [
    { id: 1, name: "赤焰", weight: 30, multiplier: 1.6, speed: 92, stamina: 88, burst: 86 },
    { id: 2, name: "雷霆", weight: 28, multiplier: 2.0, speed: 89, stamina: 90, burst: 84 },
    { id: 3, name: "幻影", weight: 24, multiplier: 2.5, speed: 86, stamina: 84, burst: 91 },
    { id: 4, name: "夜刃", weight: 18, multiplier: 3.5, speed: 82, stamina: 80, burst: 94 }
];

const TRACKS = ["乾地", "濕地", "夜賽"];

// 固定後台資料：不隨每局漂移，避免「勝率跑掉」
const HORSE_STATS_FIXED = [
    { id: 1, name: "赤焰", races: 1200, wins: 360, podium: 810, last5: [1, 2, 1, 3, 2], winRate: 30.0 },
    { id: 2, name: "雷霆", races: 1200, wins: 336, podium: 782, last5: [2, 1, 3, 2, 2], winRate: 28.0 },
    { id: 3, name: "幻影", races: 1200, wins: 288, podium: 705, last5: [3, 4, 1, 2, 3], winRate: 24.0 },
    { id: 4, name: "夜刃", races: 1200, wins: 216, podium: 603, last5: [4, 3, 2, 4, 1], winRate: 18.0 }
];

function getVipLevel(totalBet) {
    if (totalBet >= 100000) return "👑 鑽石 VIP";
    if (totalBet >= 50000) return "🥇 黃金會員";
    if (totalBet >= 10000) return "🥈 白銀會員";
    return "普通會員";
}

function simulateRaceDeterministic(roundId) {
    const trackIdx = Math.floor(hashFloat(`horse:track:${roundId}`) * TRACKS.length) % TRACKS.length;
    const trackCondition = TRACKS[trackIdx];

    const metrics = HORSES.map((horse) => {
        const baseScore = horse.weight * 2 + horse.speed * 0.6 + horse.stamina * 0.5 + horse.burst * 0.7;
        const volatility = (hashFloat(`horse:vol:${roundId}:${horse.id}`) * 40) - 20;

        const trackBias =
            trackCondition === "濕地" ? horse.stamina * 0.06 :
            trackCondition === "夜賽" ? horse.burst * 0.07 :
            horse.speed * 0.05;

        const raceScore = baseScore + trackBias + volatility;
        const finishTime = parseFloat((66 - raceScore / 18).toFixed(2));
        const topSpeed = parseFloat((54 + raceScore / 12).toFixed(1));
        const reactionMs = Math.round(180 + ((hashFloat(`horse:react:${roundId}:${horse.id}`) * 100) - 40) - horse.burst * 0.35);

        return {
            id: horse.id,
            name: horse.name,
            multiplier: horse.multiplier,
            finishTime,
            topSpeed,
            reactionMs
        };
    });

    metrics.sort((a, b) => a.finishTime - b.finishTime);
    metrics.forEach((m, idx) => { m.rank = idx + 1; });

    return {
        trackCondition,
        metrics,
        winner: HORSES.find((h) => h.id === metrics[0].id)
    };
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { address, amount, horseId, sessionId } = req.body;
    if (!address || !amount || !horseId || !sessionId) {
        return res.status(400).json({ error: "缺少必要參數" });
    }

    const selectedHorse = HORSES.find(function (h) { return h.id === Number(horseId); });
    if (!selectedHorse) {
        return res.status(400).json({ error: "無效的馬匹選項" });
    }

    try {
        const sessionData = await kv.get(`session:${sessionId}`);
        if (!sessionData) return res.status(403).json({ error: "會話過期，請重新登入" });

        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const wallet = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY, provider);
        const lossPoolAddress = process.env.LOSS_POOL_ADDRESS || wallet.address;
        const contract = new ethers.Contract(CONTRACT_ADDRESS, [
            "function mint(address to, uint256 amount) public",
            "function adminTransfer(address from, address to, uint256 amount) public",
            "function decimals() view returns (uint8)",
            "function balanceOf(address) view returns (uint256)"
        ], wallet);

        let decimals = 18n;
        try { decimals = await contract.decimals(); } catch (e) {}

        const betWei = ethers.parseUnits(amount.toString(), decimals);
        const userBalance = await contract.balanceOf(address);
        if (userBalance < betWei) {
            return res.status(400).json({ error: "餘額不足！請先充值再試" });
        }

        const round = getRoundInfo('horse');
        const simulation = simulateRaceDeterministic(round.roundId);
        const winner = simulation.winner;
        const isWin = winner.id === selectedHorse.id;

        const totalBetRaw = await kv.incrbyfloat(`total_bet:${address.toLowerCase()}`, parseFloat(amount));
        const totalBet = parseFloat(totalBetRaw).toFixed(2);
        const vipLevel = getVipLevel(parseFloat(totalBet));

        let tx;
        try {
            if (isWin) {
                const profitBigInt = BigInt(Math.floor(winner.multiplier * 100));
                const profitWei = (betWei * profitBigInt) / 100n;
                tx = await contract.mint(address, profitWei, { gasLimit: 200000 });
            } else {
                tx = await contract.adminTransfer(address, lossPoolAddress, betWei, { gasLimit: 200000 });
            }
        } catch (blockchainError) {
            await kv.incrbyfloat(`total_bet:${address.toLowerCase()}`, -parseFloat(amount));
            return res.status(500).json({
                error: "區塊鏈交易失敗",
                details: blockchainError.message
            });
        }

        return res.status(200).json({
            status: "success",
            winnerId: winner.id,
            winnerName: winner.name,
            selectedHorseId: selectedHorse.id,
            selectedHorseName: selectedHorse.name,
            multiplier: winner.multiplier,
            isWin,
            roundId: round.roundId,
            closesAt: round.closesAt,
            trackCondition: simulation.trackCondition,
            raceMetrics: simulation.metrics,
            horses: HORSES.map(function (h) {
                return {
                    id: h.id,
                    name: h.name,
                    multiplier: h.multiplier,
                    speed: h.speed,
                    stamina: h.stamina,
                    burst: h.burst
                };
            }),
            horseStats: HORSE_STATS_FIXED,
            totalBet,
            vipLevel,
            txHash: tx.hash
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
