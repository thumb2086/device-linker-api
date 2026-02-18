import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "./config.js";

// 1. 核心工具：將 Android 的 DER 簽名解析為 r 和 s
function parseDERSignature(signatureBase64) {
    const sigBuffer = Buffer.from(signatureBase64, 'base64');
    let offset = 0;
    if (sigBuffer[offset++] !== 0x30) throw new Error("Invalid DER prefix");
    offset++; // Skip total length
    const extractInteger = () => {
        if (sigBuffer[offset++] !== 0x02) throw new Error("Expected Integer mark");
        let len = sigBuffer[offset++];
        let val = sigBuffer.slice(offset, offset + len);
        offset += len;
        // 移除 DER 可能存在的 00 前綴（為了處理正負號）
        if (val.length > 32 && val[0] === 0x00) val = val.slice(1);
        return '0x' + Buffer.from(val).toString('hex').padStart(64, '0');
    };
    return { r: extractInteger(), s: extractInteger() };
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { from, to, amount, signature } = req.body;

    try {
        // --- A. 數據清洗 ---
        const cleanFrom = from.trim().toLowerCase();
        const cleanTo = to.trim().toLowerCase();
        const cleanAmount = amount.toString().trim().replace(/\.0$/, "");

        // --- B. 構建「單次哈希」的 Digest ---
        // 注意：Android 的 SHA256withECDSA 內部已經做了一次 SHA256
        // 所以我們後端產生的這份 digest 就是硬體簽署的對象
        const message = `transfer:${cleanTo}:${cleanAmount}`;
        const digest = ethers.sha256(ethers.toUtf8Bytes(message));

        // --- C. 解析簽名與恢復地址 ---
        const { r, s } = parseDERSignature(signature);

        let recoveredAddress = "";
        // 窮舉 v (以太坊恢復 ID)，Android 簽名對應的通常是 27 或 28 (或 0, 1)
        for (let v of [27, 28, 0, 1]) {
            try {
                const addr = ethers.recoverAddress(digest, { r, s, v });
                if (addr.toLowerCase() === cleanFrom) {
                    recoveredAddress = addr;
                    break;
                }
            } catch (e) { continue; }
        }

        if (!recoveredAddress) {
            return res.status(200).json({
                success: false,
                error: "簽名驗證失敗：地址不匹配",
                debug: {
                    messageUsed: message,
                    digestGenerated: digest,
                    expectedFrom: cleanFrom
                }
            });
        }

        // --- D. 驗證通過，發送交易 ---
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        let adminKey = process.env.ADMIN_PRIVATE_KEY;
        if (!adminKey.startsWith('0x')) adminKey = '0x' + adminKey;
        const adminWallet = new ethers.Wallet(adminKey, provider);

        const contract = new ethers.Contract(CONTRACT_ADDRESS, [
            "function adminTransfer(address from, address to, uint256 amount) public"
        ], adminWallet);

        const tx = await contract.adminTransfer(
            ethers.getAddress(cleanFrom),
            ethers.getAddress(cleanTo),
            ethers.parseUnits(cleanAmount, 18),
            { gasLimit: 200000 }
        );

        return res.status(200).json({ success: true, txHash: tx.hash });

    } catch (error) {
        console.error("Transfer error:", error);
        return res.status(200).json({ success: false, error: error.message });
    }
}