// api/transfer.js
import { ethers } from "ethers";
import { verify } from "crypto"; // 引入原生 crypto 模組
import { CONTRACT_ADDRESS, RPC_URL } from "../lib/config.js";

function normalizeBase64PublicKey(rawPublicKey) {
    const raw = String(rawPublicKey || "").trim();
    if (!raw) return "";
    if (raw.includes("BEGIN PUBLIC KEY")) {
        return raw
            .replace(/-----BEGIN PUBLIC KEY-----/g, "")
            .replace(/-----END PUBLIC KEY-----/g, "")
            .replace(/\s+/g, "");
    }
    return raw.replace(/\s+/g, "");
}

function toPemFromBase64(base64PublicKey) {
    const wrapped = String(base64PublicKey || "").match(/.{1,64}/g) || [];
    return `-----BEGIN PUBLIC KEY-----\n${wrapped.join("\n")}\n-----END PUBLIC KEY-----`;
}

function deriveAddressFromPublicKey(base64PublicKey) {
    const spkiBytes = Buffer.from(base64PublicKey, "base64");
    if (!spkiBytes.length) return null;

    let uncompressed = null;
    if (spkiBytes.length === 65 && spkiBytes[0] === 0x04) {
        uncompressed = spkiBytes;
    } else if (spkiBytes.length > 26 && spkiBytes[26] === 0x04) {
        // Android SPKI key: keep compatibility with the slice(26) patch.
        const sliced = spkiBytes.slice(26);
        if (sliced.length >= 65 && sliced[0] === 0x04) {
            uncompressed = sliced.slice(0, 65);
        }
    } else if (spkiBytes.length > 65) {
        const tail = spkiBytes.slice(-65);
        if (tail[0] === 0x04) {
            uncompressed = tail;
        }
    }

    if (!uncompressed) return null;
    return ethers.computeAddress(`0x${uncompressed.toString("hex")}`).toLowerCase();
}

export default async function handler(req, res) {
    // 設置 CORS (如果需要)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // 1. 接收參數 (注意：必須包含 publicKey)
    const { from, to, amount, signature, publicKey, isPayout } = req.body;

    if (!from || !to || !amount || !signature || !publicKey) {
        return res.status(400).json({ error: '缺少參數: 需要 signature 與 publicKey' });
    }

    try {
        // 2. 格式化參數 (符合新標準)
        const cleanFrom = ethers.getAddress(String(from).trim()).toLowerCase();
        const normalizedTo = ethers.getAddress(String(to).trim()).toLowerCase();
        const cleanTo = normalizedTo.replace(/^0x/, ""); // 用於簽名訊息
        const cleanAmount = amount.toString().trim().replace(/\.0+$/, ""); // 移除 .0
        const normalizedPublicKey = normalizeBase64PublicKey(publicKey);
        const payoutMode = String(isPayout || "").toLowerCase() === "true";

        // 3. 重建簽名訊息 (無暗號版本)
        // 格式: transfer:{to}:{amount}
        const message = `transfer:${cleanTo}:${cleanAmount}`;

        console.log("---------------- NEW STANDARD VERIFICATION ----------------");
        console.log("Server Message  :", message);
        console.log("Received PubKey :", normalizedPublicKey.substring(0, 30) + "...");

        // 4. 轉換公鑰格式 (Android Base64 -> PEM)
        // Android 傳來的 publicKey 是純 Base64 字串 (X.509 SPKI)
        const publicKeyPEM = toPemFromBase64(normalizedPublicKey);

        const derivedAddress = deriveAddressFromPublicKey(normalizedPublicKey);
        if (derivedAddress && derivedAddress !== cleanFrom) {
            return res.status(403).json({
                success: false,
                error: "Address Mismatch",
                expectedAddress: derivedAddress,
                receivedFrom: cleanFrom
            });
        }

        // 5. 執行驗證 (使用 crypto 支援 NIST P-256)
        const isVerified = verify(
            "sha256", // 對應 Android 的 SHA256withECDSA
            Buffer.from(message, 'utf-8'),
            {
                key: publicKeyPEM,
                padding: undefined,
            },
            Buffer.from(signature, 'base64')
        );

        if (!isVerified) {
            console.error("❌ Signature Verification Failed");
            return res.status(200).json({
                success: false,
                error: "簽名驗證失敗 (Crypto)",
                debug: {
                    generatedMessage: message,
                    receivedSignature: signature
                }
            });
        }

        console.log("✅ Signature Verified! Executing Transaction...");

        // 6. 區塊鏈互動
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        if (!process.env.ADMIN_PRIVATE_KEY) throw new Error("Server Error: Missing ADMIN_PRIVATE_KEY");

        const wallet = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY, provider);

        const contract = new ethers.Contract(
            ethers.getAddress(CONTRACT_ADDRESS),
            [
                "function adminTransfer(address from, address to, uint256 amount) public",
                "function decimals() view returns (uint8)"
            ],
            wallet
        );

        const decimals = await contract.decimals();
        const amountWei = ethers.parseUnits(cleanAmount, decimals);
        let transferWei = amountWei;
        let feeWei = 0n;

        if (payoutMode) {
            feeWei = (amountWei * 5n) / 100n;
            transferWei = amountWei - feeWei;
            if (transferWei <= 0n) {
                return res.status(400).json({
                    success: false,
                    error: "金額過小，扣除 5% 手續費後為 0"
                });
            }
        }

        // 這裡我們信任簽名成功代表使用者授權，使用前端傳來的 from 地址
        const tx = await contract.adminTransfer(
            ethers.getAddress(cleanFrom),
            ethers.getAddress("0x" + cleanTo), // 補回 0x 發給合約
            transferWei
        );

        console.log("Tx Hash:", tx.hash);

        return res.status(200).json({
            success: true,
            txHash: tx.hash,
            isPayout: payoutMode,
            requestedAmount: cleanAmount,
            transferredAmount: ethers.formatUnits(transferWei, decimals),
            feeAmount: ethers.formatUnits(feeWei, decimals),
            feeRate: payoutMode ? "0.05" : "0.00"
        });

    } catch (error) {
        console.error("Transfer Error:", error);
        return res.status(500).json({
            success: false,
            error: error.message || "伺服器內部錯誤"
        });
    }
}
