import { kv } from '@vercel/kv';
import { getSession } from "../session-store.js";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "../config.js";
import { getRoundInfo, hashFloat } from "../auto-round.js";
import { transferFromTreasuryWithAutoTopup } from "../treasury.js";
import { assertVipBetLimit, buildVipStatus } from "../vip.js";
import { recordGameHistory } from "../game-history.js";

const HORSES = [
    { id: 1, name: "赤焰", weight: 25, multiplier: 1.8, speed: 92, stamina: 88, burst: 86 },
    { id: 2, name: "雷霆", weight: 23, multiplier: 2.2, speed: 89, stamina: 90, burst: 84 },
    { id: 3, name: "幻影", weight: 19, multiplier: 2.9, speed: 86, stamina: 84, burst: 91 },
    { id: 4, name: "夜刃", weight: 15, multiplier: 4.0, speed: 82, stamina: 80, burst: 94 },
    { id: 5, name: "霜牙", weight: 11, multiplier: 5.8, speed: 80, stamina: 93, burst: 78 },
    { id: 6, name: "流星", weight: 7, multiplier: 8.5, speed: 95, stamina: 72, burst: 97 }
];

const TRACKS = ["乾地", "濕地", "夜賽"];

// 固定後台資料：不隨每局漂移，避免「勝率跑掉」
const HORSE_STATS_FIXED = [
    { id: 1, name: "赤焰", races: 1800, wins: 450, podium: 1130, last5: [1, 2, 1, 3, 2], winRate: 25.0 },
    { id: 2, name: "雷霆", races: 1800, wins: 414, podium: 1068, last5: [2, 1, 3, 2, 2], winRate: 23.0 },
    { id: 3, name: "幻影", races: 1800, wins: 342, podium: 930, last5: [3, 4, 1, 2, 3], winRate: 19.0 },
    { id: 4, name: "夜刃", races: 1800, wins: 270, podium: 792, last5: [4, 3, 2, 4, 1], winRate: 15.0 },
    { id: 5, name: "霜牙", races: 1800, wins: 198, podium: 625, last5: [5, 2, 6, 3, 4], winRate: 11.0 },
    { id: 6, name: "流星", races: 1800, wins: 126, podium: 435, last5: [6, 5, 4, 2, 1], winRate: 7.0 }
];

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
        const sessionData = await getSession(sessionId);
        if (!sessionData) return res.status(403).json({ error: "會話過期，請重新登入" });

        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const wallet = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY, provider);
        const lossPoolAddress = process.env.LOSS_POOL_ADDRESS || wallet.address;
        const contract = new ethers.Contract(CONTRACT_ADDRESS, [
            "function mint(address to, uint256 amount) public",
            "function adminTransfer(address from, address to, uint256 amount) public",
            "function decimals() view returns (uint8)",
            "function balanceOf(address) view returns (uint256)",
            "function totalSupply() view returns (uint256)"
        ], wallet);

        let decimals = 18n;
        try { decimals = await contract.decimals(); } catch (e) {}

        const currentTotalBet = Number(await kv.get(`total_bet:${address.toLowerCase()}`) || 0);
        const currentVipStatus = buildVipStatus(currentTotalBet);
        try {
            assertVipBetLimit(amount, currentTotalBet);
        } catch (betError) {
            return res.status(400).json({ error: betError.message, vipLevel: currentVipStatus.vipLevel, maxBet: currentVipStatus.maxBet });
        }

        const betWei = ethers.parseUnits(amount.toString(), decimals);
        const userBalance = await contract.balanceOf(address);
        if (userBalance < betWei) {
            return res.status(400).json({ error: "餘額不足！請先充值再試" });
        }

        const round = getRoundInfo('horse');
        if (!round.isBettingOpen) {
            return res.status(409).json({
                error: "本局開跑中，暫停下注，請等下一局",
                roundId: round.roundId,
                closesAt: round.closesAt,
                bettingClosesAt: round.bettingClosesAt
            });
        }
        const simulation = simulateRaceDeterministic(round.roundId);
        const winner = simulation.winner;
        const isWin = winner.id === selectedHorse.id;

        const totalBetRaw = await kv.incrbyfloat(`total_bet:${address.toLowerCase()}`, parseFloat(amount));
        const totalBet = parseFloat(totalBetRaw).toFixed(2);
        const vipStatus = buildVipStatus(parseFloat(totalBet));

        let tx;
        let netWei;
        try {
            if (isWin) {
                const profitBigInt = BigInt(Math.floor(winner.multiplier * 100));
                const profitWei = (betWei * profitBigInt) / 100n;
                netWei = profitWei;
                tx = await transferFromTreasuryWithAutoTopup(contract, lossPoolAddress, address, profitWei, { gasLimit: 200000 });
            } else {
                netWei = -betWei;
                tx = await contract.adminTransfer(address, lossPoolAddress, betWei, { gasLimit: 200000 });
            }
        } catch (blockchainError) {
            await kv.incrbyfloat(`total_bet:${address.toLowerCase()}`, -parseFloat(amount));
            return res.status(500).json({
                error: "區塊鏈交易失敗",
                details: blockchainError.message
            });
        }

        await recordGameHistory({
            address,
            game: "horse",
            gameLabel: "賽馬",
            outcome: isWin ? "win" : "lose",
            outcomeLabel: isWin ? "猜中冠軍" : "落敗",
            betWei,
            payoutWei: isWin ? netWei : 0n,
            netWei,
            multiplier: isWin ? winner.multiplier : 0,
            roundId: String(round.roundId),
            txHash: tx.hash,
            details: `下注 ${selectedHorse.name} / 冠軍 ${winner.name}`,
            decimals
        });

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
            bettingClosesAt: round.bettingClosesAt,
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
            vipLevel: vipStatus.vipLevel,
            maxBet: vipStatus.maxBet,
            txHash: tx.hash
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
