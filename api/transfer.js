import { ethers } from "ethers";
import { p256 } from "@noble/curves/p256"; // 支援 Android 硬體 r1 曲線
import { CONTRACT_ADDRESS, RPC_URL } from "./config.js";

/**
 * 解析 Android KeyStore 產出的 DER 格式簽名
 */
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

        // 1. 數據清洗 (同步 Android 端)
        const cleanFrom = from.trim().toLowerCase();
        const cleanTo = to.trim().toLowerCase();
        const cleanAmount = amount.toString().trim().replace(/\.0$/, "");

        // 2. 構建原始訊息 Hash (Android 硬體簽名的對象)
        const message = `transfer:${cleanTo}:${cleanAmount}`;
        const messageHash = ethers.sha256(ethers.toUtf8Bytes(message));
        const msgHashBytes = ethers.getBytes(messageHash);

        // 3. 解析 DER 獲取 r, s
        const { r, s } = parseDERSignature(signature);
        const rBigInt = BigInt(r);
        const sBigInt = BigInt(s);

        // 4. 針對 r1 曲線 (P-256) 進行地址恢復
        let recoveredAddress = "";
        for (let recovery of [0, 1]) {
            try {
                const sig = new p256.Signature(rBigInt, sBigInt).addRecoveryBit(recovery);
                const point = sig.recoverPublicKey(msgHashBytes);
                const pubHex = point.toHex(false); // 未壓縮公鑰 (04...)

                // 以太坊地址 = Keccak256(公鑰後64位) 的後20字節
                const addr = ethers.computeAddress("0x" + pubHex);

                if (addr.toLowerCase() === cleanFrom) {
                    recoveredAddress = addr;
                    break;
                }
            } catch (e) { continue; }
        }

        if (!recoveredAddress) {
            return res.status(200).json({
                success: false,
                error: "簽名驗證失敗：r1 曲線地址不匹配",
                debug: { message, expected: cleanFrom }
            });
        }

        // 5. 執行合約轉帳
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
        console.error("Critical Transfer Error:", error);
        return res.status(200).json({ success: false, error: error.message });
    }
}