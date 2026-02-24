import { kv } from '@vercel/kv';
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "./config.js";

const HORSES = [
    { id: 1, name: "赤焰", weight: 30, multiplier: 1.6, speed: 92, stamina: 88, burst: 86 },
    { id: 2, name: "雷霆", weight: 28, multiplier: 2.0, speed: 89, stamina: 90, burst: 84 },
    { id: 3, name: "幻影", weight: 24, multiplier: 2.5, speed: 86, stamina: 84, burst: 91 },
    { id: 4, name: "夜刃", weight: 18, multiplier: 3.5, speed: 82, stamina: 80, burst: 94 }
];

function randomRange(min, max) {
    return min + Math.random() * (max - min);
}

function simulateRace() {
    const tracks = ["乾地", "濕地", "夜賽"];
    const trackCondition = tracks[Math.floor(Math.random() * tracks.length)];

    const metrics = HORSES.map((horse) => {
        const baseScore = horse.weight * 2 + horse.speed * 0.6 + horse.stamina * 0.5 + horse.burst * 0.7;
        const volatility = randomRange(-20, 20);
        const trackBias =
            trackCondition === "濕地" ? horse.stamina * 0.06 :
            trackCondition === "夜賽" ? horse.burst * 0.07 :
            horse.speed * 0.05;
        const raceScore = baseScore + trackBias + volatility;

        const finishTime = (66 - raceScore / 18).toFixed(2);
        const topSpeed = (54 + raceScore / 12).toFixed(1);
        const reactionMs = Math.round(180 + randomRange(-40, 60) - horse.burst * 0.35);

        return {
            id: horse.id,
            name: horse.name,
            multiplier: horse.multiplier,
            finishTime: parseFloat(finishTime),
            topSpeed: parseFloat(topSpeed),
            reactionMs: reactionMs
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

async function readHorseStats() {
    const statsList = await Promise.all(
        HORSES.map((horse) => kv.get(`horse_stats:${horse.id}`))
    );
    return statsList.map((stats, idx) => {
        const h = HORSES[idx];
        const normalized = stats || { races: 0, wins: 0, podium: 0, last5: [] };
        const winRate = normalized.races > 0 ? ((normalized.wins / normalized.races) * 100).toFixed(1) : "0.0";
        return {
            id: h.id,
            name: h.name,
            races: normalized.races,
            wins: normalized.wins,
            podium: normalized.podium,
            last5: normalized.last5 || [],
            winRate: parseFloat(winRate)
        };
    });
}

async function updateHorseStats(raceMetrics) {
    const current = await readHorseStats();
    const statMap = {};
    current.forEach((row) => { statMap[row.id] = row; });

    await Promise.all(
        raceMetrics.map((row) => {
            const prev = statMap[row.id] || { races: 0, wins: 0, podium: 0, last5: [] };
            const next = {
                races: prev.races + 1,
                wins: prev.wins + (row.rank === 1 ? 1 : 0),
                podium: prev.podium + (row.rank <= 3 ? 1 : 0),
                last5: [row.rank].concat(prev.last5 || []).slice(0, 5)
            };
            return kv.set(`horse_stats:${row.id}`, next);
        })
    );
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

        const simulation = simulateRace();
        const winner = simulation.winner;
        const isWin = winner.id === selectedHorse.id;

        const totalBetRaw = await kv.incrbyfloat(`total_bet:${address.toLowerCase()}`, parseFloat(amount));
        const totalBet = parseFloat(totalBetRaw).toFixed(2);

        let vipLevel = "普通會員";
        if (totalBet >= 100000) vipLevel = "👑 鑽石 VIP";
        else if (totalBet >= 50000) vipLevel = "🥇 黃金會員";
        else if (totalBet >= 10000) vipLevel = "🥈 白銀會員";

        let tx;
        try {
            if (isWin) {
                const profitBigInt = BigInt(Math.floor(winner.multiplier * 100));
                const profitWei = (betWei * profitBigInt) / 100n;
                tx = await contract.mint(address, profitWei, { gasLimit: 200000 });
            } else {
                const burnAddress = "0x000000000000000000000000000000000000dEaD";
                tx = await contract.adminTransfer(address, burnAddress, betWei, { gasLimit: 200000 });
            }
        } catch (blockchainError) {
            await kv.incrbyfloat(`total_bet:${address.toLowerCase()}`, -parseFloat(amount));
            return res.status(500).json({
                error: "區塊鏈交易失敗",
                details: blockchainError.message
            });
        }

        await updateHorseStats(simulation.metrics);
        const horseStats = await readHorseStats();

        return res.status(200).json({
            status: "success",
            winnerId: winner.id,
            winnerName: winner.name,
            selectedHorseId: selectedHorse.id,
            selectedHorseName: selectedHorse.name,
            multiplier: winner.multiplier,
            isWin,
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
            horseStats,
            totalBet,
            vipLevel,
            txHash: tx.hash
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
