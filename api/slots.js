import { kv } from '@vercel/kv';
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "../lib/config.js";
import { ensureTreasuryLiquidityForWin } from "../lib/treasury.js";
import { applyDemoBalanceDelta, ensureDemoBalance, isDemoSession } from "../lib/demo.js";

const SYMBOLS = [
  { name: "cherry", emoji: "🍒", weight: 30 },
  { name: "lemon", emoji: "🍋", weight: 25 },
  { name: "bell", emoji: "🔔", weight: 20 },
  { name: "star", emoji: "⭐", weight: 15 },
  { name: "diamond", emoji: "💎", weight: 8 },
  { name: "seven", emoji: "7️⃣", weight: 2 }
];

const TRIPLE_PAYOUT = {
  cherry: 2,
  lemon: 3,
  bell: 5,
  star: 8,
  diamond: 15,
  seven: 50
};

const DOUBLE_PAYOUT = 0.5;

function getVipLevel(totalBet) {
  if (totalBet >= 100000) return "鑽石 VIP";
  if (totalBet >= 50000) return "黃金會員";
  if (totalBet >= 10000) return "白銀會員";
  return "普通會員";
}

function spinReel() {
  const totalWeight = SYMBOLS.reduce((sum, s) => sum + s.weight, 0);
  let rand = Math.random() * totalWeight;

  for (const symbol of SYMBOLS) {
    rand -= symbol.weight;
    if (rand <= 0) return symbol;
  }

  return SYMBOLS[0];
}

function evaluateResult(reels) {
  const names = reels.map((r) => r.name);

  if (names[0] === names[1] && names[1] === names[2]) {
    return { type: "triple", multiplier: TRIPLE_PAYOUT[names[0]], symbol: names[0] };
  }

  if (names[0] === names[1] || names[1] === names[2] || names[0] === names[2]) {
    return { type: "double", multiplier: DOUBLE_PAYOUT, symbol: null };
  }

  return { type: "lose", multiplier: -1, symbol: null };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { address, amount, sessionId } = req.body || {};
  if (!address || !amount || !sessionId) {
    return res.status(400).json({ error: "missing required fields" });
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

    const reels = [spinReel(), spinReel(), spinReel()];
    const result = evaluateResult(reels);

    const totalBetRaw = await kv.incrbyfloat(`total_bet:${normalizedAddress}`, betAmount);
    const totalBet = parseFloat(totalBetRaw).toFixed(2);
    const vipLevel = getVipLevel(parseFloat(totalBet));

    if (isDemoSession(sessionData)) {
      if (!(await ensureDemoBalance(normalizedAddress, betAmount))) {
        await kv.incrbyfloat(`total_bet:${normalizedAddress}`, -betAmount);
        return res.status(400).json({ error: "insufficient balance" });
      }

      let delta;
      if (result.type === "triple") {
        delta = betAmount * result.multiplier;
      } else if (result.type === "double") {
        delta = -(betAmount * 0.5);
      } else {
        delta = -betAmount;
      }

      await applyDemoBalanceDelta(normalizedAddress, delta);

      return res.status(200).json({
        status: "success",
        reels: reels.map((r) => ({ name: r.name, emoji: r.emoji })),
        resultType: result.type,
        multiplier: result.multiplier,
        isWin: result.type === "triple",
        totalBet,
        vipLevel,
        txHash: "demo-slots"
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
    if (result.type === "triple") {
      const profitWei = (betWei * BigInt(Math.floor(result.multiplier * 100))) / 100n;
      await ensureTreasuryLiquidityForWin(contract, lossPoolAddress);
      tx = await contract.adminTransfer(lossPoolAddress, normalizedAddress, profitWei, { gasLimit: 200000 });
    } else if (result.type === "double") {
      tx = await contract.adminTransfer(normalizedAddress, lossPoolAddress, betWei / 2n, { gasLimit: 200000 });
    } else {
      tx = await contract.adminTransfer(normalizedAddress, lossPoolAddress, betWei, { gasLimit: 200000 });
    }

    return res.status(200).json({
      status: "success",
      reels: reels.map((r) => ({ name: r.name, emoji: r.emoji })),
      resultType: result.type,
      multiplier: result.multiplier,
      isWin: result.type === "triple",
      totalBet,
      vipLevel,
      txHash: tx.hash
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
