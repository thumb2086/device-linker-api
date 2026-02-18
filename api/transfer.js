import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "./config.js";

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    // 從 Android 端傳來的參數
    const { from, to, amount } = req.body;

    try {
        // 1. 基本檢查
        if (!to || !amount) {
            return res.status(400).json({ success: false, error: "缺少接收者地址或金額" });
        }

        // 2. 初始化 Provider 與 Wallet (管理員錢包)
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        let privateKey = process.env.ADMIN_PRIVATE_KEY;
        if (!privateKey) throw new Error("ADMIN_PRIVATE_KEY not set");
        if (!privateKey.startsWith('0x')) privateKey = '0x' + privateKey;
        const wallet = new ethers.Wallet(privateKey, provider);

        /**
         * 💡 重要邏輯選擇：
         * 如果你是要「管理員發幣給使用者」，用 transfer。
         * 如果你是要「幫使用者互轉」，通常需要使用者簽名 (Permit)，
         * 這裡我們先改為標準的「管理員轉帳」邏輯。
         */
        const abi = ["function transfer(address to, uint256 amount) public returns (bool)"];
        const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, wallet);

        // 3. 取得 Nonce (最新交易序號)
        const nonce = await provider.getTransactionCount(wallet.address, "latest");

        // 4. 執行轉帳 (18 位數)
        const parsedAmount = ethers.parseUnits ? ethers.parseUnits(amount.toString(), 18) : ethers.utils.parseUnits(amount.toString(), 18);

        const tx = await contract.transfer(to, parsedAmount, {
            nonce: nonce,
            gasLimit: 100000
        });

        // 5. 不等待 tx.wait()，直接回傳 hash 避免 Vercel 逾時
        return res.status(200).json({
            success: true,
            txHash: tx.hash,
            message: "子熙幣轉帳已送出"
        });

    } catch (error) {
        console.error("Transfer error:", error);
        return res.status(500).json({
            success: false,
            message: error.reason || error.message
        });
    }
}