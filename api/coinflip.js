import { kv } from '@vercel/kv';
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "./config.js";

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // 從 Body 拿到 sessionId
    const { address, amount, choice, sessionId } = req.body;

    try {
        if (!sessionId) return res.status(400).json({ error: "缺少會話 ID" });

        // 🚀 關鍵修改：檢查 KV 資料庫，看看這個 sessionId 是否已經在手機端登入過了
        const sessionData = await kv.get(`session:${sessionId}`);

        if (!sessionData || sessionData.address.toLowerCase() !== address.toLowerCase()) {
            return res.status(403).json({ error: "尚未授權登入或會話已過期" });
        }

        // 2. 直接開獎 (因為已經通過登入驗證，我們信任這個網頁請求)
        const resultSide = Math.random() > 0.5 ? "heads" : "tails";
        const isWin = (choice === resultSide);

        // 3. 區塊鏈操作
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const wallet = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY, provider);
        const contract = new ethers.Contract(CONTRACT_ADDRESS, [
            "function mint(address to, uint256 amount) public",
            "function adminTransfer(address from, address to, uint256 amount) public"
        ], wallet);

        let tx;
        if (isWin) {
            tx = await contract.mint(address, ethers.parseUnits((parseFloat(amount) * 2).toString(), 18));
        } else {
            tx = await contract.adminTransfer(address, "0x0000000000000000000000000000000000000000", ethers.parseUnits(amount, 18));
        }

        // 存入結果讓網頁顯示
        const gameResult = { status: "finished", isWin, resultSide, txHash: tx.hash };
        return res.status(200).json(gameResult);

    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}