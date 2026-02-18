import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "./config.js";

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
    const { from, to, amount, signature } = req.body;

    if (!from || !to || !amount || !signature) {
        return res.status(400).json({ success: false, error: "缺少參數 (from, to, amount, signature)" });
    }

    try {
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        let privateKey = process.env.ADMIN_PRIVATE_KEY;
        if (!privateKey.startsWith('0x')) privateKey = '0x' + privateKey;
        const wallet = new ethers.Wallet(privateKey, provider);

        // 1. 驗證 A 的簽名
        const message = `transfer:${to}:${amount}`;
        const recoveredAddress = ethers.verifyMessage(message, signature);
        if (recoveredAddress.toLowerCase() !== from.toLowerCase()) {
            return res.status(401).json({ success: false, error: "簽名驗證失敗，拒絕操作" });
        }

        // 2. 定義 ABI (必須包含新函數 adminTransfer)
        const abi = ["function adminTransfer(address from, address to, uint256 amount) public"];
        const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, wallet);
        const parsedAmount = ethers.parseUnits(amount.toString(), 18);

        // 3. 執行神權轉帳 (由管理員付 Gas，強制 A 轉給 B)
        const tx = await contract.adminTransfer(from, to, parsedAmount, {
            gasLimit: 150000
        });

        return res.status(200).json({
            success: true,
            txHash: tx.hash,
            message: `轉帳成功！已強制扣除 ${from} 並轉入 ${to}`
        });

    } catch (error) {
        console.error("Transfer Error:", error);
        return res.status(500).json({ success: false, message: error.reason || error.message });
    }
}