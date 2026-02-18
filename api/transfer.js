import { ethers } from "ethers";

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { from, to, amount, signature, publicKey } = req.body;

    try {
        if (!publicKey) throw new Error("缺少公鑰參數");

        const cleanFrom = from.trim().toLowerCase();
        const cleanTo = to.toLowerCase().trim();
        const cleanAmount = amount.toString().trim().replace(/\.0$/, "");
        const message = `transfer:${cleanTo}:${cleanAmount}`;

        // 1. 計算 SHA-256 哈希 (對齊 Android SHA256withECDSA)
        const sha256Digest = ethers.sha256(ethers.toUtf8Bytes(message));

        // 2. 準備公鑰與簽名
        const pubKeyHex = '0x' + Buffer.from(publicKey, 'base64').toString('hex');
        const sigBase64 = signature; // 原始簽名 (Base64)

        // 3. 驗證地址一致性 (這步最關鍵，確保公鑰是使用者的)
        const derivedAddrFromPub = ethers.computeAddress(pubKeyHex).toLowerCase();
        if (derivedAddrFromPub !== cleanFrom) {
            throw new Error("公鑰地址不匹配");
        }

        // 4. 使用 ethers 內建的 SigningKey 驗證簽名 (繞過 v 值)
        // 注意：ethers 驗證 DER 格式簽名需要先恢復地址來比對
        let isValid = false;
        const sigBuffer = Buffer.from(sigBase64, 'base64');

        // 暴力窮舉 v 來檢查簽名是否有效 (利用公鑰作為基準)
        for (let v of [27, 28, 0, 1]) {
            try {
                // 從簽名中嘗試還原地址
                const recovered = ethers.recoverAddress(sha256Digest, {
                    r: '0x' + sigBuffer.slice(4, 36).toString('hex'), // 簡化 DER 提取邏輯
                    s: '0x' + sigBuffer.slice(38, 70).toString('hex'),
                    v: v
                });
                if (recovered.toLowerCase() === cleanFrom) {
                    isValid = true;
                    break;
                }
            } catch (e) { }
        }

        if (!isValid) {
            return res.status(200).json({
                success: false,
                error: "簽名驗證失敗 (ECDSA Mismatch)",
                debug: { digest: sha256Digest }
            });
        }

        // 5. 執行合約轉帳
        const provider = new ethers.JsonRpcProvider("https://ethereum-sepolia-rpc.publicnode.com");
        const adminKey = process.env.ADMIN_PRIVATE_KEY;
        const wallet = new ethers.Wallet(adminKey, provider);
        const contract = new ethers.Contract("0x789c566675204487D43076935C19356860fC62A4", [
            "function adminTransfer(address from, address to, uint256 amount) public"
        ], wallet);

        const tx = await contract.adminTransfer(
            ethers.getAddress(cleanFrom),
            ethers.getAddress(cleanTo),
            ethers.parseUnits(cleanAmount, 18),
            { gasLimit: 250000 }
        );

        return res.status(200).json({ success: true, txHash: tx.hash });

    } catch (error) {
        return res.status(200).json({ success: false, error: error.message });
    }
}