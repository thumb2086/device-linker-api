import { kv } from '@vercel/kv';
import { getSession } from "../session-store.js";
import { ethers } from "ethers";
import { getRoundInfo, hashInt } from "../auto-round.js";
import { assertVipBetLimit, buildVipStatus } from "../vip.js";
import { recordGameHistory } from "../game-history.js";
import { applySettlementBuffs, persistSettlementBuffProfile } from "../game-buffs.js";
import { settlementService } from "../settlement-service.js";
import { recordTotalBet } from "../total-bet.js";

const TX_SOURCE = "coinflip";

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

        const decimals = await settlementService.getDecimals();

        const currentTotalBet = Number(await kv.get(`total_bet:${address.toLowerCase()}`) || 0);
        const currentVipStatus = buildVipStatus(currentTotalBet);
        try {
            assertVipBetLimit(amount, currentTotalBet);
        } catch (betError) {
            return res.status(400).json({ error: betError.message, vipLevel: currentVipStatus.vipLevel, maxBet: currentVipStatus.maxBet });
        }

        const betWei = ethers.parseUnits(amount.toString(), decimals);
        const userBalanceWei = await settlementService.contract.balanceOf(address);
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

        const totalBetRaw = await recordTotalBet(address, parseFloat(amount));
        const totalBet = parseFloat(totalBetRaw).toFixed(2);
        const vipStatus = buildVipStatus(parseFloat(totalBet));

        let payoutWei = 0n;
        let netWei = -betWei;
        if (isWin) {
            payoutWei = (betWei * 180n) / 100n;
            netWei = payoutWei - betWei;
        }
        const buffAdjusted = await applySettlementBuffs({
            address,
            betWei,
            payoutWei,
            netWei,
            decimals,
            scope: "solo",
            persist: false
        });
        payoutWei = buffAdjusted.payoutWei;
        netWei = buffAdjusted.netWei;
        try {
            const results = await settlementService.settle({
                userAddress: address,
                betWei,
                payoutWei,
                source: TX_SOURCE,
                meta: { roundId: round.roundId, choice }
            });

            if (buffAdjusted.changed) {
                await persistSettlementBuffProfile(buffAdjusted.profile);
            }

            const txHash = results.payoutTxHash || results.betTxHash;

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
                txHash,
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
                txHash
            });
        } catch (blockchainError) {
            await recordTotalBet(address, -parseFloat(amount));
            return res.status(500).json({
                error: "區塊鏈交易失敗",
                details: blockchainError.message
            });
        }
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
