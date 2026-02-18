// api/get-balance.js
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "./config.js";

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const { address } = req.body;
        if (!address) return res.status(400).json({ error: "缺少地址" });

        // 1. 強制正規化地址 (處理大小寫問題)
        const cleanAddress = ethers.getAddress(address.toLowerCase());
        const cleanContract = ethers.getAddress(CONTRACT_ADDRESS.toLowerCase());

        // 2. 建立連線 (使用公共節點)
        const provider = new ethers.JsonRpcProvider(RPC_URL);

        // 3. 定義查詢餘額所需的 ABI
        const abi = ["function balanceOf(address owner) view returns (uint256)"];
        const contract = new ethers.Contract(cleanContract, abi, provider);

        // 4. 呼叫合約取得原始 BigInt 餘額
        const balance = await contract.balanceOf(cleanAddress);

        // 5. 格式化輸出 (考慮 18 位小數)
        // 使用 formatUnits 將 10000100000000000000000000 轉為 10000100
        const formattedBalance = ethers.formatUnits(balance, 18);

        console.log(`查詢地址: ${cleanAddress}, 餘額: ${formattedBalance}`);

        return res.status(200).json({
            success: true,
            balance: formattedBalance
        });

    } catch (error) {
        console.error("Get Balance Error:", error);
        return res.status(500).json({
            success: false,
            error: "無法從區塊鏈取得數據",
            details: error.message
        });
    }
}