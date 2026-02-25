import { kv } from '@vercel/kv';
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "./config.js";

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { address, amount, choice, sessionId } = req.body;

    if (!address || !amount || !choice || !sessionId) {
        return res.status(400).json({ error: "缺少必要參數" });
    }

    try {
        const sessionData = await kv.get(`session:${sessionId}`);
        if (!sessionData) return res.status(403).json({ error: "會話過期，請重新登入" });

        // 1. 先準備合約連線 (為了查餘額)
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const wallet = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY, provider);
        const lossPoolAddress = process.env.LOSS_POOL_ADDRESS || wallet.address;

        const contract = new ethers.Contract(CONTRACT_ADDRESS, [
            "function mint(address to, uint256 amount) public",
            "function adminTransfer(address from, address to, uint256 amount) public",
            "function decimals() view returns (uint8)",
            "function balanceOf(address) view returns (uint256)" // 👈 必須加入這個來查餘額
        ], wallet);

        // 2. 取得精度與轉換金額
        let decimals = 18n;
        try { decimals = await contract.decimals(); } catch (e) { }

        const betWei = ethers.parseUnits(amount.toString(), decimals);

        // 3. 🔥【關鍵修正】檢查餘額是否足夠 🔥
        // 在讓遊戲開始前，先確認他賠不賠得起
        const userBalanceWei = await contract.balanceOf(address);

        if (userBalanceWei < betWei) {
            return res.status(400).json({
                error: "餘額不足！請先充值再試"
            });
        }

        // --- 餘額夠，遊戲才正式開始 ---

        const resultSide = Math.random() > 0.5 ? "heads" : "tails";
        const isWin = (choice === resultSide);

        // 4. 更新 KV 數據 (現在確認有錢了才更新)
        const totalBetRaw = await kv.incrbyfloat(`total_bet:${address.toLowerCase()}`, parseFloat(amount));
        const totalBet = parseFloat(totalBetRaw).toFixed(2);

        let vipLevel = "普通會員";
        if (totalBet >= 100000) vipLevel = "👑 鑽石 VIP";
        else if (totalBet >= 50000) vipLevel = "🥇 黃金會員";
        else if (totalBet >= 10000) vipLevel = "🥈 白銀會員";

        let tx;

        // 5. 執行交易
        try {
            if (isWin) {
                const profitWei = (betWei * 80n) / 100n; // 0.8 倍利潤
                console.log(`贏了！發放利潤...`);
                tx = await contract.mint(address, profitWei, { gasLimit: 200000 });
            } else {
                console.log(`輸了... 扣除本金...`);
                tx = await contract.adminTransfer(address, lossPoolAddress, betWei, { gasLimit: 200000 });
            }
        } catch (blockchainError) {
            // 如果這一步失敗 (例如 Gas 不足)，我們應該要回滾 KV (雖然後端很難真的回滾 KV，但至少報錯)
            console.error("交易失敗:", blockchainError);
            // 簡單的補救：把剛剛加上的 totalBet 扣回來 (為了數據準確)
            await kv.incrbyfloat(`total_bet:${address.toLowerCase()}`, -parseFloat(amount));

            return res.status(500).json({
                error: "區塊鏈交易失敗 (可能是 Gas 不足)",
                details: blockchainError.message
            });
        }

        return res.status(200).json({
            status: "success",
            isWin,
            resultSide,
            totalBet,
            vipLevel,
            txHash: tx.hash
        });

    } catch (error) {
        console.error("API Error:", error);
        return res.status(500).json({ error: error.message });
    }
}
