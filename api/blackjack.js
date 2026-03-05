import { kv } from '@vercel/kv';
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "../lib/config.js";
import { ensureTreasuryLiquidityForWin } from "../lib/treasury.js";
import { applyDemoBalanceDelta, ensureDemoBalance, isDemoSession } from "../lib/demo.js";

const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = [
  { value: 11, label: "A" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 4, label: "4" },
  { value: 5, label: "5" },
  { value: 6, label: "6" },
  { value: 7, label: "7" },
  { value: 8, label: "8" },
  { value: 9, label: "9" },
  { value: 10, label: "10" },
  { value: 10, label: "J" },
  { value: 10, label: "Q" },
  { value: 10, label: "K" }
];

function drawCard() {
  const rank = RANKS[Math.floor(Math.random() * RANKS.length)];
  const suit = SUITS[Math.floor(Math.random() * SUITS.length)];
  return { rank: rank.label, suit, value: rank.value };
}

function calcTotal(cards) {
  let total = cards.reduce((sum, c) => sum + c.value, 0);
  let aces = cards.filter((c) => c.rank === "A").length;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
}

function getVipLevel(totalBet) {
  if (totalBet >= 100000) return "鑽石 VIP";
  if (totalBet >= 50000) return "黃金會員";
  if (totalBet >= 10000) return "白銀會員";
  return "普通會員";
}

function roundKey(sessionId) {
  return `blackjack_round:${sessionId}`;
}

function evaluateRound(round) {
  const playerTotal = calcTotal(round.playerCards);
  const dealerTotal = calcTotal(round.dealerCards);

  const result = {
    isWin: false,
    isPush: false,
    reason: "",
    multiplier: 0
  };

  if (playerTotal > 21) {
    result.reason = "player bust";
  } else if (dealerTotal > 21) {
    result.isWin = true;
    result.reason = "dealer bust";
    result.multiplier = round.playerCards.length === 2 && playerTotal === 21 ? 1.5 : 1;
  } else if (playerTotal > dealerTotal) {
    result.isWin = true;
    result.reason = "player higher total";
    result.multiplier = round.playerCards.length === 2 && playerTotal === 21 ? 1.5 : 1;
  } else if (playerTotal < dealerTotal) {
    result.reason = "dealer higher total";
  } else {
    result.isPush = true;
    result.reason = "push";
  }

  return { playerTotal, dealerTotal, result };
}

async function settleRoundDemo({ address, round }) {
  const { playerTotal, dealerTotal, result } = evaluateRound(round);

  if (!result.isPush) {
    if (result.isWin) {
      await applyDemoBalanceDelta(address, round.amount * result.multiplier);
    } else {
      await applyDemoBalanceDelta(address, -round.amount);
    }
  }

  await kv.del(roundKey(round.sessionId));

  return {
    status: "settled",
    playerCards: round.playerCards,
    dealerCards: round.dealerCards,
    playerTotal,
    dealerTotal,
    isWin: result.isWin,
    isPush: result.isPush,
    reason: result.reason,
    multiplier: result.multiplier,
    totalBet: round.totalBet,
    vipLevel: round.vipLevel,
    txHash: "demo-blackjack"
  };
}

async function settleRoundLive({ contract, lossPoolAddress, address, round }) {
  const { playerTotal, dealerTotal, result } = evaluateRound(round);
  const betWei = BigInt(round.betWei);
  let txHash = "";

  if (!result.isPush) {
    if (result.isWin) {
      const profitWei = (betWei * BigInt(Math.floor(result.multiplier * 100))) / 100n;
      await ensureTreasuryLiquidityForWin(contract, lossPoolAddress);
      const tx = await contract.adminTransfer(lossPoolAddress, address, profitWei, { gasLimit: 200000 });
      txHash = tx.hash;
    } else {
      const tx = await contract.adminTransfer(address, lossPoolAddress, betWei, { gasLimit: 200000 });
      txHash = tx.hash;
    }
  }

  await kv.del(roundKey(round.sessionId));

  return {
    status: "settled",
    playerCards: round.playerCards,
    dealerCards: round.dealerCards,
    playerTotal,
    dealerTotal,
    isWin: result.isWin,
    isPush: result.isPush,
    reason: result.reason,
    multiplier: result.multiplier,
    totalBet: round.totalBet,
    vipLevel: round.vipLevel,
    txHash
  };
}

