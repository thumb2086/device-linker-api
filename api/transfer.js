import { ethers } from "ethers";

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
        if (val.length > 32 && val[0] === 0x00) val = val.slice(1);
        return '0x' + Buffer.from(val).toString('hex').padStart(64, '0');
    };

    const r = extractInt();
    const s = extractInt();

    return { r, s };
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { from, to, amount, signature } = req.body;

    if (!from || !to || !amount || !signature) {
        return res.status(400).json({ error: '缺少必要參數' });
    }

    try {
        const cleanFrom = from.trim().toLowerCase();
        const cleanTo = to.trim().toLowerCase().replace(/^0x/, ''); // 去掉可能的 0x 前綴
        const cleanAmount = amount.toString().trim().replace(/\.0$/, "");

        // 加入暗號，與 Android 端完全一致
        const secret = "大拇哥是帥歌";
        const message = `transfer:${cleanTo}:${cleanAmount}${secret}`;

        // 計算 digest
        const digest = ethers.sha256(ethers.toUtf8Bytes(message));

        const { r, s: originalS } = parseDERSignature(signature);

        // secp256k1 order n
        const n = BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141");
        let sVal = BigInt(originalS.slice(2), 16); // 去掉 0x
        let sHex = originalS;

        // 如果 s > n/2，翻轉成 low-s
        if (sVal > n / 2n) {
            sVal = n - sVal;
            sHex = '0x' + sVal.toString(16).padStart(64, '0');
        }

        let recovered = null;
        let usedV = -1;
        let attempts = [];

        // 窮舉常見 v 值
        for (let v of [27, 28, 0, 1]) {
            try {
                const sig = ethers.Signature.from({ r, s: sHex, v });
                const addr = ethers.recoverAddress(digest, sig).toLowerCase();
                attempts.push({ v, addr });
                if (addr === cleanFrom) {
                    recovered = addr;
                    usedV = v;
                    break;
                }
            } catch (e) {
                attempts.push({ v, error: e.message });
            }
        }

        if (!recovered) {
            return res.status(200).json({
                success: false,
                error: "簽名驗證失敗，無法恢復地址",
                debug: {
                    expectedFrom: cleanFrom,
                    digest,
                    r,
                    originalS,
                    lowSUsed: sHex,
                    messageWithSecret: message,
                    messageLength: message.length,
                    recoverAttempts: attempts
                }
            });
        }

        // 驗證成功 → 執行合約轉帳
        const provider = new ethers.JsonRpcProvider("https://ethereum-sepolia-rpc.publicnode.com");
        const wallet = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY, provider);

        const contract = new ethers.Contract(
            "0x789c566675204487D43076935C19356860fC62A4",
            ["function adminTransfer(address from, address to, uint256 amount) public"],
            wallet
        );

        const tx = await contract.adminTransfer(
            ethers.getAddress(cleanFrom),
            ethers.getAddress("0x" + cleanTo), // 補回 0x
            ethers.parseUnits(cleanAmount, 18),
            { gasLimit: 250000 }
        );

        return res.status(200).json({
            success: true,
            txHash: tx.hash,
            v: usedV
        });

    } catch (error) {
        console.error("Transfer error:", error);
        return res.status(200).json({
            success: false,
            error: error.message || "未知錯誤"
        });
    }
}