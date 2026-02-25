import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "../lib/config.js";

export default async function handler(req, res) {
    // 允許跨域
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const { address } = req.body;
        if (!address) return res.status(400).json({ error: "缺少地址" });

        const provider = new ethers.JsonRpcProvider(RPC_URL);

        // 定義 ABI：我們要查餘額，也要查精度
        const abi = [
            "function balanceOf(address owner) view returns (uint256)",
            "function decimals() view returns (uint8)"
        ];

        const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, provider);

        // 1. 同時查詢「餘額」跟「精度」
        // 如果合約沒寫 decimals 函數，我們 catch 錯誤並假設它是 18 (但在你的情況應該會回傳 6)
        let decimals = 18n;
        let balanceRaw = 0n;

        try {
            // 平行執行，速度更快
            const [bal, dec] = await Promise.all([
                contract.balanceOf(address),
                contract.decimals()
            ]);
            balanceRaw = bal;
            decimals = dec;
        } catch (e) {
            console.log("讀取精度失敗，嘗試僅讀取餘額...");
            balanceRaw = await contract.balanceOf(address);
        }

        // 2. 進行數學轉換
        // formatUnits 會根據 decimals 自動除以 10 的 N 次方
        // 如果 decimals 是 6，它就會除以 1,000,000
        const formattedBalance = ethers.formatUnits(balanceRaw, decimals);

        console.log(`查詢地址: ${address}`);
        console.log(`原始數據: ${balanceRaw} (這就是你看到很多 0 的那個數字)`);
        console.log(`合約精度: ${decimals} (應該要是 6)`);
        console.log(`修正後餘額: ${formattedBalance}`);

        return res.status(200).json({
            success: true,
            balance: formattedBalance,
            decimals: decimals.toString() // 順便回傳精度方便除錯
        });

    } catch (error) {
        console.error("Get Balance Error:", error);
        return res.status(500).json({
            success: false,
            error: "無法讀取餘額",
            details: error.message
        });
    }
}