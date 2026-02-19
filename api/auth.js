import { kv } from '@vercel/kv';
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "./config.js";

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    const { sessionId } = req.query;

    if (req.method === 'GET') {
        const data = await kv.get(`session:${sessionId}`);
        if (data) {
            try {
                const provider = new ethers.JsonRpcProvider(RPC_URL);
                const contract = new ethers.Contract(
                    CONTRACT_ADDRESS,
                    ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"],
                    provider
                );

                // 同時抓取餘額與小數位數
                const [rawBalance, decimals] = await Promise.all([
                    contract.balanceOf(data.address),
                    contract.decimals().catch(() => 18) // 如果合約沒寫 decimals，預設 18
                ]);

                const formattedBalance = ethers.formatUnits(rawBalance, decimals);
                const totalBet = await kv.get(`total_bet:${data.address.toLowerCase()}`) || 0;

                return res.status(200).json({
                    status: "authorized",
                    address: data.address,
                    publicKey: data.publicKey,
                    balance: formattedBalance,
                    totalBet: parseFloat(totalBet).toFixed(2),
                    vipLevel: totalBet >= 1000 ? "👑 鑽石 VIP" : (totalBet >= 500 ? "🥇 黃金會員" : (totalBet >= 100 ? "🥈 白銀會員" : "普通會員"))
                });
            } catch (e) {
                console.error("Balance Fetch Error:", e);
                return res.status(200).json({ status: "authorized", ...data, balance: "Error", error: e.message });
            }
        }
        return res.status(200).json({ status: "pending" });
    }
}