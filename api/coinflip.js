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
        if (!sessionData) return res.status(403).json({ error: "授權過期" });

        // 1. 隨機開獎
        const resultSide = Math.random() > 0.5 ? "heads" : "tails";
        const isWin = (choice === resultSide);

        // 2. 鏈上連線
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const wallet = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY, provider);
        const contract = new ethers.Contract(CONTRACT_ADDRESS, [
            "function mint(address to, uint256 amount) public",
            "function adminTransfer(address from, address to, uint256 amount) public",
            "function balanceOf(address account) public view returns (uint256)"
        ], wallet);

        const betWei = ethers.parseUnits(amount.toString(), 18);
        let tx;

        if (isWin) {
            // 贏了：Mint 1.8x
            const winAmountWei = (betWei * 180n) / 100n;
            tx = await contract.mint(address, winAmountWei, { gasLimit: 150000 });
        } else {
            // 💀 輸了：執行銷毀
            // 🚀 關鍵修正：改用 dEaD 地址，防止合約檢查零地址報錯
            const burnAddress = "0x000000000000000000000000000000000000dEaD";
            tx = await contract.adminTransfer(address, burnAddress, betWei, { gasLimit: 150000 });
        }

        // 3. 等待確認 (加入超時保護，避免網頁卡死)
        const receipt = await tx.wait();

        // 4. 更新數據與 VIP
        const totalBet = await kv.incrbyfloat(`total_bet:${address.toLowerCase()}`, parseFloat(amount));
        const newBalanceRaw = await contract.balanceOf(address);
        const newBalance = ethers.formatUnits(newBalanceRaw, 18);

        let vipLevel = "普通會員";
        if (totalBet >= 1000) vipLevel = "👑 鑽石 VIP";
        else if (totalBet >= 500) vipLevel = "🥇 黃金會員";
        else if (totalBet >= 100) vipLevel = "🥈 白銀會員";

        return res.status(200).json({
            status: "finished", isWin, resultSide,
            txHash: receipt.hash,
            newBalance, totalBet: totalBet.toFixed(2), vipLevel
        });

    } catch (e) {
        console.error("Critical System Error:", e);
        return res.status(200).json({
            success: false,
            error: "鏈上執行失敗: " + (e.reason || "請確認 Admin 權限或餘額是否足夠扣除")
        });
    }
}