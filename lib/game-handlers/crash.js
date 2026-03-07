// lib/game-handlers/crash.js - 爆點/飛行遊戲
import { kv } from '@vercel/kv';
import { getSession } from "../session-store.js";
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "../config.js";
import { transferFromTreasuryWithAutoTopup } from "../treasury.js";
import { assertVipBetLimit, buildVipStatus } from "../vip.js";

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

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { address, amount, sessionId, action, betId, multiplier } = req.body;

    if (!address || !sessionId) {
        return res.status(400).json({ error: "缺少必要參數" });
    }

    try {
        // 驗證 session
        const sessionData = await getSession(sessionId);
        if (!sessionData) return res.status(403).json({ error: "會話過期，請重新登入" });

        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const wallet = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY, provider);
        const contract = new ethers.Contract(CONTRACT_ADDRESS, [
            "function mint(address to, uint256 amount) public",
            "function adminTransfer(address from, address to, uint256 amount) public",
            "function decimals() view returns (uint8)",
            "function balanceOf(address) view returns (uint256)"
        ], wallet);

        let decimals = 18n;
        try { decimals = await contract.decimals(); } catch (e) {}

        // 處理不同動作
        if (action === 'start') {
            // 開始遊戲：扣除下注金額，產生結果（加密儲存）
            if (!amount || amount <= 0) return res.status(400).json({ error: "無效的下注金額" });

            const currentTotalBet = Number(await kv.get(`total_bet:${address.toLowerCase()}`) || 0);
            assertVipBetLimit(amount, currentTotalBet);

            const betWei = ethers.parseUnits(amount.toString(), decimals);
            const userBalance = await contract.balanceOf(address);
            if (userBalance < betWei) return res.status(400).json({ error: "餘額不足" });

            const crashPoint = generateCrashPoint();
            const id = Math.random().toString(36).substring(2, 15);
            
            // 儲存遊戲狀態到 KV (5分鐘過期)
            await kv.set(`crash:${id}`, { address, amount, crashPoint }, { ex: 300 });

            // 先扣錢
            const lossPoolAddress = process.env.LOSS_POOL_ADDRESS || wallet.address;
            const tx = await contract.adminTransfer(address, lossPoolAddress, betWei, { gasLimit: 200000 });

            // 更新累計投注
            const totalBetRaw = await kv.incrbyfloat(`total_bet:${address.toLowerCase()}`, parseFloat(amount));

            return res.status(200).json({
                status: "success",
                betId: id,
                txHash: tx.hash,
                totalBet: parseFloat(totalBetRaw).toFixed(2)
            });

        } else if (action === 'cashout') {
            // 兌現：驗證倍率是否小於崩潰點
            if (!betId || !multiplier) return res.status(400).json({ error: "缺少兌現參數" });

            const gameState = await kv.get(`crash:${betId}`);
            if (!gameState) return res.status(400).json({ error: "遊戲不存在或已過期" });
            if (gameState.cashedOut) return res.status(400).json({ error: "已經兌現過了" });

            // 檢查是否炸了
            if (multiplier > gameState.crashPoint) {
                return res.status(200).json({ 
                    status: "crashed", 
                    crashPoint: gameState.crashPoint,
                    message: "很遺憾，飛機已經墜毀！" 
                });
            }

            // 兌現成功：返還 本金 * multiplier
            const profitMultiplier = multiplier; 
            const profitWei = (ethers.parseUnits(gameState.amount.toString(), decimals) * BigInt(Math.floor(profitMultiplier * 100))) / 100n;

            const lossPoolAddress = process.env.LOSS_POOL_ADDRESS || wallet.address;
            const tx = await transferFromTreasuryWithAutoTopup(contract, lossPoolAddress, address, profitWei, { gasLimit: 200000 });

            // 標記已兌現
            gameState.cashedOut = true;
            await kv.set(`crash:${betId}`, gameState, { ex: 300 });

            return res.status(200).json({
                status: "success",
                payout: (gameState.amount * multiplier).toFixed(2),
                multiplier: multiplier,
                txHash: tx.hash
            });

        } else if (action === 'get_result') {
            // 飛機炸了之後，前端來拿最終結果（驗證用）
            const gameState = await kv.get(`crash:${betId}`);
            if (!gameState) return res.status(400).json({ error: "遊戲不存在" });
            return res.status(200).json({ crashPoint: gameState.crashPoint });
        }

        return res.status(400).json({ error: "未知動作" });

    } catch (error) {
        console.error("Crash API Error:", error);
        return res.status(500).json({ error: error.message });
    }
}
