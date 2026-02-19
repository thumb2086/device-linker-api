import { kv } from '@vercel/kv';
import { ethers } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "./config.js";

// 將耗時的區塊鏈操作獨立出來，避免 Vercel 請求超時
async function executeBlockchainTransaction(address, amount, isWin, txHashCallback) {
    try {
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const wallet = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY, provider);
        const contract = new ethers.Contract(CONTRACT_ADDRESS, [
            "function mint(address to, uint256 amount) public",
            "function adminTransfer(address from, address to, uint256 amount) public"
        ], wallet);

        const betWei = ethers.parseUnits(amount.toString(), 18);
        let tx;

        if (isWin) {
            const winAmountWei = (betWei * 180n) / 100n; // 1.8x
            tx = await contract.mint(address, winAmountWei, { gasLimit: 250000 });
        } else {
            const burnAddress = "0x000000000000000000000000000000000000dEaD";
            tx = await contract.adminTransfer(address, burnAddress, betWei, { gasLimit: 250000 });
        }

        // 觸發回調，讓前端可以先拿到 txHash
        txHashCallback(tx.hash);

        // 在背景等待確認
        await tx.wait();
        console.log(`交易 ${tx.hash} 已在鏈上確認`);

    } catch (e) {
        console.error(`背景交易失敗:`, e.reason || e.message);
    }
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();

    const { address, amount, choice, sessionId } = req.body;

    try {
        const sessionData = await kv.get(`session:${sessionId}`);
        if (!sessionData) return res.status(403).json({ error: "會話過期" });

        // 1. 立刻開獎
        const resultSide = Math.random() > 0.5 ? "heads" : "tails";
        const isWin = (choice === resultSide);

        // 2. 更新累計數據
        const totalBet = await kv.incrbyfloat(`total_bet:${address.toLowerCase()}`, parseFloat(amount));
        const vipLevel = totalBet >= 1000 ? "👑 鑽石 VIP" : (totalBet >= 500 ? "🥇 黃金會員" : (totalBet >= 100 ? "🥈 白銀會員" : "普通會員"));

        // 3. 🚀 非同步執行區塊鏈交易
        // 我們不等待它完成，直接進入下一步
        let tempTxHash = "";
        executeBlockchainTransaction(address, amount, isWin, (hash) => {
            tempTxHash = hash;
        }).catch(console.error);

        // 4. 立刻回傳開獎結果給前端
        // 讓前端可以先轉硬幣
        return res.status(200).json({
            status: "processing",
            isWin,
            resultSide,
            totalBet: totalBet.toFixed(2),
            vipLevel,
            // 這裡可能還拿不到 txHash，但沒關係，前端體驗優先
            txHash: null
        });

    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}