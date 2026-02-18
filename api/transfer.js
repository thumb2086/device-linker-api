import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "./config.js";

// 解析 Android DER 簽名格式
function parseDERSignature(signatureBase64) {
    const sigBuffer = Buffer.from(signatureBase64, 'base64');
    let offset = 0;
    if (sigBuffer[offset++] !== 0x30) throw new Error("無效的 DER 前綴");
    offset++; // 跳過總長度
    const extractInteger = () => {
        if (sigBuffer[offset++] !== 0x02) throw new Error("預期為 Integer 標記");
        let len = sigBuffer[offset++];
        let val = sigBuffer.slice(offset, offset + len);
        offset += len;
        if (val.length > 32 && val[0] === 0x00) val = val.slice(1);
        return '0x' + Buffer.from(val).toString('hex').padStart(64, '0');
    };
    return { r: extractInteger(), s: extractInteger() };
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
    const { from, to, amount, signature } = req.body;

    try {
        if (!from || !to || !amount || !signature) throw new Error("缺少必要參數");

        // 1. 同步 Android 的清洗邏輯
        const cleanFrom = from.trim().toLowerCase();
        const cleanTo = to.trim().toLowerCase();
        const cleanAmount = amount.toString().trim().replace(/\.0$/, "");

        // 2. 組裝原始訊息並做 SHA-256 (與 Android 硬體簽名對象一致)
        const message = `transfer:${cleanTo}:${cleanAmount}`;
        const messageHash = ethers.sha256(ethers.toUtf8Bytes(message));

        // 3. 解析 DER 簽名
        const { r, s } = parseDERSignature(signature);

        // 4. 使用以太坊標準 K1 曲線恢復地址 (窮舉 v 27, 28)
        let recoveredAddress = "";
        for (let v of [27, 28]) {
            try {
                // 直接使用 recoverAddress 配合原始 Hash (不加 Ethereum 前綴)
                const addr = ethers.recoverAddress(messageHash, { r, s, v });
                if (addr.toLowerCase() === cleanFrom) {
                    recoveredAddress = addr;
                    break;
                }
            } catch (e) { continue; }
        }

        if (!recoveredAddress) {
            // 如果 27, 28 都不行，嘗試 v=0, 1 (某些硬體庫的行為)
            for (let v of [0, 1]) {
                try {
                    const addr = ethers.recoverAddress(messageHash, { r, s, v });
                    if (addr.toLowerCase() === cleanFrom) {
                        recoveredAddress = addr;
                        break;
                    }
                } catch (e) { continue; }
            }
        }

        if (!recoveredAddress) {
            return res.status(200).json({
                success: false,
                error: "簽名驗證失敗：K1 曲線地址不匹配",
                debug: { message, expected: cleanFrom }
            });
        }

        // 5. 執行轉帳
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        let pk = process.env.ADMIN_PRIVATE_KEY;
        if (!pk.startsWith('0x')) pk = '0x' + pk;
        const wallet = new ethers.Wallet(pk, provider);
        const contract = new ethers.Contract(CONTRACT_ADDRESS, [
            "function adminTransfer(address from, address to, uint256 amount) public"
        ], wallet);

        const nonce = await provider.getTransactionCount(wallet.address, "latest");
        const tx = await contract.adminTransfer(
            ethers.getAddress(cleanFrom),
            ethers.getAddress(cleanTo),
            ethers.parseUnits(cleanAmount, 18),
            { gasLimit: 200000, nonce }
        );

        return res.status(200).json({ success: true, txHash: tx.hash });

    } catch (error) {
        return res.status(200).json({ success: false, error: error.message });
    }
}