import { kv } from '@vercel/kv';
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "../lib/config.js";
import { getRoundInfo } from "../lib/auto-round.js";
import { ensureTreasuryLiquidityForWin } from "../lib/treasury.js";
import { applyDemoBalanceDelta, ensureDemoBalance, isDemoSession } from "../lib/demo.js";

const HORSES = [
  { id: 1, name: "閃電快手", multiplier: 3.5 },
  { id: 2, name: "疾風之影", multiplier: 4.0 },
  { id: 3, name: "黃金猛擊", multiplier: 5.5 },
  { id: 4, name: "烈焰狂奔", multiplier: 8.0 },
  { id: 5, name: "星光奇蹟", multiplier: 12.0 },
  { id: 6, name: "終極榮耀", multiplier: 20.0 }
];

const TRACK_CONDITIONS = ["良好", "稍重", "重馬", "不良"];

const HORSE_STATS_FIXED = {
  1: { speed: 85, stamina: 70, explosive: 90, consistency: 80 },
  2: { speed: 92, stamina: 65, explosive: 85, consistency: 75 },
  3: { speed: 78, stamina: 88, explosive: 75, consistency: 90 },
  4: { speed: 82, stamina: 75, explosive: 95, consistency: 70 },
  5: { speed: 75, stamina: 92, explosive: 70, consistency: 85 },
  6: { speed: 70, stamina: 80, explosive: 80, consistency: 60 }
};

function getVipLevel(totalBet) {
  if (totalBet >= 100000) return "鑽石 VIP";
  if (totalBet >= 50000) return "黃金會員";
  if (totalBet >= 10000) return "白銀會員";
  return "普通會員";
}

function hashInt(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function simulateRaceDeterministic(roundId) {
  const seedStr = `horse_race:${roundId}`;
  const seed = hashInt(seedStr);

  const conditionIdx = seed % TRACK_CONDITIONS.length;
  const trackCondition = TRACK_CONDITIONS[conditionIdx];

  const horseScores = HORSES.map((h) => {
    const horseSeed = hashInt(`${seedStr}:${h.id}`);
    const stats = HORSE_STATS_FIXED[h.id];
    const baseScore = stats.speed * 0.4 + stats.stamina * 0.2 + stats.explosive * 0.3 + stats.consistency * 0.1;
    const luck = (horseSeed % 20);
    return { id: h.id, score: baseScore + luck };
  });

  horseScores.sort((a, b) => b.score - a.score);
  const winnerId = horseScores[0].id;
  const winner = HORSES.find((h) => h.id === winnerId);

  const metrics = HORSES.map((h) => {
    const hSeed = hashInt(`${seedStr}:metric:${h.id}`);
    const score = horseScores.find((hs) => hs.id === h.id).score;
    const finishTime = (100 - score / 2).toFixed(2);
    const topSpeed = (statsToVal(HORSE_STATS_FIXED[h.id].speed) + (hSeed % 10)).toFixed(1);
    return { horseId: h.id, finishTime, topSpeed };
  });

  return { winner, trackCondition, metrics };
}

function statsToVal(s) {
  return 50 + s / 4;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { address, amount, sessionId, horseId } = req.body || {};
  if (!address || !amount || !sessionId || !horseId) {
    return res.status(400).json({ error: "missing required fields" });
  }

  const selectedHorse = HORSES.find((h) => h.id === Number(horseId));
  if (!selectedHorse) {
    return res.status(400).json({ error: "invalid horse id" });
  }

  const betAmount = Number(amount);
  if (!Number.isFinite(betAmount) || betAmount <= 0) {
    return res.status(400).json({ error: "invalid amount" });
  }

  try {
    const sessionData = await kv.get(`session:${sessionId}`);
    if (!sessionData || sessionData.status !== "authorized") {
      return res.status(403).json({ error: "session expired" });
    }

    const normalizedAddress = String(address).toLowerCase();
    if (sessionData.address !== normalizedAddress) {
      return res.status(403).json({ error: "address does not match session" });
    }

    const round = getRoundInfo('horse');
    if (!round.isBettingOpen) {
      return res.status(409).json({
        error: "betting closed",
        roundId: round.roundId,
        closesAt: round.closesAt,
        bettingClosesAt: round.bettingClosesAt
      });
    }

    const simulation = simulateRaceDeterministic(round.roundId);
    const winner = simulation.winner;
    const isWin = winner.id === selectedHorse.id;

    const totalBetRaw = await kv.incrbyfloat(`total_bet:${normalizedAddress}`, betAmount);
    const totalBet = parseFloat(totalBetRaw).toFixed(2);
    const vipLevel = getVipLevel(parseFloat(totalBet));

    if (isDemoSession(sessionData)) {
      if (!(await ensureDemoBalance(normalizedAddress, betAmount))) {
        await kv.incrbyfloat(`total_bet:${normalizedAddress}`, -betAmount);
        return res.status(400).json({ error: "insufficient balance" });
      }

      await applyDemoBalanceDelta(normalizedAddress, isWin ? betAmount * winner.multiplier : -betAmount);

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
        horses: HORSES,
        horseStats: HORSE_STATS_FIXED,
        totalBet,
        vipLevel,
        txHash: "demo-horse"
      });
    }

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY, provider);
    const lossPoolAddress = process.env.LOSS_POOL_ADDRESS || wallet.address;
    const contract = new ethers.Contract(CONTRACT_ADDRESS, [
      "function adminTransfer(address from, address to, uint256 amount) public",
      "function decimals() view returns (uint8)",
      "function balanceOf(address) view returns (uint256)"
    ], wallet);

    const decimals = await contract.decimals();
    const betWei = ethers.parseUnits(amount.toString(), decimals);
    const userBalanceWei = await contract.balanceOf(normalizedAddress);
    if (userBalanceWei < betWei) {
      await kv.incrbyfloat(`total_bet:${normalizedAddress}`, -betAmount);
      return res.status(400).json({ error: "insufficient balance" });
    }

    let tx;
    if (isWin) {
      const profitWei = (betWei * BigInt(Math.floor(winner.multiplier * 100))) / 100n;
      await ensureTreasuryLiquidityForWin(contract, lossPoolAddress);
      tx = await contract.adminTransfer(lossPoolAddress, normalizedAddress, profitWei, { gasLimit: 200000 });
    } else {
      tx = await contract.adminTransfer(normalizedAddress, lossPoolAddress, betWei, { gasLimit: 200000 });
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
      bettingClosesAt: round.bettingClosesAt,
      trackCondition: simulation.trackCondition,
      raceMetrics: simulation.metrics,
      horses: HORSES,
      horseStats: HORSE_STATS_FIXED,
      totalBet,
      vipLevel,
      txHash: tx.hash
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
