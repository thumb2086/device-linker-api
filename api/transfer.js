import { ethers } from "ethers";

// 1. 強健的 DER 簽名解析
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
        // 移除 0x00 前綴並補齊至 32 bytes
        if (val.length > 32 && val[0] === 0x00) val = val.slice(1);
        return '0x' + Buffer.from(val).toString('hex').padStart(64, '0');
    };
    return { r: extractInt(), s: extractInt() };
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { from, to, amount, signature, publicKey } = req.body;

    try {
        if (!publicKey) throw new Error("缺少公鑰 (publicKey)");

        // --- A. 數據標準化 ---
        const cleanFrom = from.trim().toLowerCase();
        const cleanTo = to.trim().toLowerCase();
        const cleanAmount = amount.toString().trim().replace(/\.0$/, "");
        const message = `transfer:${cleanTo}:${cleanAmount}`;

        // Android V3 簽的是 SHA256 (對應 SHA256withECDSA)
        const sha256Digest = ethers.sha256(ethers.toUtf8Bytes(message));

        // --- B. 公鑰脫殼 (精確解析 Android X.509) ---
        let pubKeyBuf = Buffer.from(publicKey, 'base64');

        // 標準 91-byte X.509 結構：前 26 bytes 是 Header，後 65 bytes 是 [04 + X + Y]
        if (pubKeyBuf.length === 91) {
            pubKeyBuf = pubKeyBuf.slice(26);
        } else {
            // 備援方案：自動搜尋 0x04 開頭的 65 byte 片段
            const index = pubKeyBuf.indexOf(Buffer.from([0x04]));
            if (index !== -1 && pubKeyBuf.length - index >= 65) {
                pubKeyBuf = pubKeyBuf.slice(index, index + 65);
            }
        }

        // 安全檢查：確保是以太坊認識的非壓縮公鑰格式
        if (pubKeyBuf[0] !== 0x04 || pubKeyBuf.length !== 65) {
            throw new Error(`公鑰格式非法。長度: ${pubKeyBuf.length}, 起始字節: ${pubKeyBuf[0]}`);
        }

        const pubKeyHex = '0x' + pubKeyBuf.toString('hex');

        // --- C. 地址與公鑰綁定檢查 ---
        const pubDerived = ethers.computeAddress(pubKeyHex).toLowerCase();
        if (pubDerived !== cleanFrom) {
            return res.status(200).json({
                success: false,
                error: "公鑰與地址不匹配",
                debug: { pubDerived, expected: cleanFrom }
            });
        }

        // --- D. 簽名驗證與 Low-S 規格化 ---
        const { r, s: originalS } = parseDERSignature(signature);
        const n = BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141");
        const sVal = BigInt(originalS);

        // 準備原始 S 與規格化後的 Low-S
        const sLowHex = '0x' + (sVal > n / 2n ? n - sVal : sVal).toString(16).padStart(64, '0');

        let recoveredAddress = null;
        // 窮舉 v (27, 28, 0, 1) 並嘗試兩種 S
        for (let v of [27, 28, 0, 1]) {
            for (let sToTry of [originalS, sLowHex]) {
                try {
                    const addr = ethers.recoverAddress(sha256Digest, { r, s: sToTry, v });
                    if (addr.toLowerCase() === cleanFrom) {
                        recoveredAddress = addr;
                        break;
                    }
                } catch (e) { }
            }
            if (recoveredAddress) break;
        }

        if (!recoveredAddress) {
            throw new Error("簽名校驗失敗：無法還原合法地址");
        }

        // --- E. 執行轉帳 ---
        const provider = new ethers.JsonRpcProvider("https://ethereum-sepolia-rpc.publicnode.com");
        const adminKey = process.env.ADMIN_PRIVATE_KEY.startsWith('0x') ? process.env.ADMIN_PRIVATE_KEY : `0x${process.env.ADMIN_PRIVATE_KEY}`;
        const wallet = new ethers.Wallet(adminKey, provider);

        const contract = new ethers.Contract("0x789c566675204487D43076935C19356860fC62A4", [
            "function adminTransfer(address from, address to, uint256 amount) public"
        ], wallet);

        // 處理 to 地址填充 (針對測試數據 124)
        const finalTo = cleanTo.startsWith("0x") && cleanTo.length === 42
            ? ethers.getAddress(cleanTo)
            : "0x" + cleanTo.padStart(40, '0');

        const tx = await contract.adminTransfer(
            ethers.getAddress(cleanFrom),
            finalTo,
            ethers.parseUnits(cleanAmount, 18),
            { gasLimit: 250000 }
        );

        return res.status(200).json({
            success: true,
            txHash: tx.hash,
            debug: { recovered: recoveredAddress }
        });

    } catch (error) {
        console.error("Vercel Transfer Error:", error);
        return res.status(200).json({
            success: false,
            error: error.message
        });
    }
}