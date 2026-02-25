// api/history.js
import { ethers } from "ethers";
import { CONTRACT_ADDRESS } from "../lib/config.js";

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { address, page = 1, limit = 20 } = req.body;
    if (!address) return res.status(400).json({ error: '缺少地址參數' });

    try {
        // ⚠️ 請確保 API Key 已填寫，或在 Vercel 設定環境變數
        const apiKey = process.env.ETHERSCAN_API_KEY || "你的API_KEY";

        // 🚀 關鍵修正：改用 Etherscan V2 統一入口網址
        const baseUrl = "https://api.etherscan.io/v2/api";
        const chainId = "11155111"; // Sepolia 測試網的 ID

        // V2 必須帶上 chainid 參數
        const url = `${baseUrl}?chainid=${chainId}&module=account&action=tokentx&contractaddress=${CONTRACT_ADDRESS}&address=${address}&page=${page}&offset=${limit}&sort=desc&apikey=${apiKey}`;

        console.log("正在發送 V2 API 請求:", url);

        const response = await fetch(url);
        const data = await response.json();

        // 處理 V2 的錯誤回傳
        if (data.status === "0") {
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
            return res.status(200).json({
                success: false,
                error: `Etherscan V2 錯誤: ${data.message}`,
                details: data.result
            });
        }

        // 格式化資料
        const history = data.result.map(tx => {
            const isSend = tx.from.toLowerCase() === address.toLowerCase();
            return {
                type: isSend ? "send" : "receive",
                amount: ethers.formatUnits(tx.value, 18),
                counterParty: isSend ? tx.to : tx.from,
                timestamp: parseInt(tx.timeStamp),
                date: new Date(parseInt(tx.timeStamp) * 1000).toLocaleString('zh-TW', { hour12: false }),
                txHash: tx.hash
            };
        });

        return res.status(200).json({
            success: true,
            page: parseInt(page),
            limit: parseInt(limit),
            count: history.length,
            hasMore: history.length === parseInt(limit),
            history: history
        });

    } catch (error) {
        console.error("V2 API Error:", error);
        return res.status(200).json({ success: false, error: error.message });
    }
}