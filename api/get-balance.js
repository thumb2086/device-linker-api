import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "./config.js";

export default async function handler(req, res) {
    // 1. 同時支援 GET (query) 與 POST (body)
    const address = req.method === 'POST' ? req.body.address : req.query.address;

    if (!address || !ethers.isAddress(address)) {
        return res.status(400).json({
            success: false,
            error: "請提供正確的錢包地址"
        });
    }

    try {
        // 2. 初始化 Provider (Sepolia RPC)
        const provider = new ethers.JsonRpcProvider(RPC_URL);

        // 3. 定義標準 ERC-20 的 balanceOf 查詢功能
        const abi = ["function balanceOf(address owner) view returns (uint256)"];
        const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, provider);

        // 4. 查詢餘額
        const balance = await contract.balanceOf(address);

        // 5. 【相容性優化】格式化餘額 (支援 ethers v6 的 formatUnits 與 v5 的 utils.formatUnits)
        const formattedBalance = ethers.formatUnits
            ? ethers.formatUnits(balance, 18)
            : ethers.utils.formatUnits(balance, 18);

        // 6. 回傳結果
        return res.status(200).json({
            success: true,
            symbol: "ZHIXI", // 加入代幣符號方便 Android 端辨識
            address: address,
            balance: formattedBalance
        });

    } catch (error) {
        console.error("Get Balance Error:", error);

        // 針對常見的 RPC 連線問題給予提示
        return res.status(500).json({
            success: false,
            error: "無法從區塊鏈取得數據，請檢查 RPC_URL 或合約地址"
        });
    }
}