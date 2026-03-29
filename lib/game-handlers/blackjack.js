import { kv } from '@vercel/kv';
import { getSession } from "../session-store.js";
import { ethers } from "ethers";
import { assertVipBetLimit, buildVipStatus } from "../level.js";
import { recordGameHistory } from "../game-history.js";
import { applySettlementBuffs, persistSettlementBuffProfile } from "../game-buffs.js";
import { settlementService } from "../settlement-service.js";
import { recordTotalBet } from "../total-bet.js";

const TX_SOURCE = "blackjack";

const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = [
    { label: "A", value: 11 },
    { label: "2", value: 2 },
    { label: "3", value: 3 },
    { label: "4", value: 4 },
    { label: "5", value: 5 },
    { label: "6", value: 6 },
    { label: "7", value: 7 },
    { label: "8", value: 8 },
    { label: "9", value: 9 },
    { label: "10", value: 10 },
    { label: "J", value: 10 },
    { label: "Q", value: 10 },
    { label: "K", value: 10 }
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

function roundKey(sessionId) {
    return `blackjack_round:${sessionId}`;
}

async function settleRound({ address, round }) {
    const betWei = BigInt(round.betWei);
    const decimals = round.decimals !== undefined ? Number(round.decimals) : 18;
    const playerTotal = calcTotal(round.playerCards);
    const dealerTotal = calcTotal(round.dealerCards);

    let result = {
        isWin: false,
        isPush: false,
        reason: "",
        multiplier: 0
    };

    if (playerTotal > 21) {
        result.reason = "你爆牌";
    } else if (dealerTotal > 21) {
        result.isWin = true;
        result.reason = "莊家爆牌";
        result.multiplier = round.playerCards.length === 2 && playerTotal === 21 ? 1.5 : 1;
    } else if (playerTotal > dealerTotal) {
        result.isWin = true;
        result.reason = "點數較大";
        result.multiplier = round.playerCards.length === 2 && playerTotal === 21 ? 1.5 : 1;
    } else if (playerTotal < dealerTotal) {
        result.reason = "莊家點數較大";
    } else {
        result.isPush = true;
        result.reason = "平手";
    }

    let txHash = round.betTxHash || "";
    let payoutWei = 0n;
    let netWei = -betWei;
    if (result.isPush) {
        payoutWei = betWei;
        netWei = 0n;
    } else if (result.isWin) {
        const payoutBigInt = BigInt(Math.floor((result.multiplier + 1) * 100));
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

    if (payoutWei > 0n) {
        const results = await settlementService.settle({
            userAddress: address,
            betWei: 0n, // Already deducted
            payoutWei,
            source: TX_SOURCE,
            meta: { sessionId: round.sessionId, stage: "payout" }
        });
        txHash = results.payoutTxHash;
    }
    if (buffAdjusted.changed) {
        await persistSettlementBuffProfile(buffAdjusted.profile);
    }

    await recordGameHistory({
        address,
        game: "blackjack",
        gameLabel: "二十一點",
        outcome: result.isPush ? "push" : (result.isWin ? "win" : "lose"),
        outcomeLabel: result.reason,
        betWei,
        payoutWei,
        netWei,
        multiplier: result.isWin ? result.multiplier : 0,
        txHash,
        details: `玩家 ${playerTotal} / 莊家 ${dealerTotal}`,
        decimals
    });

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
        maxBet: round.maxBet,
        txHash
    };
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { address, amount, sessionId, action } = req.body || {};
    if (!address || !sessionId) {
        return res.status(400).json({ error: "缺少必要參數" });
    }

    const normalizedAction = action || "start";
    if (!["start", "hit", "stand"].includes(normalizedAction)) {
        return res.status(400).json({ error: "不支援的操作" });
    }

    try {
        const sessionData = await getSession(sessionId);
        if (!sessionData) return res.status(403).json({ error: "會話過期，請重新登入" });

        if (normalizedAction === "start") {
            if (!amount || Number(amount) <= 0) {
                return res.status(400).json({ error: "請輸入有效押注金額" });
            }

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

            const totalBetRaw = await recordTotalBet(address, parseFloat(amount));
            const totalBet = parseFloat(totalBetRaw).toFixed(2);
            const vipStatus = buildVipStatus(parseFloat(totalBet));

            const results = await settlementService.settle({
                userAddress: address,
                betWei,
                payoutWei: 0n,
                source: TX_SOURCE,
                meta: { sessionId, stage: "start" }
            });

            const playerCards = [drawCard(), drawCard()];
            const dealerCards = [drawCard(), drawCard()];
            const playerTotal = calcTotal(playerCards);
            const dealerTotal = calcTotal(dealerCards);

            const round = {
                sessionId,
                address: address.toLowerCase(),
                amount: parseFloat(amount),
                betWei: betWei.toString(),
                betTxHash: results.betTxHash,
                decimals: Number(decimals),
                playerCards,
                dealerCards,
                totalBet,
                vipLevel: vipStatus.vipLevel,
                maxBet: vipStatus.maxBet,
                startedAt: Date.now()
            };

            // 開局先存，後續 hit/stand 使用
            await kv.set(roundKey(sessionId), round, { ex: 600 });

            // 起手只有莊家黑傑克時才直接結算；玩家黑傑克改為亮牌後由前端停牌結算
            const playerBj = playerCards.length === 2 && playerTotal === 21;
            const dealerBj = dealerCards.length === 2 && dealerTotal === 21;
            if (dealerBj) {
                try {
                    return res.status(200).json(await settleRound({ address, round }));
                } catch (blockchainError) {
                    await recordTotalBet(address, -parseFloat(amount));
                    await kv.del(roundKey(sessionId));
                    return res.status(500).json({
                        error: "區塊鏈交易失敗",
                        details: blockchainError.message
                    });
                }
            }

            return res.status(200).json({
                status: "in_progress",
                playerCards,
                dealerCards: [dealerCards[0], { rank: "?", suit: "?", hidden: true }],
                playerTotal,
                dealerTotal: dealerCards[0].value,
                canHit: !playerBj,
                mustStand: playerBj,
                totalBet,
                vipLevel: vipStatus.vipLevel,
                maxBet: vipStatus.maxBet
            });
        }

        const round = await kv.get(roundKey(sessionId));
        if (!round) {
            return res.status(400).json({ error: "本局不存在或已過期，請重新發牌" });
        }
        if (round.address !== address.toLowerCase()) {
            return res.status(403).json({ error: "你不能操作別人的牌局" });
        }

        if (normalizedAction === "hit") {
            round.playerCards.push(drawCard());
            const playerTotal = calcTotal(round.playerCards);

            if (playerTotal > 21) {
                try {
                    return res.status(200).json(await settleRound({ address, round }));
                } catch (blockchainError) {
                    await recordTotalBet(address, -parseFloat(round.amount));
                    await kv.del(roundKey(sessionId));
                    return res.status(500).json({
                        error: "區塊鏈交易失敗",
                        details: blockchainError.message
                    });
                }
            }

            await kv.set(roundKey(sessionId), round, { ex: 600 });
            return res.status(200).json({
                status: "in_progress",
                playerCards: round.playerCards,
                dealerCards: [round.dealerCards[0], { rank: "?", suit: "?", hidden: true }],
                playerTotal,
                dealerTotal: round.dealerCards[0].value,
                canHit: playerTotal < 21,
                mustStand: playerTotal === 21,
                totalBet: round.totalBet,
                vipLevel: round.vipLevel,
                maxBet: round.maxBet
            });
        }

        // stand
        while (calcTotal(round.dealerCards) < 17) {
            round.dealerCards.push(drawCard());
        }

        try {
            return res.status(200).json(await settleRound({ address, round }));
        } catch (blockchainError) {
            await recordTotalBet(address, -parseFloat(round.amount));
            await kv.del(roundKey(sessionId));
            return res.status(500).json({
                error: "區塊鏈交易失敗",
                details: blockchainError.message
            });
        }
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
