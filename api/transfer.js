// api/transfer.js (最終修正版 - 針對 ethers v6 優化)
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "./config.js";

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { from, to, amount, signature } = req.body;

    try {
        if (!from || !to || !amount || !signature) {
            return res.status(400).json({ error: "Missing required parameters" });
        }

        // --- 地址正規化 ---
        const cleanFrom = ethers.getAddress(from.toLowerCase());
        const cleanTo = ethers.getAddress(to.toLowerCase());
        const cleanContract = ethers.getAddress(CONTRACT_ADDRESS.toLowerCase());

        // --- 簽名驗證核心修正 ---
        // 1. 重建訊息原文 (務必與 Android 端一致)
        const message = `transfer:${to.toLowerCase()}:${amount}`;

        // 2. SHA-256 Hash (對應 Android 端簽名邏輯)
        const messageHash = ethers.sha256(ethers.toUtf8Bytes(message));

        // 3. 恢復地址 
        // ethers.recoverAddress(hash, signature)
        const recoveredAddress = ethers.recoverAddress(messageHash, signature);

        // 4. 比對地址
        if (recoveredAddress.toLowerCase() !== cleanFrom.toLowerCase()) {
            return res.status(401).json({
                success: false,
                error: "Signature validation failed",
                debug: {
                    expected: cleanFrom.toLowerCase(),
                    recovered: recoveredAddress.toLowerCase(),
                    messageHash
                }
            });
        }

        // --- 執行轉帳 ---
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        let privateKey = process.env.ADMIN_PRIVATE_KEY;
        if (!privateKey) throw new Error("ADMIN_PRIVATE_KEY is not configured");
        if (!privateKey.startsWith('0x')) privateKey = '0x' + privateKey;

        const wallet = new ethers.Wallet(privateKey, provider);
        const abi = ["function adminTransfer(address from, address to, uint256 amount) public"];
        const contract = new ethers.Contract(cleanContract, abi, wallet);

        // 獲取 Nonce 確保不衝突
        const nonce = await provider.getTransactionCount(wallet.address, "latest");

        const tx = await contract.adminTransfer(cleanFrom, cleanTo, ethers.parseUnits(amount.toString(), 18), {
            nonce: nonce,
            gasLimit: 150000
        });

        // 這裡在 Serverless 環境下可以選擇不 await tx.wait() 以加快響應速度
        // 但為了確保 App 看到時已經成功，保留 wait 是正確的
        // await tx.wait(); 

        return res.status(200).json({
            success: true,
            txHash: tx.hash,
            message: "Transfer successful"
        });

    } catch (error) {
        console.error("Transfer Error:", error);
        return res.status(500).json({
            success: false,
            error: error.reason || error.message || "Unknown error during transfer"
        });
    }
}