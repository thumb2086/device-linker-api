import { ethers } from "ethers";

// 1. DER 簽名解析 (保持強健性)
function parseDERSignature(signatureBase64) {
    const sig = Buffer.from(signatureBase64, 'base64');
    let pos = 0;
    if (sig[pos++] !== 0x30) throw new Error("Invalid DER prefix");
    pos++;
    const extractInt = () => {
        if (sig[pos++] !== 0x02) throw new Error("Expected Integer mark");
        let len = sig[pos++];
        let val = sig.slice(pos, pos + len);
        pos += len;
        if (val.length > 32 && val[0] === 0x00) val = val.slice(1);
        return '0x' + Buffer.from(val).toString('hex').padStart(64, '0');
    };
    return { r: extractInt(), s: extractInt() };
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
    const { from, to, amount, signature, publicKey } = req.body;

    try {
        // --- A. 格式標準化 ---
        const cleanFrom = from.trim().toLowerCase();
        const cleanTo = to.trim().toLowerCase();
        const cleanAmount = amount.toString().trim().replace(/\.0$/, "");
        const message = `transfer:${cleanTo}:${cleanAmount}`;
        const sha256Digest = ethers.sha256(ethers.toUtf8Bytes(message));

        // --- B. 公鑰脫殼 (解決 91 bytes 錯誤) ---
        let pubKeyBuf = Buffer.from(publicKey, 'base64');
        // Android X.509 格式為 91 bytes，後 65 bytes 才是原始公鑰點
        if (pubKeyBuf.length === 91) {
            pubKeyBuf = pubKeyBuf.slice(pubKeyBuf.length - 65);
        } else if (pubKeyBuf.length === 97) { // 某些版本的例外處理
            pubKeyBuf = pubKeyBuf.slice(pubKeyBuf.length - 64);
            pubKeyBuf = Buffer.concat([Buffer.from([0x04]), pubKeyBuf]);
        }
        const pubKeyHex = '0x' + pubKeyBuf.toString('hex');

        // --- C. 地址與公鑰綁定檢查 ---
        const pubDerived = ethers.computeAddress(pubKeyHex).toLowerCase();
        if (pubDerived !== cleanFrom) {
            return res.status(200).json({
                success: false,
                error: "公鑰與地址不匹配",
                debug: { pubDerived, expected: cleanFrom, pubLen: pubKeyBuf.length }
            });
        }

        // --- D. 簽名驗證與 Low-S 規格化 ---
        const { r, s: originalS } = parseDERSignature(signature);
        const n = BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141");
        const sVal = BigInt(originalS);
        const sLowHex = '0x' + (sVal > n / 2n ? n - sVal : sVal).toString(16).padStart(64, '0');

        let recoveredAddress = null;
        // 窮舉 v 並嘗試原始 S 與 Low-S
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

        if (!recoveredAddress) throw new Error("簽名校驗失敗：無法從簽名還原地址");

        // --- E. 執行轉帳 ---
        const provider = new ethers.JsonRpcProvider("https://ethereum-sepolia-rpc.publicnode.com");
        const wallet = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY, provider);
        const contract = new ethers.Contract("0x789c566675204487D43076935C19356860fC62A4", [
            "function adminTransfer(address from, address to, uint256 amount) public"
        ], wallet);

        // 處理 to 可能不是 0x 地址的情形（如你的 log 顯示 to: "124"）
        const finalTo = cleanTo.startsWith("0x") && cleanTo.length === 42
            ? ethers.getAddress(cleanTo)
            : "0x" + cleanTo.padStart(40, '0');

        const tx = await contract.adminTransfer(
            ethers.getAddress(cleanFrom),
            finalTo,
            ethers.parseUnits(cleanAmount, 18),
            { gasLimit: 250000 }
        );

        return res.status(200).json({ success: true, txHash: tx.hash });

    } catch (error) {
        return res.status(200).json({ success: false, error: error.message });
    }
}