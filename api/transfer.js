import { ethers } from "ethers";

/**
 * 1. 解析 Android KeyStore 產出的 DER 格式簽名
 * 確保 r, s 被提取為正確的 32-byte 16進制字串
 */
function parseDERSignature(signatureBase64) {
    const sig = Buffer.from(signatureBase64, 'base64');
    let pos = 0;
    if (sig[pos++] !== 0x30) throw new Error("Invalid DER prefix");
    pos++; // skip total length

    const extractInt = () => {
        if (sig[pos++] !== 0x02) throw new Error("Expected Integer mark");
        let len = sig[pos++];
        let val = sig.slice(pos, pos + len);
        pos += len;
        // 移除 DER 可能存在的 00 正數補位前綴 (Padding)
        if (val.length > 32 && val[0] === 0x00) val = val.slice(1);
        return Buffer.from(val).toString('hex').padStart(64, '0');
    };

    return {
        r: '0x' + extractInt(),
        s: '0x' + extractInt()
    };
}

export default async function handler(req, res) {
    // 僅允許 POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { from, to, amount, signature } = req.body;

    try {
        // --- A. 數據清洗：必須與 Android 端 100% 一致 ---
        const cleanFrom = from.trim().toLowerCase();
        const cleanTo = to.toLowerCase().trim();
        const cleanAmount = amount.toString().trim().replace(/\.0$/, "");

        // 構建原始訊息字串
        const message = `transfer:${cleanTo}:${cleanAmount}`;

        // --- B. 哈希對齊：使用 SHA-256 ---
        // 對應 Android V3 的 SHA256withECDSA 硬體行為
        const sha256Digest = ethers.sha256(ethers.toUtf8Bytes(message));

        // --- C. 解析簽名與強健地址恢復 ---
        const { r, s } = parseDERSignature(signature);
        let recoveredAddress = "";

        // 窮舉 v 值：使用 Signature.from 確保 ethers 內部轉換正確
        // 根據數學驗證，你的 Android 簽名對應 v = 28
        for (let v_val of [27, 28, 0, 1]) {
            try {
                const sigObj = ethers.Signature.from({
                    r: r,
                    s: s,
                    v: v_val
                });
                const addr = ethers.recoverAddress(sha256Digest, sigObj);

                if (addr.toLowerCase() === cleanFrom) {
                    recoveredAddress = addr;
                    console.log(`Bingo! Matched at v = ${v_val}`);
                    break;
                }
            } catch (e) {
                continue; // 嘗試下一個 v 值
            }
        }

        if (!recoveredAddress) {
            return res.status(200).json({
                success: false,
                error: "簽名驗證失敗：地址不匹配",
                debug: {
                    receivedFrom: cleanFrom,
                    generatedMessage: message,
                    sha256Digest: sha256Digest,
                    r: r,
                    s: s
                }
            });
        }

        // --- D. 驗證通過，執行合約轉帳 ---
        // 這些建議放在 Vercel 的 Environment Variables 中
        const RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";
        const CONTRACT_ADDRESS = "0x789c566675204487D43076935C19356860fC62A4";

        const provider = new ethers.JsonRpcProvider(RPC_URL);

        let adminKey = process.env.ADMIN_PRIVATE_KEY;
        if (!adminKey.startsWith('0x')) adminKey = '0x' + adminKey;
        const adminWallet = new ethers.Wallet(adminKey, provider);

        const contract = new ethers.Contract(CONTRACT_ADDRESS, [
            "function adminTransfer(address from, address to, uint256 amount) public"
        ], adminWallet);

        // 發送交易
        const tx = await contract.adminTransfer(
            ethers.getAddress(cleanFrom), // 轉為 Checksum 格式
            ethers.getAddress(cleanTo),
            ethers.parseUnits(cleanAmount, 18),
            { gasLimit: 250000 }
        );

        // 回傳成功結果
        return res.status(200).json({
            success: true,
            txHash: tx.hash,
            mode: "V3_SHA256_STABLE"
        });

    } catch (error) {
        console.error("Critical Transfer Error:", error);
        return res.status(200).json({
            success: false,
            error: error.message
        });
    }
}