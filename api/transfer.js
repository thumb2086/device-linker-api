// api/transfer.js
import { ethers } from "ethers";
import { verify } from "crypto"; // 引入原生 crypto 模組
import { CONTRACT_ADDRESS, RPC_URL } from "../lib/config.js";

export default async function handler(req, res) {
    // 設置 CORS (如果需要)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // 1. 接收參數 (注意：必須包含 publicKey)
    const { from, to, amount, signature, publicKey } = req.body;

    if (!from || !to || !amount || !signature || !publicKey) {
        return res.status(400).json({ error: '缺少參數: 需要 signature 與 publicKey' });
    }

    try {
        // 2. 格式化參數 (符合新標準)
        const cleanFrom = from.trim().toLowerCase();
        const cleanTo = to.trim().toLowerCase().replace(/^0x/, ''); // 移除 0x
        const cleanAmount = amount.toString().trim().replace(/\.0+$/, ""); // 移除 .0

        // 3. 重建簽名訊息 (無暗號版本)
        // 格式: transfer:{to}:{amount}
        const message = `transfer:${cleanTo}:${cleanAmount}`;

        console.log("---------------- NEW STANDARD VERIFICATION ----------------");
        console.log("Server Message  :", message);
        console.log("Received PubKey :", publicKey.substring(0, 30) + "...");

        // 4. 轉換公鑰格式 (Android Base64 -> PEM)
        // Android 傳來的 publicKey 是純 Base64 字串 (X.509 SPKI)
        const publicKeyPEM = `-----BEGIN PUBLIC KEY-----\n${publicKey}\n-----END PUBLIC KEY-----`;

        // 5. 執行驗證 (使用 crypto 支援 NIST P-256)
        const isVerified = verify(
            "sha256", // 對應 Android 的 SHA256withECDSA
            Buffer.from(message, 'utf-8'),
            {
                key: publicKeyPEM,
                padding: undefined,
            },
            Buffer.from(signature, 'base64')
        );

        if (!isVerified) {
            console.error("❌ Signature Verification Failed");
            return res.status(200).json({
                success: false,
                error: "簽名驗證失敗 (Crypto)",
                debug: {
                    generatedMessage: message,
                    receivedSignature: signature
                }
            });
        }

        console.log("✅ Signature Verified! Executing Transaction...");

        // 6. 區塊鏈互動
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        if (!process.env.ADMIN_PRIVATE_KEY) throw new Error("Server Error: Missing ADMIN_PRIVATE_KEY");

        const wallet = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY, provider);

        const contract = new ethers.Contract(
            ethers.getAddress(CONTRACT_ADDRESS),
            ["function adminTransfer(address from, address to, uint256 amount) public"],
            wallet
        );

        // 這裡我們信任簽名成功代表使用者授權，使用前端傳來的 from 地址
        const tx = await contract.adminTransfer(
            ethers.getAddress(cleanFrom),
            ethers.getAddress("0x" + cleanTo), // 補回 0x 發給合約
            ethers.parseUnits(cleanAmount, 18)
        );

        console.log("Tx Hash:", tx.hash);

        return res.status(200).json({
            success: true,
            txHash: tx.hash
        });

    } catch (error) {
        console.error("Transfer Error:", error);
        return res.status(500).json({
            success: false,
            error: error.message || "伺服器內部錯誤"
        });
    }
}