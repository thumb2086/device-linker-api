// lib/game-handlers/crash.js - 爆點/飛行遊戲
import { kv } from '@vercel/kv';
import { getSession } from "../session-store.js";
import { ethers } from "ethers";
import { assertVipBetLimit, buildVipStatus } from "../vip.js";
import { recordGameHistory } from "../game-history.js";
import { applySettlementBuffs, persistSettlementBuffProfile } from "../game-buffs.js";
import { settlementService } from "../settlement-service.js";
import { recordTotalBet } from "../total-bet.js";

const TX_SOURCE = "crash";

/**
 * 產生崩潰點 (Provably Fair)
 * Crash Point = 0.99 / random_number
 */
function generateCrashPoint() {
    const rand = Math.random();
    // 1% 機率直接 1.00x (莊家優勢)
    if (rand < 0.01) return 1.00;
    
    const crashPoint = 0.99 / rand;
    return Math.max(1.00, Math.floor(crashPoint * 100) / 100);
}

async function settleCrashLoss({ address, gameState, betId, decimals }) {
    const betWei = BigInt(gameState.betWei || "0");
    const buffAdjusted = await applySettlementBuffs({
        address: gameState.address || address,
        betWei,
        payoutWei: 0n,
        netWei: -betWei,
        decimals,
        scope: "solo",
        persist: false
    });

    let txHash = gameState.startTxHash || "";
    if (buffAdjusted.payoutWei > 0n) {
        const results = await settlementService.settle({
            userAddress: address,
            betWei: 0n, // Bet already deducted
            payoutWei: buffAdjusted.payoutWei,
            source: TX_SOURCE,
            meta: { betId, stage: "loss_buff_payout" }
        });
        txHash = results.payoutTxHash;
    }
    if (buffAdjusted.changed) {
        await persistSettlementBuffProfile(buffAdjusted.profile);
    }

    await recordGameHistory({
        address: gameState.address || address,
        game: "crash",
        gameLabel: "Crash",
        outcome: "lose",
        outcomeLabel: "爆掉",
        betWei,
        payoutWei: buffAdjusted.payoutWei,
        netWei: buffAdjusted.netWei,
        multiplier: Number(gameState.crashPoint),
        roundId: String(betId),
        txHash,
        details: `爆點 ${Number(gameState.crashPoint).toFixed(2)}x`,
        createdAt: gameState.createdAt,
        decimals
    });
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { address, amount, sessionId, action, betId, multiplier, currentMultiplier } = req.body;

    if (!address || !sessionId) {
        return res.status(400).json({ error: "缺少必要參數" });
    }

    try {
        // 驗證 session
        const sessionData = await getSession(sessionId);
        if (!sessionData) return res.status(403).json({ error: "會話過期，請重新登入" });

        const decimals = await settlementService.getDecimals();

        // 處理不同動作
        if (action === 'start') {
            // 開始遊戲：扣除下注金額，產生結果（加密儲存）
            if (!amount || amount <= 0) return res.status(400).json({ error: "無效的下注金額" });

            const currentTotalBet = Number(await kv.get(`total_bet:${address.toLowerCase()}`) || 0);
            assertVipBetLimit(amount, currentTotalBet);

            const betWei = ethers.parseUnits(amount.toString(), decimals);
            const userBalance = await settlementService.contract.balanceOf(address);
            if (userBalance < betWei) return res.status(400).json({ error: "餘額不足" });

            const crashPoint = generateCrashPoint();
            const id = Math.random().toString(36).substring(2, 15);
            const createdAt = new Date().toISOString();

            // 先扣錢
            const results = await settlementService.settle({
                userAddress: address,
                betWei,
                payoutWei: 0n,
                source: TX_SOURCE,
                meta: { betId: id, stage: "start" }
            });

            // 更新累計投注
            const totalBetRaw = await recordTotalBet(address, parseFloat(amount));
            await kv.set(`crash:${id}`, {
                address: String(address || "").toLowerCase(),
                amount,
                betWei: betWei.toString(),
                crashPoint,
                createdAt,
                settled: false,
                startTxHash: results.betTxHash
            }, { ex: 300 });

            return res.status(200).json({
                status: "success",
                betId: id,
                txHash: results.betTxHash,
                totalBet: parseFloat(totalBetRaw).toFixed(2)
            });

        } else if (action === 'cashout') {
            // 兌現：驗證倍率是否小於崩潰點
            if (!betId || !multiplier) return res.status(400).json({ error: "缺少兌現參數" });

            const gameState = await kv.get(`crash:${betId}`);
            if (!gameState) return res.status(400).json({ error: "遊戲不存在或已過期" });
            if (gameState.cashedOut) return res.status(400).json({ error: "已經兌現過了" });
            if (String(gameState.address || "").toLowerCase() !== String(address || "").toLowerCase()) {
                return res.status(403).json({ error: "你不能兌現別人的牌局" });
            }

            // 檢查是否炸了
            if (multiplier > gameState.crashPoint) {
                if (!gameState.settled) {
                    await settleCrashLoss({
                        address,
                        gameState,
                        betId,
                        decimals
                    });
                    gameState.settled = true;
                    await kv.set(`crash:${betId}`, gameState, { ex: 300 });
                }
                return res.status(200).json({ 
                    status: "crashed", 
                    crashPoint: gameState.crashPoint,
                    message: "很遺憾，飛機已經墜毀！" 
                });
            }

            // 兌現成功：返還 本金 * multiplier
            const profitMultiplier = multiplier; 
            const betWei = BigInt(gameState.betWei || "0");
            let payoutWei = (betWei * BigInt(Math.floor(profitMultiplier * 100))) / 100n;
            let netWei = payoutWei - betWei;
            const buffAdjusted = await applySettlementBuffs({
                address: gameState.address || address,
                betWei,
                payoutWei,
                netWei,
                decimals,
                scope: "solo",
                persist: false
            });
            payoutWei = buffAdjusted.payoutWei;
            netWei = buffAdjusted.netWei;

            const results = await settlementService.settle({
                userAddress: address,
                betWei: 0n, // Already deducted
                payoutWei,
                source: TX_SOURCE,
                meta: { betId, stage: "cashout" }
            });

            if (buffAdjusted.changed) {
                await persistSettlementBuffProfile(buffAdjusted.profile);
            }

            await recordGameHistory({
                address: gameState.address || address,
                game: "crash",
                gameLabel: "Crash",
                outcome: "win",
                outcomeLabel: "成功兌現",
                betWei,
                payoutWei,
                netWei,
                multiplier: Number(multiplier),
                roundId: String(betId),
                txHash: results.payoutTxHash,
                details: `爆點 ${Number(gameState.crashPoint).toFixed(2)}x / 兌現 ${Number(multiplier).toFixed(2)}x`,
                createdAt: gameState.createdAt,
                decimals
            });

            // 標記已兌現
            gameState.cashedOut = true;
            gameState.settled = true;
            await kv.set(`crash:${betId}`, gameState, { ex: 300 });

            return res.status(200).json({
                status: "success",
                payout: Number(ethers.formatUnits(payoutWei, decimals)).toFixed(2),
                multiplier: multiplier,
                txHash: results.payoutTxHash
            });

        } else if (action === 'get_result') {
            // 飛機炸了之後，前端來拿最終結果（驗證用）
            const gameState = await kv.get(`crash:${betId}`);
            if (!gameState) return res.status(400).json({ error: "遊戲不存在" });
            if (String(gameState.address || "").toLowerCase() !== String(address || "").toLowerCase()) {
                return res.status(403).json({ error: "你不能查詢別人的牌局" });
            }
            const current = Number(currentMultiplier);
            if (!gameState.settled && Number.isFinite(current) && current >= Number(gameState.crashPoint)) {
                await settleCrashLoss({
                    address,
                    gameState,
                    betId,
                    decimals
                });
                gameState.settled = true;
                await kv.set(`crash:${betId}`, gameState, { ex: 300 });
            }
            return res.status(200).json({ crashPoint: gameState.crashPoint });
        }

        return res.status(400).json({ error: "未知動作" });

    } catch (error) {
        console.error("Crash API Error:", error);
        return res.status(500).json({ error: error.message });
    }
}
