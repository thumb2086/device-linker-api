import { kv } from '@vercel/kv';
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "../lib/config.js";
import { getRoundInfo, hashInt } from "../lib/auto-round.js";

function getVipLevel(totalBet) {
    if (totalBet >= 100000) return "👑 鑽石 VIP";
    if (totalBet >= 50000) return "🥇 黃金會員";
    if (totalBet >= 10000) return "🥈 白銀會員";
    return "普通會員";
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { address, amount, choice, sessionId } = req.body;
    if (!address || !amount || !choice || !sessionId) {
        return res.status(400).json({ error: "缺少必要參數" });
    }

    if (!['heads', 'tails'].includes(choice)) {
        return res.status(400).json({ error: "choice 必須是 heads 或 tails" });
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
        const userBalanceWei = await contract.balanceOf(address);
        if (userBalanceWei < betWei) {
            return res.status(400).json({ error: "餘額不足！請先充值再試" });
        }

        // 固定分局開獎：同一局所有玩家結果相同
        const round = getRoundInfo('coinflip');
        if (!round.isBettingOpen) {
            return res.status(409).json({
                error: "本局開獎中，暫停下注，請等下一局",
                serverNowTs: Date.now(),
                roundId: round.roundId,
                closesAt: round.closesAt,
                bettingClosesAt: round.bettingClosesAt
            });
        }
        const resultSide = (hashInt(`coinflip:${round.roundId}`) % 2 === 0) ? 'heads' : 'tails';
        const isWin = (choice === resultSide);

        const totalBetRaw = await kv.incrbyfloat(`total_bet:${address.toLowerCase()}`, parseFloat(amount));
        const totalBet = parseFloat(totalBetRaw).toFixed(2);
        const vipLevel = getVipLevel(parseFloat(totalBet));

        let tx;
        try {
            if (isWin) {
                const profitWei = (betWei * 80n) / 100n;
                tx = await contract.mint(address, profitWei, { gasLimit: 200000 });
            } else {
                tx = await contract.adminTransfer(address, lossPoolAddress, betWei, { gasLimit: 200000 });
            }
        } catch (blockchainError) {
            await kv.incrbyfloat(`total_bet:${address.toLowerCase()}`, -parseFloat(amount));
            return res.status(500).json({
                error: "區塊鏈交易失敗 (可能是 Gas 不足)",
                details: blockchainError.message
            });
        }

        return res.status(200).json({
            status: "success",
            serverNowTs: Date.now(),
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
