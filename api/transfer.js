import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "./config.js";

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { from, to, amount, signature } = req.body;

    // 1. 基本參數檢查
    if (!from || !to || !amount || !signature) {
        return res.status(400).json({ success: false, error: "參數缺失 (from, to, amount, signature)" });
    }

    try {
        // 2. 驗證簽名 (核心安全邏輯)
        // 約定的訊息格式: "transfer:接收地址:金額"
        const message = `transfer:${to}:${amount}`;

        // 使用 ethers 恢復簽署者地址
        const recoveredAddress = ethers.verifyMessage(message, signature);

        // 檢查恢復的地址是否與發送者地址一致
        if (recoveredAddress.toLowerCase() !== from.toLowerCase()) {
            return res.status(401).json({ success: false, error: "簽名驗證失敗，拒絕操作" });
        }

        // 3. 初始化 Provider 與管理員錢包 (作為 Relayer 付 Gas)
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        let privateKey = process.env.ADMIN_PRIVATE_KEY;
        if (!privateKey) throw new Error("ADMIN_PRIVATE_KEY not set");
        if (!privateKey.startsWith('0x')) privateKey = '0x' + privateKey;
        const wallet = new ethers.Wallet(privateKey, provider);

        // 4. 定義合約 (使用 transfer，因為是管理員代為分發或轉帳)
        // 注意：若要從 from 扣幣，from 需先 approve 給管理員，或是合約支援 permit
        // 這裡採用最直接的邏輯：管理員根據驗證過的指令從其國庫撥款給 to
        const abi = ["function transfer(address to, uint256 amount) public returns (bool)"];
        const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, wallet);

        const nonce = await provider.getTransactionCount(wallet.address, "latest");
        const parsedAmount = ethers.parseUnits(amount.toString(), 18);

        // 5. 執行交易
        const tx = await contract.transfer(to, parsedAmount, {
            nonce: nonce,
            gasLimit: 100000
        });

        return res.status(200).json({
            success: true,
            txHash: tx.hash,
            message: "簽名驗證成功，子熙幣已發送"
        });

    } catch (error) {
        console.error("Meta-transfer Error:", error);
        return res.status(500).json({
            success: false,
            message: error.reason || error.message
        });
    }
} import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "./config.js";

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { from, to, amount, signature } = req.body;

    // 1. 基本參數檢查
    if (!from || !to || !amount || !signature) {
        return res.status(400).json({ success: false, error: "參數缺失 (from, to, amount, signature)" });
    }

    try {
        // 2. 驗證簽名 (核心安全邏輯)
        // 約定的訊息格式: "transfer:接收地址:金額"
        const message = `transfer:${to}:${amount}`;

        // 使用 ethers 恢復簽署者地址
        const recoveredAddress = ethers.verifyMessage(message, signature);

        // 檢查恢復的地址是否與發送者地址一致
        if (recoveredAddress.toLowerCase() !== from.toLowerCase()) {
            return res.status(401).json({ success: false, error: "簽名驗證失敗，拒絕操作" });
        }

        // 3. 初始化 Provider 與管理員錢包 (作為 Relayer 付 Gas)
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        let privateKey = process.env.ADMIN_PRIVATE_KEY;
        if (!privateKey) throw new Error("ADMIN_PRIVATE_KEY not set");
        if (!privateKey.startsWith('0x')) privateKey = '0x' + privateKey;
        const wallet = new ethers.Wallet(privateKey, provider);

        // 4. 定義合約 (使用 transfer，因為是管理員代為分發或轉帳)
        // 注意：若要從 from 扣幣，from 需先 approve 給管理員，或是合約支援 permit
        // 這裡採用最直接的邏輯：管理員根據驗證過的指令從其國庫撥款給 to
        const abi = ["function transfer(address to, uint256 amount) public returns (bool)"];
        const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, wallet);

        const nonce = await provider.getTransactionCount(wallet.address, "latest");
        const parsedAmount = ethers.parseUnits(amount.toString(), 18);

        // 5. 執行交易
        const tx = await contract.transfer(to, parsedAmount, {
            nonce: nonce,
            gasLimit: 100000
        });

        return res.status(200).json({
            success: true,
            txHash: tx.hash,
            message: "簽名驗證成功，子熙幣已發送"
        });

    } catch (error) {
        console.error("Meta-transfer Error:", error);
        return res.status(500).json({
            success: false,
            message: error.reason || error.message
        });
    }
}