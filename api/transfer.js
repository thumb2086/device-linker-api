// api/transfer.js

// ... parseDERSignature 保持不變 ...

export default async function handler(req, res) {
    const { from, to, amount, signature } = req.body;
    try {
        const cleanFrom = from.trim().toLowerCase();
        const cleanTo = to.toLowerCase().trim();
        const cleanAmount = amount.toString().trim().replace(/\.0$/, "");

        // --- 根治核心：直接使用 SHA256 (對齊 Android 硬體強制行為) ---
        const message = `transfer:${cleanTo}:${cleanAmount}`;
        const sha256Digest = ethers.sha256(ethers.toUtf8Bytes(message));

        const { r, s } = parseDERSignature(signature);
        let recoveredAddress = "";

        // 窮舉 v 值 (0, 1, 27, 28)
        for (let v of [27, 28, 0, 1]) {
            try {
                const addr = ethers.recoverAddress(sha256Digest, { r, s, v });
                if (addr.toLowerCase() === cleanFrom) {
                    recoveredAddress = addr;
                    break;
                }
            } catch (e) { }
        }

        if (!recoveredAddress) {
            // 如果還不行，最後一招：嘗試簽署「原始資料的 Keccak」(以防萬一)
            const keccakDigest = ethers.keccak256(ethers.toUtf8Bytes(message));
            for (let v of [27, 28, 0, 1]) {
                try {
                    const addr = ethers.recoverAddress(keccakDigest, { r, s, v });
                    if (addr.toLowerCase() === cleanFrom) {
                        recoveredAddress = addr;
                        break;
                    }
                } catch (e) { }
            }
        }

        if (!recoveredAddress) {
            throw new Error(`地址不匹配。驗證對象: ${message}`);
        }

        // --- 後續 adminTransfer 邏輯保持不變 ---
        // ...
        return res.status(200).json({ success: true, txHash: tx.hash });

    } catch (error) {
        return res.status(200).json({ success: false, error: error.message });
    }
}