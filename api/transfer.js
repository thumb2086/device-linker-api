import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "./config.js";

/**
 * 解析 Android KeyStore 產出的 DER 格式簽名為以太坊 r, s
 */
function parseDERSignature(signatureBase64) {
    const sigBuffer = Buffer.from(signatureBase64, 'base64');
    let offset = 0;

    if (sigBuffer[offset++] !== 0x30) throw new Error("無效的 DER 前綴");
    offset++; // 跳過總長度標記

    const extractInteger = () => {
        if (sigBuffer[offset++] !== 0x02) throw new Error("預期為 Integer 標記");
        let len = sigBuffer[offset++];
        let val = sigBuffer.slice(offset, offset + len);
        offset += len;

        // 核心修正：去除 DER 為了處理正負號補的前導 0x00
        if (val.length > 32 && val[0] === 0x00) {
            val = val.slice(1);
        }

        // 確保長度為 32 bytes (64 hex chars) 並補零
        return '0x' + Buffer.from(val).toString('hex').padStart(64, '0');
    };

    const r = extractInteger();
    const s = extractInteger();
    return { r, s };
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { from, to, amount, signature } = req.body;

    try {
        if (!from || !to || !amount || !signature) {
            throw new Error("缺少必要參數 (from, to, amount, signature)");
        }

        // 1. 地址正規化
        const cleanFrom = ethers.getAddress(from.toLowerCase());
        const cleanTo = ethers.getAddress(to.toLowerCase());
        const cleanContract = ethers.getAddress(CONTRACT_ADDRESS.toLowerCase());

        // 2. 構建訊息與 Hash (需與 Android 端完全一致)
        const message = `transfer:${to.toLowerCase()}:${amount}`;
        const messageHash = ethers.sha256(ethers.toUtf8Bytes(message));

        // 3. 解析 DER 簽名獲取十六進制的 r 和 s
        let r, s;
        try {
            const sig = parseDERSignature(signature);
            r = sig.r;
            s = sig.s;
        } catch (e) {
            return res.status(200).json({ success: false, error: "簽名格式解析失敗: " + e.message });
        }

        // 4. 恢復地址 (窮舉 v = 27, 28)
        let recoveredAddress = "";
        for (let v of [27, 28]) {
            try {
                // 修正重點：傳入包含 r, s, v 的物件，而非原始 Base64 字串
                const addr = ethers.recoverAddress(messageHash, { r, s, v });

                if (addr.toLowerCase() === cleanFrom.toLowerCase()) {
                    recoveredAddress = addr;
                    break;
                }
            } catch (e) {
                // 如果該 v 值導致簽名不合法，跳過並嘗試下一個
                continue;
            }
        }

        // 5. 驗證恢復結果
        if (!recoveredAddress) {
            return res.status(200).json({
                success: false,
                error: "簽名驗證失敗：還原地址與發送者不符",
                debug: {
                    messageUsed: message,
                    recovered: recoveredAddress || "none",
                    r: r,
                    s: s
                }
            });
        }

        // 6. 初始化 Provider 與管理員錢包
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        let pk = process.env.ADMIN_PRIVATE_KEY;
        if (!pk) throw new Error("環境變數 ADMIN_PRIVATE_KEY 未設定");
        if (!pk.startsWith('0x')) pk = '0x' + pk;
        const wallet = new ethers.Wallet(pk, provider);

        // 7. 連結合約
        const contract = new ethers.Contract(cleanContract, [
            "function adminTransfer(address from, address to, uint256 amount) public"
        ], wallet);

        // 8. 獲取 Nonce 並執行轉帳
        const nonce = await provider.getTransactionCount(wallet.address, "latest");

        const tx = await contract.adminTransfer(
            cleanFrom,
            cleanTo,
            ethers.parseUnits(amount.toString(), 18),
            {
                gasLimit: 200000,
                nonce: nonce
            }
        );

        return res.status(200).json({
            success: true,
            txHash: tx.hash,
            message: "轉帳成功"
        });

    } catch (error) {
        console.error("Transfer Detailed Error:", error);
        return res.status(200).json({
            success: false,
            error: error.reason || error.message || "伺服器內部錯誤"
        });
    }
}