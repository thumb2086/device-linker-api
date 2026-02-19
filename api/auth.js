import { kv } from '@vercel/kv';
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "./config.js";

export default async function handler(req, res) {
    // 1. 強制處理跨域與快取
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const sessionId = req.query.sessionId || (req.body && req.body.sessionId);

        // --- GET 請求：網頁端輪詢狀態 ---
        if (req.method === 'GET') {
            if (!sessionId) return res.status(200).json({ status: "pending" });

            const sessionData = await kv.get(`session:${sessionId}`);

            if (sessionData) {
                // 🚀 關鍵修正：將區塊鏈查詢包在獨立的 try-catch 中
                let balance = "0.00";
                let totalBet = 0;
                let vipLevel = "普通會員";

                try {
                    const provider = new ethers.JsonRpcProvider(RPC_URL);
                    const contract = new ethers.Contract(CONTRACT_ADDRESS, ["function balanceOf(address) view returns (uint256)"], provider);
                    const balanceRaw = await contract.balanceOf(sessionData.address);
                    balance = ethers.formatUnits(balanceRaw, 18);

                    totalBet = await kv.get(`total_bet:${sessionData.address.toLowerCase()}`) || 0;
                    if (totalBet >= 1000) vipLevel = "👑 鑽石 VIP";
                    else if (totalBet >= 500) vipLevel = "🥇 黃金會員";
                    else if (totalBet >= 100) vipLevel = "🥈 白銀會員";

                } catch (blockchainError) {
                    console.error("無法從鏈上獲取數據，但仍允許登入:", blockchainError.message);
                    // 就算查不到餘額，也要回傳授權成功，讓使用者先進遊戲
                }

                return res.status(200).json({
                    status: "authorized",
                    address: sessionData.address,
                    publicKey: sessionData.publicKey,
                    balance: parseFloat(balance).toLocaleString(undefined, { minimumFractionDigits: 2 }),
                    totalBet: parseFloat(totalBet).toFixed(2),
                    vipLevel
                });
            }
            return res.status(200).json({ status: "pending" });
        }

        // --- POST 請求：App 端提交授權 ---
        if (req.method === 'POST') {
            const { address, publicKey } = req.body;
            if (!sessionId || !address || !publicKey) return res.status(400).json({ success: false, error: "缺少欄位" });

            await kv.set(`session:${sessionId}`, {
                address: address.toLowerCase(),
                publicKey
            }, { ex: 600 });

            return res.status(200).json({ success: true });
        }

    } catch (error) {
        console.error("Auth API 嚴重錯誤:", error);
        return res.status(500).json({ success: false, error: "伺服器內部錯誤", details: error.message });
    }
}