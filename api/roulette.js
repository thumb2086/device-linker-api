import { kv } from '@vercel/kv';
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "../lib/config.js";
import { getRoundInfo, hashInt } from "../lib/auto-round.js";
import { ensureTreasuryLiquidityForWin } from "../lib/treasury.js";
import { applyDemoBalanceDelta, ensureDemoBalance, isDemoSession } from "../lib/demo.js";

const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

function getColor(num) {
  if (num === 0) return "green";
  return RED_NUMBERS.has(num) ? "red" : "black";
}

function evaluateBet(number, betType, betValue) {
  const color = getColor(number);

  if (betType === "color") return { isWin: betValue === color, multiplier: 1 };

  if (betType === "parity") {
    if (number === 0) return { isWin: false, multiplier: 1 };
    const parity = number % 2 === 0 ? "even" : "odd";
    return { isWin: parity === betValue, multiplier: 1 };
  }

  if (betType === "range") {
    if (number === 0) return { isWin: false, multiplier: 1 };
    const range = number <= 18 ? "low" : "high";
    return { isWin: range === betValue, multiplier: 1 };
  }

  if (betType === "dozen") {
    const n = Number(betValue);
    if (![1, 2, 3].includes(n) || number === 0) return { isWin: false, multiplier: 2 };
    return { isWin: Math.ceil(number / 12) === n, multiplier: 2 };
  }

  if (betType === "number") return { isWin: number === Number(betValue), multiplier: 35 };

  return { isWin: false, multiplier: 1 };
}

function getVipLevel(totalBet) {
  if (totalBet >= 100000) return "鑽石 VIP";
  if (totalBet >= 50000) return "黃金會員";
  if (totalBet >= 10000) return "白銀會員";
  return "普通會員";
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { address, amount, sessionId, betType, betValue } = req.body || {};
  if (!address || !amount || !sessionId || !betType || betValue === undefined || betValue === null) {
    return res.status(400).json({ error: "missing required fields" });
  }

  if (!["color", "parity", "range", "dozen", "number"].includes(betType)) {
    return res.status(400).json({ error: "invalid bet type" });
  }

  if (betType === "number") {
    const target = Number(betValue);
    if (!Number.isInteger(target) || target < 0 || target > 36) {
      return res.status(400).json({ error: "number must be between 0 and 36" });
    }
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

    const round = getRoundInfo('roulette');
    if (!round.isBettingOpen) {
      return res.status(409).json({
        error: "betting closed",
        roundId: round.roundId,
        closesAt: round.closesAt,
        bettingClosesAt: round.bettingClosesAt
      });
    }

    const winningNumber = hashInt(`roulette:${round.roundId}`) % 37;
    const winningColor = getColor(winningNumber);
    const result = evaluateBet(winningNumber, betType, betValue);

    const totalBetRaw = await kv.incrbyfloat(`total_bet:${normalizedAddress}`, betAmount);
    const totalBet = parseFloat(totalBetRaw).toFixed(2);
    const vipLevel = getVipLevel(parseFloat(totalBet));

    if (isDemoSession(sessionData)) {
      if (!(await ensureDemoBalance(normalizedAddress, betAmount))) {
        await kv.incrbyfloat(`total_bet:${normalizedAddress}`, -betAmount);
        return res.status(400).json({ error: "insufficient balance" });
      }

      await applyDemoBalanceDelta(normalizedAddress, result.isWin ? betAmount * result.multiplier : -betAmount);

      return res.status(200).json({
        status: "success",
        winningNumber,
        winningColor,
        isWin: result.isWin,
        multiplier: result.multiplier,
        betType,
        betValue,
        roundId: round.roundId,
        closesAt: round.closesAt,
        bettingClosesAt: round.bettingClosesAt,
        totalBet,
        vipLevel,
        txHash: "demo-roulette"
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
    if (result.isWin) {
      const profitWei = (betWei * BigInt(Math.floor(result.multiplier * 100))) / 100n;
      await ensureTreasuryLiquidityForWin(contract, lossPoolAddress);
      tx = await contract.adminTransfer(lossPoolAddress, normalizedAddress, profitWei, { gasLimit: 200000 });
    } else {
      tx = await contract.adminTransfer(normalizedAddress, lossPoolAddress, betWei, { gasLimit: 200000 });
    }

    return res.status(200).json({
      status: "success",
      winningNumber,
      winningColor,
      isWin: result.isWin,
      multiplier: result.multiplier,
      betType,
      betValue,
      roundId: round.roundId,
      closesAt: round.closesAt,
      bettingClosesAt: round.bettingClosesAt,
      totalBet,
      vipLevel,
      txHash: tx.hash
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
