import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "./config.js";

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const { address } = req.body;
        if (!address) return res.status(400).json({ error: "缺少地址" });

        // 建立連線
        const provider = new ethers.JsonRpcProvider(RPC_URL);

        // 定義查詢餘額所需的最小 ABI
        const abi = ["function balanceOf(address owner) view returns (uint256)"];
        const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, provider);

        // 呼叫合約
        const balance = await contract.balanceOf(address);

        // 將 BigInt 轉為可讀的人類格式 (考慮 18 位小數)
        const formattedBalance = ethers.formatUnits(balance, 18);

        return res.status(200).json({
            success: true,
            balance: formattedBalance
        });
    } catch (error) {
        console.error("Get Balance Error:", error);
        return res.status(500).json({
            success: false,
            error: "無法從區塊鏈取得數據，請檢查 RPC_URL 或合約地址",
            details: error.message
        });
    }
}