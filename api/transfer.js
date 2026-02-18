import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "./config.js";

function parseDERSignature(signatureBase64) {
    const sigBuffer = Buffer.from(signatureBase64, 'base64');
    let offset = 0;
    if (sigBuffer[offset++] !== 0x30) throw new Error("Invalid DER");
    offset++;
    const extractInteger = () => {
        if (sigBuffer[offset++] !== 0x02) throw new Error("Expected Integer");
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
        const cleanFrom = from.trim().toLowerCase();
        const cleanTo = to.trim().toLowerCase();
        const cleanAmount = amount.toString().trim().replace(/\.0$/, "");

        // --- 關鍵點：與 Android 手動 Keccak256 100% 對齊 ---
        const message = `transfer:${cleanTo}:${cleanAmount}`;
        const keccak256Digest = ethers.keccak256(ethers.toUtf8Bytes(message));

        const { r, s } = parseDERSignature(signature);
        let recoveredAddress = "";

        // 窮舉 v。注意：在 NONEwithECDSA 模式下，v 通常落在 27, 28
        for (let v of [27, 28, 0, 1]) {
            try {
                const addr = ethers.recoverAddress(keccak256Digest, { r, s, v });
                if (addr.toLowerCase() === cleanFrom) {
                    recoveredAddress = addr;
                    break;
                }
            } catch (e) { }
        }

        if (!recoveredAddress) {
            return res.status(200).json({
                success: false,
                error: "硬體簽名驗證失敗",
                debug: {
                    message,
                    keccak256: keccak256Digest,
                    expected: cleanFrom
                }
            });
        }

        // --- 驗證通過，執行 adminTransfer ---
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        let adminKey = process.env.ADMIN_PRIVATE_KEY;
        if (!adminKey.startsWith('0x')) adminKey = '0x' + adminKey;
        const wallet = new ethers.Wallet(adminKey, provider);
        const contract = new ethers.Contract(CONTRACT_ADDRESS, [
            "function adminTransfer(address from, address to, uint256 amount) public"
        ], wallet);

        const tx = await contract.adminTransfer(
            ethers.getAddress(cleanFrom),
            ethers.getAddress(cleanTo),
            ethers.parseUnits(cleanAmount, 18),
            { gasLimit: 250000 }
        );

        return res.status(200).json({ success: true, txHash: tx.hash });

    } catch (error) {
        return res.status(200).json({ success: false, error: error.message });
    }
}