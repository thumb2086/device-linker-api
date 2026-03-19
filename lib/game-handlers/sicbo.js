import { kv } from "@vercel/kv";
import { getSession } from "../session-store.js";
import { ethers } from "ethers";
import { getRoundInfo, hashInt } from "../auto-round.js";
import { assertVipBetLimit, buildVipStatus } from "../vip.js";
import { recordGameHistory } from "../game-history.js";
import { applySettlementBuffs, persistSettlementBuffProfile } from "../game-buffs.js";
import { settlementService } from "../settlement-service.js";
import { recordTotalBet } from "../total-bet.js";

const TX_SOURCE = "sicbo";

function rollPlayerDice(roundId) {
    return [
        (hashInt(`sicbo:${roundId}:1`) % 6) + 1,
        (hashInt(`sicbo:${roundId}:2`) % 6) + 1,
        (hashInt(`sicbo:${roundId}:3`) % 6) + 1
    ];
}

function rollBankerDice(roundId) {
    return [
        (hashInt(`sicbo:banker:${roundId}:1`) % 6) + 1,
        (hashInt(`sicbo:banker:${roundId}:2`) % 6) + 1,
        (hashInt(`sicbo:banker:${roundId}:3`) % 6) + 1
    ];
}

function compareDiceTotals(playerDice, bankerDice) {
    const playerTotal = playerDice[0] + playerDice[1] + playerDice[2];
    const bankerTotal = bankerDice[0] + bankerDice[1] + bankerDice[2];
    if (playerTotal > bankerTotal) return "player";
    if (playerTotal < bankerTotal) return "banker";
    return "tie";
}

function evaluateBet(playerDice, bankerDice, betType) {
    const winner = compareDiceTotals(playerDice, bankerDice);
    if (betType === "player") return winner === "player" ? 1.1 : 0;
    if (betType === "banker") return winner === "banker" ? 1.1 : 0;
    if (betType === "tie") return winner === "tie" ? 8 : 0;
    return 0;
}

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

    const { address, amount, sessionId, betType, betValue } = req.body || {};
    if (!address || !amount || !sessionId || !betType) {
        return res.status(400).json({ error: "缺少必要參數" });
    }

    const allowedBetTypes = new Set([
        "player",
        "banker",
        "tie"
    ]);
    if (!allowedBetTypes.has(betType)) {
        return res.status(400).json({ error: "不支援的下注類型" });
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
        const userBalance = await settlementService.contract.balanceOf(address);
        if (userBalance < betWei) {
            return res.status(400).json({ error: "餘額不足！請先充值再試" });
        }

        const round = getRoundInfo("sicbo");
        if (!round.isBettingOpen) {
            return res.status(409).json({
                error: "本局開獎中，暫停下注，請等下一局",
                serverNowTs: Date.now(),
                roundId: round.roundId,
                closesAt: round.closesAt,
                bettingClosesAt: round.bettingClosesAt
            });
        }

        const playerDice = rollPlayerDice(round.roundId);
        const bankerDice = rollBankerDice(round.roundId);
        const playerTotal = playerDice[0] + playerDice[1] + playerDice[2];
        const bankerTotal = bankerDice[0] + bankerDice[1] + bankerDice[2];
        const winner = compareDiceTotals(playerDice, bankerDice);
        const multiplier = evaluateBet(playerDice, bankerDice, betType);

        const totalBetRaw = await recordTotalBet(address, parseFloat(amount));
        const totalBet = parseFloat(totalBetRaw).toFixed(2);
        const vipStatus = buildVipStatus(parseFloat(totalBet));

        let payoutWei = 0n;
        let netWei = -betWei;
        if (multiplier > 0) {
            const payoutBigInt = BigInt(Math.floor((multiplier + 1) * 100));
            payoutWei = (betWei * payoutBigInt) / 100n;
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
                meta: { roundId: round.roundId, betType, betValue }
            });

            if (buffAdjusted.changed) {
                await persistSettlementBuffProfile(buffAdjusted.profile);
            }

            const txHash = results.payoutTxHash || results.betTxHash;

            await recordGameHistory({
                address,
                game: "sicbo",
                gameLabel: "骰寶",
                outcome: multiplier > 0 ? "win" : "lose",
                outcomeLabel: multiplier > 0 ? "中獎" : "未中",
                betWei,
                payoutWei,
                netWei,
                multiplier: multiplier > 0 ? multiplier : 0,
                roundId: String(round.roundId),
                txHash,
                details: `${betType} / 閒家 ${playerDice.join("-")}(${playerTotal}) vs 莊家 ${bankerDice.join("-")}(${bankerTotal}) => ${winner}`,
                decimals
            });

            return res.status(200).json({
                status: "success",
                serverNowTs: Date.now(),
                playerDice,
                bankerDice,
                playerTotal,
                bankerTotal,
                winner,
                multiplier,
                betType,
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
