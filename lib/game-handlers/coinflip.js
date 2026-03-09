import { kv } from '@vercel/kv';
import { getSession } from "../session-store.js";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "../config.js";
import { getRoundInfo, hashInt } from "../auto-round.js";
import { transferFromTreasuryWithAutoTopup } from "../treasury.js";
import { assertVipBetLimit, buildVipStatus } from "../vip.js";
import { recordGameHistory } from "../game-history.js";
import { withChainTxLock } from "../tx-lock.js";

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
        const vipStatus = buildVipStatus(parseFloat(totalBet));

        let tx;
        let betTx;
        let payoutWei = 0n;
        let netWei = -betWei;
        try {
            tx = await withChainTxLock(async () => {
                betTx = await contract.adminTransfer(address, lossPoolAddress, betWei, { gasLimit: 200000 });
                if (isWin) {
                    payoutWei = (betWei * 180n) / 100n;
                    netWei = payoutWei - betWei;
                    return transferFromTreasuryWithAutoTopup(contract, lossPoolAddress, address, payoutWei, { gasLimit: 200000 });
                }
                return betTx;
            });
        } catch (blockchainError) {
            await kv.incrbyfloat(`total_bet:${address.toLowerCase()}`, -parseFloat(amount));
            return res.status(500).json({
                error: "區塊鏈交易失敗 (可能是 Gas 不足)",
                details: blockchainError.message
            });
        }

        await recordGameHistory({
            address,
            game: "coinflip",
            gameLabel: "擲硬幣",
            outcome: isWin ? "win" : "lose",
            outcomeLabel: isWin ? "猜中" : "猜錯",
            betWei,
            payoutWei,
            netWei,
            multiplier: isWin ? 1.8 : 0,
            roundId: String(round.roundId),
            txHash: tx.hash,
            details: `結果 ${resultSide} / 下注 ${choice}`,
            decimals
        });

        return res.status(200).json({
            status: "success",
            serverNowTs: Date.now(),
            isWin,
            resultSide,
            roundId: round.roundId,
            closesAt: round.closesAt,
            bettingClosesAt: round.bettingClosesAt,
            totalBet,
            vipLevel: vipStatus.vipLevel,
            maxBet: vipStatus.maxBet,
            txHash: tx.hash
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
