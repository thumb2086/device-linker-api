import { ethers } from "ethers";
import { verify } from "crypto";
import { CONTRACT_ADDRESS, RPC_URL } from "./config.js";

// 暫存遊戲結果，供網頁輪詢
let gameResults = {};

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (req.method === 'GET') {
        const { sessionId } = req.query;
        return res.status(200).json(gameResults[sessionId] || { status: "waiting" });
    }

    if (req.method === 'POST') {
        const { address, amount, choice, signature, publicKey, sessionId } = req.body;

        try {
            // 1. 驗證簽名 (標準：coinflip:{choice}:{amount})
            const cleanAmount = amount.toString().replace(/\.0$/, "");
            const message = `coinflip:${choice}:${cleanAmount}`;
            const isVerified = verify(
                "sha256",
                Buffer.from(message, 'utf-8'),
                { key: `-----BEGIN PUBLIC KEY-----\n${publicKey}\n-----END PUBLIC KEY-----` },
                Buffer.from(signature, 'base64')
            );

            if (!isVerified) return res.status(400).json({ error: "簽名無效" });

            // 2. 開獎
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
                // 贏了：Mint 兩倍獎金
                tx = await contract.mint(address, ethers.parseUnits((parseFloat(amount) * 2).toString(), 18));
            } else {
                // 輸了：直接 Burn 掉 (轉給 0 地址)
                tx = await contract.adminTransfer(address, "0x0000000000000000000000000000000000000000", ethers.parseUnits(amount, 18));
            }

            const finalData = { status: "finished", isWin, resultSide, txHash: tx.hash };
            if (sessionId) gameResults[sessionId] = finalData;

            return res.status(200).json(finalData);

        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    }
}