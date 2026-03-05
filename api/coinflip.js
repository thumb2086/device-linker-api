import { kv } from '@vercel/kv';
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "../lib/config.js";
import { getRoundInfo, hashInt } from "../lib/auto-round.js";
import { ensureTreasuryLiquidityForWin } from "../lib/treasury.js";
import { applyDemoBalanceDelta, ensureDemoBalance, isDemoSession } from "../lib/demo.js";

function getVipLevel(totalBet) {
  if (totalBet >= 100000) return "鑽石 VIP";
  if (totalBet >= 50000) return "黃金會員";
  if (totalBet >= 10000) return "白銀會員";
  return "普通會員";
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { address, amount, choice, sessionId } = req.body || {};
  if (!address || !amount || !choice || !sessionId) {
    return res.status(400).json({ error: "missing required fields" });
  }
  if (!["heads", "tails"].includes(choice)) {
    return res.status(400).json({ error: "choice must be heads or tails" });
  }

  try {
    const sessionData = await kv.get(`session:${sessionId}`);
    if (!sessionData) return res.status(403).json({ error: "session expired" });

    const round = getRoundInfo('coinflip');
    if (!round.isBettingOpen) {
      return res.status(409).json({
        error: "betting closed",
        roundId: round.roundId,
        closesAt: round.closesAt,
        bettingClosesAt: round.bettingClosesAt
      });
    }

    const betAmount = Number(amount);
    const resultSide = (hashInt(`coinflip:${round.roundId}`) % 2 === 0) ? 'heads' : 'tails';
    const isWin = (choice === resultSide);

    const totalBetRaw = await kv.incrbyfloat(`total_bet:${address.toLowerCase()}`, betAmount);
    const totalBet = parseFloat(totalBetRaw).toFixed(2);
    const vipLevel = getVipLevel(parseFloat(totalBet));

    if (isDemoSession(sessionData)) {
      const enough = await ensureDemoBalance(address, betAmount);
      if (!enough) {
        await kv.incrbyfloat(`total_bet:${address.toLowerCase()}`, -betAmount);
        return res.status(400).json({ error: "insufficient balance" });
      }

      const delta = isWin ? betAmount * 0.8 : -betAmount;
      await applyDemoBalanceDelta(address, delta);

      return res.status(200).json({
        status: "success",
        isWin,
        resultSide,
        roundId: round.roundId,
        closesAt: round.closesAt,
        bettingClosesAt: round.bettingClosesAt,
        totalBet,
        vipLevel,
        txHash: "demo-coinflip"
      });
    }

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

    const decimals = await contract.decimals();
    const betWei = ethers.parseUnits(amount.toString(), decimals);
    const userBalanceWei = await contract.balanceOf(address);
    if (userBalanceWei < betWei) {
      await kv.incrbyfloat(`total_bet:${address.toLowerCase()}`, -betAmount);
      return res.status(400).json({ error: "insufficient balance" });
    }

    let tx;
    if (isWin) {
      const profitWei = (betWei * 80n) / 100n;
      await ensureTreasuryLiquidityForWin(contract, lossPoolAddress);
      tx = await contract.adminTransfer(lossPoolAddress, address, profitWei, { gasLimit: 200000 });
    } else {
      tx = await contract.adminTransfer(address, lossPoolAddress, betWei, { gasLimit: 200000 });
    }

    return res.status(200).json({
      status: "success",
      isWin,
      resultSide,
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
