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

        const sessionData = await kv.get(`session:${sessionId}`);
        if (!sessionData) return res.status(403).json({ error: "尚未授權登入" });

        // 1. 隨機開獎
        const resultSide = Math.random() > 0.5 ? "heads" : "tails";
        const isWin = (choice === resultSide);

        // 2. 區塊鏈連線
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const wallet = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY, provider);
        const contract = new ethers.Contract(CONTRACT_ADDRESS, [
            "function mint(address to, uint256 amount) public",
            "function adminTransfer(address from, address to, uint256 amount) public",
            "function balanceOf(address account) public view returns (uint256)"
        ], wallet);

        const betWei = ethers.parseUnits(amount.toString(), 18);

        // 3. 累計押注額度 (使用 KV 儲存)
        const totalBetKey = `total_bet:${address.toLowerCase()}`;
        // 增加累計額度
        const newTotalBet = await kv.incrbyfloat(totalBetKey, parseFloat(amount));

        // 判斷 VIP 等級
        let vipLevel = "普通會員";
        if (newTotalBet >= 1000) vipLevel = "👑 鑽石 VIP";
        else if (newTotalBet >= 500) vipLevel = "🥇 黃金會員";
        else if (newTotalBet >= 100) vipLevel = "🥈 白銀會員";

        // 4. 執行合約
        let tx;
        if (isWin) {
            const winAmountWei = (betWei * 180n) / 100n; // 1.8x 賠率
            tx = await contract.mint(address, winAmountWei, { gasLimit: 250000 });
        } else {
            tx = await contract.adminTransfer(address, "0x0000000000000000000000000000000000000000", betWei, { gasLimit: 250000 });
        }

        // 5. 取得最新餘額
        const newBalance = await contract.balanceOf(address);

        const gameResult = {
            status: "finished",
            isWin,
            resultSide,
            txHash: tx.hash,
            multiplier: 1.8,
            newBalance: ethers.formatUnits(newBalance, 18),
            totalBet: newTotalBet.toFixed(2),
            vipLevel: vipLevel
        };

        await kv.set(`game:${sessionId}`, gameResult, { ex: 600 });
        return res.status(200).json(gameResult);

    } catch (e) {
        return res.status(200).json({ success: false, error: e.message });
    }
}