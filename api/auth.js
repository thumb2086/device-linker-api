import { kv } from '@vercel/kv';
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "./config.js";

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    const { sessionId } = req.query;

    if (req.method === 'GET') {
        const data = await kv.get(`session:${sessionId}`);
        if (data) {
            // 抓取初始餘額與累計資訊
            const provider = new ethers.JsonRpcProvider(RPC_URL);
            const contract = new ethers.Contract(CONTRACT_ADDRESS, ["function balanceOf(address) view returns (uint256)"], provider);
            const balance = await contract.balanceOf(data.address);
            const totalBet = await kv.get(`total_bet:${data.address.toLowerCase()}`) || 0;

            let vipLevel = "普通會員";
            if (totalBet >= 1000) vipLevel = "👑 鑽石 VIP";
            else if (totalBet >= 500) vipLevel = "🥇 黃金會員";
            else if (totalBet >= 100) vipLevel = "🥈 白銀會員";

            return res.status(200).json({
                status: "authorized",
                ...data,
                balance: ethers.formatUnits(balance, 18),
                totalBet: parseFloat(totalBet).toFixed(2),
                vipLevel
            });
        }
        return res.status(200).json({ status: "pending" });
    }
    // POST 邏輯保持不變...
}