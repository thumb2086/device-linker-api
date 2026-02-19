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

        // 1. 開獎邏輯
        const resultSide = Math.random() > 0.5 ? "heads" : "tails";
        const isWin = (choice === resultSide);

        // 2. 更新 KV 數據 (累計押注)
        const totalBetRaw = await kv.incrbyfloat(`total_bet:${address.toLowerCase()}`, parseFloat(amount));
        const totalBet = parseFloat(totalBetRaw).toFixed(2);

        // 判斷 VIP
        let vipLevel = "普通會員";
        if (totalBet >= 100000) vipLevel = "👑 鑽石 VIP";
        else if (totalBet >= 50000) vipLevel = "🥇 黃金會員";
        else if (totalBet >= 10000) vipLevel = "🥈 白銀會員";

        // 3. 區塊鏈操作準備
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const wallet = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY, provider);

        const contract = new ethers.Contract(CONTRACT_ADDRESS, [
            "function mint(address to, uint256 amount) public",
            "function adminTransfer(address from, address to, uint256 amount) public",
            "function decimals() view returns (uint8)"
        ], wallet);

        // 4. 取得精度與計算金額
        let decimals = 18n;
        try {
            decimals = await contract.decimals();
        } catch (e) {
            console.log("無法讀取精度，預設使用 18");
        }

        const betWei = ethers.parseUnits(amount.toString(), decimals);
        let tx;

        // 5. 執行交易 (修正賠率邏輯)
        if (isWin) {
            // ✅ 修正點在這裡：
            // 因為本金還在用戶錢包裡，我們只發放 0.8 倍的利潤
            // 總資產變化： 本金(1.0) + 利潤(0.8) = 1.8 倍
            const profitWei = (betWei * 80n) / 100n; // 0.8 倍

            console.log(`贏了！發放利潤: ${ethers.formatUnits(profitWei, decimals)}`);
            tx = await contract.mint(address, profitWei, { gasLimit: 200000 });

        } else {
            // 輸了：把本金轉到黑洞 (銷毀)
            // 總資產變化： 本金(1.0) - 本金(1.0) = 0
            const burnAddress = "0x000000000000000000000000000000000000dEaD";

            console.log(`輸了... 銷毀本金: ${amount}`);
            tx = await contract.adminTransfer(address, burnAddress, betWei, { gasLimit: 200000 });
        }

        // 6. 回傳結果
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