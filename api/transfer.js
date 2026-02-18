import { ethers } from "ethers";

// 1. 強健的 DER 解析：處理動態長度與 Leading Zeros
function parseDERSignature(signatureBase64) {
    const sig = Buffer.from(signatureBase64, 'base64');
    let pos = 0;
    if (sig[pos++] !== 0x30) throw new Error("Invalid DER prefix");
    pos++; // skip length
    const extractInt = () => {
        if (sig[pos++] !== 0x02) throw new Error("Expected Integer mark");
        let len = sig[pos++];
        let val = sig.slice(pos, pos + len);
        pos += len;
        // 移除 0x00 前綴並補齊至 32 bytes (64 chars)
        if (val.length > 32 && val[0] === 0x00) val = val.slice(1);
        return '0x' + Buffer.from(val).toString('hex').padStart(64, '0');
    };
    const r = extractInt();
    const s = extractInt();
    return { r, s };
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { from, to, amount, signature, publicKey } = req.body;

    try {
        const cleanFrom = from.trim().toLowerCase();
        const cleanTo = to.toLowerCase().trim();
        const cleanAmount = amount.toString().trim().replace(/\.0$/, "");
        const message = `transfer:${cleanTo}:${cleanAmount}`;

        // Android V3 簽的是 SHA256 (對應 SHA256withECDSA)
        const sha256Digest = ethers.sha256(ethers.toUtf8Bytes(message));

        // 解析原始 r, s
        const { r, s: originalS } = parseDERSignature(signature);

        // --- Low-S Normalization (EIP-2) ---
        // secp256k1 的 order n
        const n = BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141");
        const sVal = BigInt(originalS);
        const lowSVal = sVal > n / 2n ? n - sVal : sVal;
        const sLowHex = '0x' + lowSVal.toString(16).padStart(64, '0');

        let recoveredAddress = null;
        let matchedV = -1;

        // --- 終極窮舉：考慮 v 偏移與 s 翻轉 ---
        // Android 硬體簽名可能需要我們手動將 s 轉為 low-s 並調整 v
        const possibleVs = [27, 28, 0, 1];
        for (let baseV of possibleVs) {
            // 嘗試原始 S 和 Low-S (Flip) 兩種情況
            for (let sToTry of [originalS, sLowHex]) {
                try {
                    const sigObj = ethers.Signature.from({
                        r,
                        s: sToTry,
                        v: baseV
                    });
                    const addr = ethers.recoverAddress(sha256Digest, sigObj).toLowerCase();
                    if (addr === cleanFrom) {
                        recoveredAddress = addr;
                        matchedV = baseV;
                        break;
                    }
                } catch (e) { }
            }
            if (recoveredAddress) break;
        }

        if (!recoveredAddress) {
            // 診斷輔助：如果傳了公鑰，檢查它對應的地址
            let pubDerived = "未提供公鑰";
            if (publicKey) {
                const pubKeyHex = '0x' + Buffer.from(publicKey, 'base64').toString('hex');
                pubDerived = ethers.computeAddress(pubKeyHex).toLowerCase();
            }

            return res.status(200).json({
                success: false,
                error: "簽名驗證失敗：無法恢復地址",
                debug: {
                    expected: cleanFrom,
                    pubKeyAddr: pubDerived,
                    r,
                    s: originalS
                }
            });
        }

        // --- 驗證成功，執行轉帳 ---
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

        return res.status(200).json({ success: true, txHash: tx.hash, matchedV });

    } catch (error) {
        return res.status(200).json({ success: false, error: error.message });
    }
}