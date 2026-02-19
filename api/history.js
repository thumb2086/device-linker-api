import { ethers } from "ethers";
import { CONTRACT_ADDRESS } from "./config.js";

export default async function handler(req, res) {
    // 1. 設定跨域
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    // 2. 接收參數
    // page: 目前要抓第幾頁 (預設 1)
    // limit: 一頁要抓幾筆 (預設 20，Etherscan 建議不要太大)
    const { address, page = 1, limit = 20 } = req.body;

    if (!address) return res.status(400).json({ error: '缺少地址參數' });

    try {
        const apiKey = process.env.ETHERSCAN_API_KEY || "YourFreeApiKey";

        // Etherscan 參數說明:
        // page = 第幾頁
        // offset = 每頁幾筆 (對應我們的 limit)
        // sort = desc (最新的在前面)
        const url = `https://api-sepolia.etherscan.io/api?module=account&action=tokentx&contractaddress=${CONTRACT_ADDRESS}&address=${address}&page=${page}&offset=${limit}&sort=desc&apikey=${apiKey}`;

        console.log(`Fetching page ${page} with limit ${limit} for ${address}`);

        const response = await fetch(url);
        const data = await response.json();

        // 3. 處理 "無資料" 的情況 (Etherscan 回傳 status 0)
        if (data.status === "0" && data.message === "No transactions found") {
            return res.status(200).json({
                success: true,
                page: parseInt(page),
                limit: parseInt(limit),
                count: 0,
                hasMore: false, // 告訴前端沒有更多資料了
                history: []
            });
        }

        if (data.status !== "1") throw new Error(data.message || "Etherscan Error");

        // 4. 格式化資料
        const history = data.result.map(tx => {
            const isSend = tx.from.toLowerCase() === address.toLowerCase();
            return {
                type: isSend ? "send" : "receive",
                amount: ethers.formatUnits(tx.value, 18),
                counterParty: isSend ? tx.to : tx.from,
                // 這裡保留原始 timestamp 方便前端排序或格式化
                timestamp: parseInt(tx.timeStamp),
                // 也提供格式化好的時間字串
                date: new Date(parseInt(tx.timeStamp) * 1000).toLocaleString('zh-TW', { hour12: false }),
                txHash: tx.hash,
                blockNumber: tx.blockNumber
            };
        });

        // 5. 回傳結果
        return res.status(200).json({
            success: true,
            page: parseInt(page),
            limit: parseInt(limit),
            count: history.length,
            // 如果回傳的筆數 < limit，代表是最後一頁了
            hasMore: history.length === parseInt(limit),
            history: history
        });

    } catch (error) {
        console.error("History Error:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
}