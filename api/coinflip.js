import { kv } from '@vercel/kv';
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "./config.js";

export default async function handler(req, res) {
    // 1. 基礎檢查
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { address, amount, choice, sessionId } = req.body;

    if (!address || !amount || !choice || !sessionId) {
        return res.status(400).json({ error: "缺少必要參數" });
    }

    try {
        // 2. 驗證 Session (確保用戶已登入)
        const sessionData = await kv.get(`session:${sessionId}`);
        if (!sessionData) {
            return res.status(403).json({ error: "會話過期，請重新掃描登入" });
        }

        // 3. 執行遊戲邏輯 (開獎)
        // 隨機決定： heads (正面) 或 tails (反面)
        const resultSide = Math.random() > 0.5 ? "heads" : "tails";
        const isWin = (choice === resultSide);

        // 4. 更新 KV 數據 (累計押注與 VIP)
        const totalBetRaw = await kv.incrbyfloat(`total_bet:${address.toLowerCase()}`, parseFloat(amount));
        const totalBet = parseFloat(totalBetRaw).toFixed(2);

        let vipLevel = "普通會員";
        if (totalBet >= 1000) vipLevel = "👑 鑽石 VIP";
        else if (totalBet >= 500) vipLevel = "🥇 黃金會員";
        else if (totalBet >= 100) vipLevel = "🥈 白銀會員";

        // 5. 準備區塊鏈連線
        const provider = new ethers.JsonRpcProvider(RPC_URL);

        // 檢查後端錢包私鑰
        if (!process.env.ADMIN_PRIVATE_KEY) {
            throw new Error("伺服器設定錯誤：找不到 ADMIN_PRIVATE_KEY");
        }

        const wallet = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY, provider);

        // 定義合約介面 (ABI)
        const contract = new ethers.Contract(CONTRACT_ADDRESS, [
            "function mint(address to, uint256 amount) public",
            "function adminTransfer(address from, address to, uint256 amount) public",
            "function decimals() view returns (uint8)" // 關鍵：讀取精度
        ], wallet);

        // 6. 處理金額精度 (關鍵修正！)
        // 先讀取合約的小數位數 (例如 18 或 12)
        let decimals = 18;
        try {
            decimals = await contract.decimals();
        } catch (err) {
            console.warn("無法讀取 decimals，預設使用 18", err);
        }

        // 將用戶輸入的金額轉為 BigInt (例如 10 -> 10000000000000000000)
        const betWei = ethers.parseUnits(amount.toString(), decimals);
        let tx;

        // 7. 發送交易 (必須 await，不能背景執行)
        try {
            if (isWin) {
                // 贏：鑄造獎勵 (本金 * 1.8 倍)
                // 使用 BigInt 運算防止精度丟失
                const winAmountWei = (betWei * 180n) / 100n;

                console.log(`正在發送贏錢交易: Mint ${ethers.formatUnits(winAmountWei, decimals)} to ${address}`);

                tx = await contract.mint(address, winAmountWei, { gasLimit: 200000 }); // 手動設定 Gas 避免估算失敗
            } else {
                // 輸：將用戶的錢轉到黑洞地址 (銷毀)
                const burnAddress = "0x000000000000000000000000000000000000dEaD";

                console.log(`正在發送輸錢交易: Transfer ${amount} from ${address} to Dead`);

                tx = await contract.adminTransfer(address, burnAddress, betWei, { gasLimit: 200000 });
            }

            console.log(`交易已送出，Hash: ${tx.hash}`);

            // 注意：我們只 await 發送 (tx)，不 await 確認 (tx.wait)，
            // 這樣前端可以立刻拿到 Hash，不用等 15 秒區塊確認。

        } catch (blockchainError) {
            console.error("區塊鏈交易失敗:", blockchainError);
            // 如果是 Gas 不足或合約錯誤，回傳具體訊息
            return res.status(500).json({
                error: "區塊鏈交易失敗，請聯繫管理員",
                details: blockchainError.reason || blockchainError.message
            });
        }

        // 8. 回傳成功結果
        return res.status(200).json({
            status: "success",
            isWin,
            resultSide,
            totalBet,
            vipLevel,
            txHash: tx.hash // 前端將使用這個來顯示 Etherscan 連結
        });

    } catch (error) {
        console.error("API 嚴重錯誤:", error);
        return res.status(500).json({ error: error.message });
    }
}