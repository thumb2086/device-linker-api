import { kv } from '@vercel/kv';
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "./config.js";

export default async function handler(req, res) {
    // 1. 設置跨域與禁用快取 (這對手機與 Vercel 通訊至關重要)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

    // 處理瀏覽器 Preflight 請求
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        // 2. 獲取 sessionId (相容 Query 或 Body)
        const sessionId = req.query.sessionId || (req.body && req.body.sessionId);

        // --- GET 請求：網頁端輪詢狀態 ---
        if (req.method === 'GET') {
            if (!sessionId) return res.status(200).json({ status: "pending", error: "Missing sessionId" });

            const data = await kv.get(`session:${sessionId}`);

            if (data) {
                // 如果已經授權，嘗試抓取鏈上數據顯示在網頁
                try {
                    const provider = new ethers.JsonRpcProvider(RPC_URL);
                    const contract = new ethers.Contract(
                        CONTRACT_ADDRESS,
                        ["function balanceOf(address) view returns (uint256)"],
                        provider
                    );

                    // 抓取餘額 (如果抓不到就顯示 0.00)
                    const balanceRaw = await contract.balanceOf(data.address).catch(() => 0n);
                    const balance = ethers.formatUnits(balanceRaw, 18);

                    // 抓取累計押注與 VIP 等級
                    const totalBet = await kv.get(`total_bet:${data.address.toLowerCase()}`) || 0;
                    const vipLevel = totalBet >= 1000 ? "👑 鑽石 VIP" : (totalBet >= 500 ? "🥇 黃金會員" : (totalBet >= 100 ? "🥈 白銀會員" : "普通會員"));

                    return res.status(200).json({
                        status: "authorized",
                        address: data.address,
                        publicKey: data.publicKey,
                        balance: balance,
                        totalBet: parseFloat(totalBet).toFixed(2),
                        vipLevel: vipLevel
                    });
                } catch (blockchainError) {
                    // 區塊鏈節點掛掉時，至少要能登入進入遊戲
                    return res.status(200).json({
                        status: "authorized",
                        ...data,
                        balance: "0.00",
                        vipLevel: "普通會員 (節點忙碌)"
                    });
                }
            }
            return res.status(200).json({ status: "pending" });
        }

        // --- POST 請求：App 端提交授權 ---
        if (req.method === 'POST') {
            const { address, publicKey } = req.body;

            // 嚴格檢查欄位
            if (!sessionId) return res.status(400).json({ success: false, error: "Missing sessionId" });
            if (!address || !publicKey) return res.status(400).json({ success: false, error: "Missing address or publicKey" });

            // 存入 KV 資料庫 (暫存 10 分鐘)
            await kv.set(`session:${sessionId}`, {
                address: address.toLowerCase(),
                publicKey: publicKey
            }, { ex: 600 });

            console.log(`[AUTH SUCCESS] Session: ${sessionId} for ${address}`);

            // 🚀 立刻回傳成功給 App，不要讓手機在那邊轉圈
            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: "Method Not Allowed" });

    } catch (error) {
        console.error("Auth API Critical Error:", error);
        // 就算炸了也要回傳 JSON，防止手機端卡死
        return res.status(500).json({
            success: false,
            error: "伺服器內部錯誤",
            details: error.message
        });
    }
}