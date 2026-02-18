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

        // 確保長度為 32 bytes 並補零，轉為 hex 格式
        return '0x' + Buffer.from(val).toString('hex').padStart(64, '0');
    };

    const r = extractInteger();
    const s = extractInteger();
    return { r, s };
}

export default async function handler(req, res) {
    // 只允許 POST 請求
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { from, to, amount, signature } = req.body;

    try {
        // 1. 基本參數檢查
        if (!from || !to || !amount || !signature) {
            throw new Error("缺少必要參數 (from, to, amount, signature)");
        }

        // 2. 地址與合約正規化
        const cleanFrom = ethers.getAddress(from.toLowerCase());
        const cleanTo = ethers.getAddress(to.toLowerCase());
        const cleanContract = ethers.getAddress(CONTRACT_ADDRESS.toLowerCase());

        // 3. 構建與 Android 端完全一致的訊息與 Hash
        // 格式必須為 "transfer:小寫地址:數量"
        const message = `transfer:${to.toLowerCase()}:${amount}`;
        const messageHash = ethers.sha256(ethers.toUtf8Bytes(message));

        // 4. 解析 DER 簽名獲取 r, s
        let r, s;
        try {
            const sig = parseDERSignature(signature);
            r = sig.r;
            s = sig.s;
        } catch (e) {
            return res.status(200).json({ success: false, error: "簽名解析失敗: " + e.message });
        }

        // 5. 窮舉 v 值 (27, 28) 嘗試恢復地址
        let recoveredAddress = "";
        for (let v of [27, 28]) {
            try {
                const addr = ethers.recoverAddress(messageHash, { r, s, v });
                if (addr.toLowerCase() === cleanFrom.toLowerCase()) {
                    recoveredAddress = addr;
                    break;
                }
            } catch (e) {
                // 如果這個 v 值恢復失敗，繼續嘗試下一個
                continue;
            }
        }

        // 6. 驗證恢復結果
        if (!recoveredAddress) {
            return res.status(200).json({
                success: false,
                error: "簽名驗證失敗：還原地址與發送者不符",
                debug: {
                    messageUsed: message,
                    messageHash: messageHash,
                    recovered: recoveredAddress || "none"
                }
            });
        }

        // 7. 初始化 Provider 與管理員錢包
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        let pk = process.env.ADMIN_PRIVATE_KEY;
        if (!pk) throw new Error("環境變數 ADMIN_PRIVATE_KEY 未設定");
        if (!pk.startsWith('0x')) pk = '0x' + pk;

        const wallet = new ethers.Wallet(pk, provider);

        // 8. 連結合約並執行神權轉帳
        const contract = new ethers.Contract(cleanContract, [
            "function adminTransfer(address from, address to, uint256 amount) public"
        ], wallet);

        // 獲取最新 Nonce 防止連續交易卡單
        const nonce = await provider.getTransactionCount(wallet.address, "latest");

        console.log(`正在執行神權轉帳: ${cleanFrom} -> ${cleanTo}, 數量: ${amount}`);

        const tx = await contract.adminTransfer(
            cleanFrom,
            cleanTo,
            ethers.parseUnits(amount.toString(), 18),
            {
                gasLimit: 200000,
                nonce: nonce
            }
        );

        // 9. 回傳交易成功資訊
        return res.status(200).json({
            success: true,
            txHash: tx.hash,
            message: "轉帳成功"
        });

    } catch (error) {
        console.error("Transfer Error Details:", error);
        // 捕捉所有錯誤並以 JSON 形式回傳，避免前端收到 500 HTML 頁面
        return res.status(200).json({
            success: false,
            error: error.reason || error.message || "伺服器內部錯誤"
        });
    }
}