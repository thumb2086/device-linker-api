import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "./config.js";

// 解析 Android DER 簽名格式為以太坊 r, s
function parseDERSignature(signatureBase64) {
    const sigBuffer = Buffer.from(signatureBase64, 'base64');
    // 使用 ethers 的原始解析功能或手動切片
    // DER 格式：0x30 [total-len] 0x02 [r-len] [r] 0x02 [s-len] [s]
    let offset = 0;
    if (sigBuffer[offset++] !== 0x30) throw new Error("Invalid DER prefix");
    offset++; // skip total length

    if (sigBuffer[offset++] !== 0x02) throw new Error("Invalid r prefix");
    const rLen = sigBuffer[offset++];
    const r = sigBuffer.slice(offset, offset + rLen);
    offset += rLen;

    if (sigBuffer[offset++] !== 0x02) throw new Error("Invalid s prefix");
    const sLen = sigBuffer[offset++];
    const s = sigBuffer.slice(offset, offset + sLen);

    // 將 r 和 s 轉為 32 bytes 並補零
    const formatHex = (buf) => {
        let hex = Buffer.from(buf).toString('hex');
        if (hex.length > 64) hex = hex.slice(-64); // 去除可能的前導 00
        return '0x' + hex.padStart(64, '0');
    };

    return { r: formatHex(r), s: formatHex(s) };
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
    const { from, to, amount, signature } = req.body; // signature 預期為 Base64

    try {
        const cleanFrom = ethers.getAddress(from.toLowerCase());
        const cleanTo = ethers.getAddress(to.toLowerCase());
        const message = `transfer:${to.toLowerCase()}:${amount}`;
        const messageHash = ethers.sha256(ethers.toUtf8Bytes(message));

        // 1. 解碼與解析 DER 簽名
        const { r, s } = parseDERSignature(signature);

        // 2. 窮舉 v (27 或 28) 來找回正確地址
        let recoveredAddress = "";
        const vList = [27, 28, 29, 30, 31, 32, 33, 34]; // 有時硬體簽名會偏移，多試幾個

        for (let v of vList) {
            try {
                const tempSig = ethers.Signature.from({ r, s, v });
                const addr = ethers.recoverAddress(messageHash, tempSig);
                if (addr.toLowerCase() === cleanFrom.toLowerCase()) {
                    recoveredAddress = addr;
                    break;
                }
            } catch (e) { continue; }
        }

        if (!recoveredAddress) {
            return res.status(401).json({ success: false, error: "簽名驗證失敗：無法從 DER 恢復匹配地址" });
        }

        // 3. 執行 adminTransfer
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const wallet = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY, provider);
        const abi = ["function adminTransfer(address from, address to, uint256 amount) public"];
        const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, wallet);

        const tx = await contract.adminTransfer(cleanFrom, cleanTo, ethers.parseUnits(amount.toString(), 18), {
            gasLimit: 150000
        });

        return res.status(200).json({ success: true, txHash: tx.hash });

    } catch (error) {
        console.error("Critical Transfer Error:", error);
        return res.status(200).json({ success: false, error: error.message });
    }
}