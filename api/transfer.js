import { ethers } from "ethers";
import { secp256k1 } from '@noble/secp256k1';
import { sha256 } from '@noble/hashes/sha256';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    // 接收參數，增加 pubkey
    const { from, to, amount, signature, pubkey } = req.body;

    try {
        if (!pubkey) throw new Error("缺少公鑰參數");

        const cleanFrom = from.trim().toLowerCase();
        const cleanTo = to.toLowerCase().trim();
        const cleanAmount = amount.toString().trim().replace(/\.0$/, "");
        const message = `transfer:${cleanTo}:${cleanAmount}`;

        // 1. 準備哈希數據 (SHA-256)
        const messageBytes = ethers.toUtf8Bytes(message);
        const msgHash = sha256(messageBytes); // 得到 Uint8Array

        // 2. 準備簽名與公鑰
        const sigDER = Buffer.from(signature, 'base64');
        const pubKeyBuffer = Buffer.from(pubkey, 'base64');

        // 3. 使用 @noble/secp256k1 驗證簽名 (繞過 v 值)
        let isValid = false;
        try {
            isValid = secp256k1.verify(sigDER, msgHash, pubKeyBuffer);
        } catch (e) {
            console.error("ECDSA Verify Error:", e);
        }

        if (!isValid) {
            return res.status(200).json({
                success: false,
                error: "硬體簽名驗證失敗 (ECDSA Verify Failed)",
                debug: { message, hash: ethers.hexlify(msgHash) }
            });
        }

        // 4. 從公鑰計算以太坊地址
        // ethers.computeAddress 支援壓縮 (33 bytes) 或非壓縮 (65 bytes) 公鑰
        const pubKeyHex = '0x' + pubKeyBuffer.toString('hex');
        const recoveredAddr = ethers.computeAddress(pubKeyHex).toLowerCase();

        if (recoveredAddr !== cleanFrom) {
            return res.status(200).json({
                success: false,
                error: "公鑰對應地址不匹配",
                debug: { recovered: recoveredAddr, expected: cleanFrom }
            });
        }

        // --- 5. 驗證全數通過，執行轉帳 ---
        const provider = new ethers.JsonRpcProvider("https://ethereum-sepolia-rpc.publicnode.com");
        const wallet = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY, provider);
        const contract = new ethers.Contract("0x789c566675204487D43076935C19356860fC62A4", [
            "function adminTransfer(address from, address to, uint256 amount) public"
        ], wallet);

        const tx = await contract.adminTransfer(
            ethers.getAddress(cleanFrom),
            ethers.getAddress(cleanTo),
            ethers.parseUnits(cleanAmount, 18),
            { gasLimit: 250000 }
        );

        return res.status(200).json({
            success: true,
            txHash: tx.hash,
            mode: "PublicKey_Verification"
        });

    } catch (error) {
        console.error("Critical Error:", error);
        return res.status(200).json({ success: false, error: error.message });
    }
}