import { ethers } from "ethers"; // 確保這行在最頂部，且沒有被註解掉

// 1. 解析 Android KeyStore 產出的 DER 格式簽名為 r, s
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
        // 移除 DER 可能存在的 00 正數補位前綴
        if (val.length > 32 && val[0] === 0x00) val = val.slice(1);
        return Buffer.from(val).toString('hex').padStart(64, '0');
    };

    return {
        r: '0x' + extractInt(),
        s: '0x' + extractInt()
    };
}

export default async function handler(req, res) {
    // 限制僅接受 POST 請求
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { from, to, amount, signature } = req.body;

    try {
        // --- A. 數據清洗 (必須與 Android MainActivity 的字串處理 100% 一致) ---
        const cleanFrom = from.trim().toLowerCase();
        const cleanTo = to.toLowerCase().trim();
        const cleanAmount = amount.toString().trim().replace(/\.0$/, "");

        // 構建與 Android 端相同的原始訊息
        const message = `transfer:${cleanTo}:${cleanAmount}`;

        // --- B. 哈希對齊：使用 SHA-256 (對應 Android 的 SHA256withECDSA) ---
        // Android 硬體在簽名時會自動對原始 messageBytes 做一次 SHA256
        const sha256Digest = ethers.sha256(ethers.toUtf8Bytes(message));

        // --- C. 解析與恢復地址 ---
        const { r, s } = parseDERSignature(signature);
        let recoveredAddress = "";

        // 窮舉 v 值 (Recovery ID)。Android 硬體通常不回傳 v，故需窮舉 27,28 或 0,1
        for (let v of [27, 28, 0, 1]) {
            try {
                const addr = ethers.recoverAddress(sha256Digest, { r, s, v });
                if (addr.toLowerCase() === cleanFrom) {
                    recoveredAddress = addr;
                    break;
                }
            } catch (e) {
                continue;
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

        // --- D. 驗證通過，發起區塊鏈轉帳 ---
        const RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com"; // 或從環境變數讀取
        const CONTRACT_ADDRESS = "0x789c566675204487D43076935C19356860fC62A4"; // 你的 ZHIXI Token 合約

        const provider = new ethers.JsonRpcProvider(RPC_URL);

        // 從 Vercel Environment Variables 獲取管理員私鑰
        let adminKey = process.env.ADMIN_PRIVATE_KEY;
        if (!adminKey.startsWith('0x')) adminKey = '0x' + adminKey;
        const adminWallet = new ethers.Wallet(adminKey, provider);

        const contract = new ethers.Contract(CONTRACT_ADDRESS, [
            "function adminTransfer(address from, address to, uint256 amount) public"
        ], adminWallet);

        // 執行轉帳交易
        const tx = await contract.adminTransfer(
            ethers.getAddress(cleanFrom), // 轉為 Checksum 格式
            ethers.getAddress(cleanTo),
            ethers.parseUnits(cleanAmount, 18),
            { gasLimit: 250000 }
        );

        return res.status(200).json({
            success: true,
            txHash: tx.hash,
            mode: "V3_SHA256withECDSA"
        });

    } catch (error) {
        console.error("Critical Transfer Error:", error);
        return res.status(200).json({
            success: false,
            error: error.message
        });
    }
}