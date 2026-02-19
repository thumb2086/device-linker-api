import { kv } from '@vercel/kv';
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "./config.js";

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { address, amount, choice, sessionId } = req.body;

    try {
        if (!sessionId) return res.status(400).json({ error: "缺少 sessionId" });

        // 1. 檢查授權狀態
        const sessionData = await kv.get(`session:${sessionId}`);
        if (!sessionData) return res.status(403).json({ error: "會話過期，請重新登入" });

        // 2. 隨機開獎 (50/50 概率)
        const resultSide = Math.random() > 0.5 ? "heads" : "tails";
        const isWin = (choice === resultSide);

        // 3. 區塊鏈設定
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const wallet = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY, provider);
        const contract = new ethers.Contract(CONTRACT_ADDRESS, [
            "function mint(address to, uint256 amount) public",
            "function adminTransfer(address from, address to, uint256 amount) public",
            "function balanceOf(address account) public view returns (uint256)"
        ], wallet);

        const betWei = ethers.parseUnits(amount.toString(), 18);
        let tx;

        // 4. 執行鏈上動作
        if (isWin) {
            // 贏了：發放 1.8 倍獎金 (例如押 10 拿 18)
            const winAmountWei = (betWei * 180n) / 100n;
            tx = await contract.mint(address, winAmountWei, { gasLimit: 250000 });
        } else {
            // 輸了：銷毀押注金額 (將錢從使用者轉到 0 地址)
            tx = await contract.adminTransfer(
                address,
                "0x0000000000000000000000000000000000000000",
                betWei,
                { gasLimit: 250000 }
            );
        }

        // 🚀 關鍵：等待區塊鏈打包確認，否則網頁餘額不會變
        const receipt = await tx.wait();
        console.log(`交易成功，Hash: ${receipt.hash}`);

        // 5. 更新 KV 數據 (累計押注與 VIP)
        const totalBet = await kv.incrbyfloat(`total_bet:${address.toLowerCase()}`, parseFloat(amount));
        let vipLevel = totalBet >= 1000 ? "👑 鑽石 VIP" : (totalBet >= 500 ? "🥇 黃金會員" : (totalBet >= 100 ? "🥈 白銀會員" : "普通會員"));

        // 6. 抓取最新餘額回傳
        const newBalanceRaw = await contract.balanceOf(address);
        const newBalance = ethers.formatUnits(newBalanceRaw, 18);

        const gameResult = {
            status: "finished",
            isWin,
            resultSide,
            txHash: receipt.hash,
            newBalance,
            totalBet: totalBet.toFixed(2),
            vipLevel
        };

        // 將結果存入 KV 供前端查詢 (雙重保險)
        await kv.set(`game:${sessionId}`, gameResult, { ex: 600 });

        return res.status(200).json(gameResult);

    } catch (e) {
        console.error("Coinflip System Error:", e);
        return res.status(200).json({
            success: false,
            error: "鏈上執行失敗: " + (e.reason || "餘額不足或 Admin 權限未開啟")
        });
    }
}