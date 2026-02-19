import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "./config.js";

export default async function handler(req, res) {
    // 1. 基本設定
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { address } = req.body;

    if (!address) {
        return res.status(400).json({ error: '缺少地址參數 (address)' });
    }

    try {
        const cleanAddress = ethers.getAddress(address.toLowerCase()); // 確保格式正確
        const provider = new ethers.JsonRpcProvider(RPC_URL);

        // 2. 定義 ABI (我們只需要 Transfer 事件)
        // event Transfer(address indexed from, address indexed to, uint256 value);
        const abi = [
            "event Transfer(address indexed from, address indexed to, uint256 value)"
        ];

        const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, provider);

        // 3. 建立過濾器 (Filter)
        // 情況 A: 我發出去的錢 (From = 我)
        const filterSend = contract.filters.Transfer(cleanAddress, null);

        // 情況 B: 我收到的錢 (To = 我)
        const filterReceive = contract.filters.Transfer(null, cleanAddress);

        // 4. 平行查詢區塊鏈日誌 (Query Logs)
        // 注意：公開 RPC 節點可能限制查詢範圍，若失敗可限制 fromBlock
        const [sentLogs, receivedLogs] = await Promise.all([
            contract.queryFilter(filterSend),
            contract.queryFilter(filterReceive)
        ]);

        // 5. 格式化資料的函數
        const formatLog = async (log, type) => {
            const { args, transactionHash, blockNumber } = log;
            // args[0] = from, args[1] = to, args[2] = value

            // 為了效能，這裡暫時不抓取 blockTimestamp (因為需要額外發起 HTTP 請求)
            // 如果需要時間戳，前端可以用 blockNumber 去估算，或是在這裡多做一次 await provider.getBlock(blockNumber)

            return {
                type: type, // "send" 或 "receive"
                txHash: transactionHash,
                from: args[0],
                to: args[1],
                amount: ethers.formatUnits(args[2], 18), // 假設是 18 位小數
                blockNumber: blockNumber,
                url: `https://sepolia.etherscan.io/tx/${transactionHash}`
            };
        };

        // 6. 處理資料並合併
        const historySent = await Promise.all(sentLogs.map(log => formatLog(log, "send")));
        const historyReceived = await Promise.all(receivedLogs.map(log => formatLog(log, "receive")));

        // 合併並按區塊高度排序 (最新的在前面)
        const allHistory = [...historySent, ...historyReceived].sort((a, b) => b.blockNumber - a.blockNumber);

        return res.status(200).json({
            success: true,
            count: allHistory.length,
            history: allHistory
        });

    } catch (error) {
        console.error("Get History Error:", error);
        return res.status(500).json({
            success: false,
            error: "無法取得交易紀錄",
            details: error.message
        });
    }
}