import { kv } from '@vercel/kv';
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "./config.js";

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // 如果是 GET (網頁輪詢)，直接回傳空或狀態 (這版已經不需要 GET 輪詢了，因為 POST 直接回傳結果)
    if (req.method === 'GET') return res.status(200).json({ status: "ready" });

    const { address, amount, choice, sessionId } = req.body;

    try {
        if (!sessionId) return res.status(400).json({ error: "Missing sessionId" });

        // 🚀 關鍵：從 KV 讀取該 sessionId 的資料
        const sessionData = await kv.get(`session:${sessionId}`);

        // 檢查該 Session 是否真的被手機掃碼授權過
        if (!sessionData || sessionData.address.toLowerCase() !== address.toLowerCase()) {
            return res.status(403).json({ error: "尚未通過門禁驗證" });
        }

        // 驗證成功 -> 執行開獎
        const resultSide = Math.random() > 0.5 ? "heads" : "tails";
        const isWin = (choice === resultSide);

        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const wallet = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY, provider);
        const contract = new ethers.Contract(CONTRACT_ADDRESS, [
            "function mint(address to, uint256 amount) public",
            "function adminTransfer(address from, address to, uint256 amount) public"
        ], wallet);

        let tx;
        if (isWin) {
            // 贏了：Mint 給你 (2倍)
            tx = await contract.mint(address, ethers.parseUnits((parseFloat(amount) * 2).toString(), 18));
        } else {
            // 輸了：直接銷毀你的賭注
            tx = await contract.adminTransfer(address, "0x0000000000000000000000000000000000000000", ethers.parseUnits(amount, 18));
        }

        return res.status(200).json({ success: true, isWin, resultSide, txHash: tx.hash });

    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}