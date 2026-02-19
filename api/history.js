import { ethers } from "ethers";
import { CONTRACT_ADDRESS } from "./config.js";

export default async function handler(req, res) {
    // 1. CORS 設定 (Android 連接必備)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    // 2. 接收參數
    const { address, page = 1, limit = 20 } = req.body;

    if (!address) return res.status(400).json({ error: '缺少地址參數' });

    try {
        // 3. 設定 API KEY (修正之前的語法錯誤)
        // 建議在 Vercel 後台設定 ETHERSCAN_API_KEY 環境變數
        // 如果還沒設定，請暫時把你的 Key 貼在下面引號內
        const apiKey = process.env.ETHERSCAN_API_KEY || "你的_ETHERSCAN_API_KEY_貼在這裡";

        // 4. 組合 Etherscan Sepolia API URL
        const url = `https://api-sepolia.etherscan.io/api?module=account&action=tokentx&contractaddress=${CONTRACT_ADDRESS}&address=${address}&page=${page}&offset=${limit}&sort=desc&apikey=${apiKey}`;

        console.log(`查詢紀錄: Page=${page}, Limit=${limit}, Address=${address}`);

        const response = await fetch(url);
        const data = await response.json();

        // 5. 處理 Etherscan 的狀態
        if (data.status === "0") {
            // 如果是 "No transactions found" 代表只是這個地址目前沒有交易紀錄
            if (data.result === "No transactions found") {
                return res.status(200).json({
                    success: true,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    count: 0,
                    hasMore: false,
                    history: []
                });
            }

            // 如果是其他錯誤 (例如 API Key 錯誤會噴 NOTOK)
            return res.status(200).json({
                success: false,
                error: `Etherscan API 回傳錯誤: ${data.message}`,
                details: data.result // 這裡會顯示具體的錯誤原因
            });
        }

        // 6. 格式化回傳資料
        const history = data.result.map(tx => {
            const isSend = tx.from.toLowerCase() === address.toLowerCase();
            return {
                type: isSend ? "send" : "receive",
                amount: ethers.formatUnits(tx.value, 18),
                counterParty: isSend ? tx.to : tx.from,
                timestamp: parseInt(tx.timeStamp),
                // 格式化日期：2026/02/19 12:00:00
                date: new Date(parseInt(tx.timeStamp) * 1000).toLocaleString('zh-TW', { hour12: false }),
                txHash: tx.hash,
                blockNumber: tx.blockNumber
            };
        });

        // 7. 成功回傳
        return res.status(200).json({
            success: true,
            page: parseInt(page),
            limit: parseInt(limit),
            count: history.length,
            // 如果抓到的筆數剛好等於 limit，表示「可能」還有下一頁
            hasMore: history.length === parseInt(limit),
            history: history
        });

    } catch (error) {
        console.error("History API Critical Error:", error);
        return res.status(200).json({
            success: false,
            error: "伺服器內部錯誤",
            details: error.message
        });
    }
}