function buildLiveContract() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY, provider);
  const lossPoolAddress = process.env.LOSS_POOL_ADDRESS || wallet.address;
  const contract = new ethers.Contract(CONTRACT_ADDRESS, [
    "function adminTransfer(address from, address to, uint256 amount) public",
    "function decimals() view returns (uint8)",
    "function balanceOf(address) view returns (uint256)"
  ], wallet);

  return { contract, lossPoolAddress };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { address, amount, sessionId, action } = req.body || {};
  if (!address || !sessionId) {
    return res.status(400).json({ error: "missing required fields" });
  }

  const normalizedAction = action || "start";
  if (!["start", "hit", "stand"].includes(normalizedAction)) {
    return res.status(400).json({ error: "invalid action" });
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

    const demoMode = isDemoSession(sessionData);
    let contract = null;
    let lossPoolAddress = "";

    if (!demoMode) {
      const live = buildLiveContract();
      contract = live.contract;
      lossPoolAddress = live.lossPoolAddress;
    }

    if (normalizedAction === "start") {
      const betAmount = Number(amount);
      if (!Number.isFinite(betAmount) || betAmount <= 0) {
        return res.status(400).json({ error: "invalid amount" });
      }

      let betWei = "0";
      if (demoMode) {
        if (!(await ensureDemoBalance(normalizedAddress, betAmount))) {
          return res.status(400).json({ error: "insufficient balance" });
        }
      } else {
        const decimals = await contract.decimals();
        const betWeiValue = ethers.parseUnits(amount.toString(), decimals);
        const userBalanceWei = await contract.balanceOf(normalizedAddress);
        if (userBalanceWei < betWeiValue) {
          return res.status(400).json({ error: "insufficient balance" });
        }
        betWei = betWeiValue.toString();
      }

      const totalBetRaw = await kv.incrbyfloat(`total_bet:${normalizedAddress}`, betAmount);
      const totalBet = parseFloat(totalBetRaw).toFixed(2);
      const vipLevel = getVipLevel(parseFloat(totalBet));

      const playerCards = [drawCard(), drawCard()];
      const dealerCards = [drawCard(), drawCard()];
      const playerTotal = calcTotal(playerCards);
      const dealerTotal = calcTotal(dealerCards);

      const round = {
        sessionId,
        address: normalizedAddress,
        amount: betAmount,
        betWei,
        mode: demoMode ? "demo" : "live",
        playerCards,
        dealerCards,
        totalBet,
        vipLevel,
        startedAt: Date.now()
      };

      await kv.set(roundKey(sessionId), round, { ex: 600 });

      const playerBj = playerCards.length === 2 && playerTotal === 21;
      const dealerBj = dealerCards.length === 2 && dealerTotal === 21;
      if (playerBj || dealerBj) {
        try {
          if (demoMode) return res.status(200).json(await settleRoundDemo({ address: normalizedAddress, round }));
          return res.status(200).json(await settleRoundLive({ contract, lossPoolAddress, address: normalizedAddress, round }));
        } catch (settleError) {
          await kv.incrbyfloat(`total_bet:${normalizedAddress}`, -betAmount);
          await kv.del(roundKey(sessionId));
          return res.status(500).json({ error: settleError.message });
        }
      }

      return res.status(200).json({
        status: "in_progress",
        playerCards,
        dealerCards: [dealerCards[0], { rank: "?", suit: "?", hidden: true }],
        playerTotal,
        dealerTotal: dealerCards[0].value,
        totalBet,
        vipLevel
      });
    }

    const round = await kv.get(roundKey(sessionId));
    if (!round) return res.status(400).json({ error: "round not found, start a new game" });
    if (round.address !== normalizedAddress) return res.status(403).json({ error: "address does not match round owner" });

    const roundDemo = round.mode === "demo";
    if (!roundDemo && !contract) {
      const live = buildLiveContract();
      contract = live.contract;
      lossPoolAddress = live.lossPoolAddress;
    }

    if (normalizedAction === "hit") {
      round.playerCards.push(drawCard());
      const playerTotal = calcTotal(round.playerCards);

      if (playerTotal > 21) {
        try {
          if (roundDemo) return res.status(200).json(await settleRoundDemo({ address: normalizedAddress, round }));
          return res.status(200).json(await settleRoundLive({ contract, lossPoolAddress, address: normalizedAddress, round }));
        } catch (settleError) {
          await kv.incrbyfloat(`total_bet:${normalizedAddress}`, -round.amount);
          await kv.del(roundKey(sessionId));
          return res.status(500).json({ error: settleError.message });
        }
      }

      await kv.set(roundKey(sessionId), round, { ex: 600 });
      return res.status(200).json({
        status: "in_progress",
        playerCards: round.playerCards,
        dealerCards: [round.dealerCards[0], { rank: "?", suit: "?", hidden: true }],
        playerTotal,
        dealerTotal: round.dealerCards[0].value,
        totalBet: round.totalBet,
        vipLevel: round.vipLevel
      });
    }

    while (calcTotal(round.dealerCards) < 17) {
      round.dealerCards.push(drawCard());
    }

    try {
      if (roundDemo) return res.status(200).json(await settleRoundDemo({ address: normalizedAddress, round }));
      return res.status(200).json(await settleRoundLive({ contract, lossPoolAddress, address: normalizedAddress, round }));
    } catch (settleError) {
      await kv.incrbyfloat(`total_bet:${normalizedAddress}`, -round.amount);
      await kv.del(roundKey(sessionId));
      return res.status(500).json({ error: settleError.message });
    }
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
