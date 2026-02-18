import { ethers } from "ethers";

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
        return Buffer.from(val).toString('hex').padStart(64, '0');
    };
    return { r: '0x' + extractInt(), s: '0x' + extractInt() };
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
    const { from, to, amount, signature } = req.body;

    try {
        const cleanFrom = from.trim().toLowerCase();
        const cleanTo = to.toLowerCase().trim();
        const cleanAmount = amount.toString().trim().replace(/\.0$/, "");
        const message = `transfer:${cleanTo}:${cleanAmount}`;
        const sha256Digest = ethers.sha256(ethers.toUtf8Bytes(message));

        const { r, s } = parseDERSignature(signature);

        let recoveredAddress = "";
        let matchedV = -1;
        let allCandidates = [];

        // --- 核心改動：擴大窮舉至 0-31 ---
        for (let v = 0; v <= 31; v++) {
            try {
                // 使用 Signature.from 處理 ethers 內部格式轉換
                const sigObj = ethers.Signature.from({ r, s, v });
                const addr = ethers.recoverAddress(sha256Digest, sigObj).toLowerCase();

                allCandidates.push({ v, addr });

                if (addr === cleanFrom) {
                    recoveredAddress = addr;
                    matchedV = v;
                    break;
                }
            } catch (e) { continue; }
        }

        if (!recoveredAddress) {
            return res.status(200).json({
                success: false,
                error: "簽名驗證失敗：全範圍窮舉均不匹配",
                debug: {
                    expectedFrom: cleanFrom,
                    sha256Digest: sha256Digest,
                    r, s,
                    candidates: allCandidates // 把所有算出來的地址丟回 Android Log
                }
            });
        }

        // --- 驗證通過，執行轉帳 ---
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